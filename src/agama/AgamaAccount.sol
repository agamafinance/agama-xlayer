// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IArrowPool} from "../interfaces/IArrowPool.sol";
import {IArrowAdapter} from "../arrow/adapters/IArrowAdapter.sol";
import {ArrowVaultShareAdapter} from "../arrow/adapters/ArrowVaultShareAdapter.sol";
import {IagUSDQueue} from "../vault/interfaces/IagUSDQueue.sol";

interface IAgamaAccountFactory {
    function isRouter(address router) external view returns (bool);
}

/// @title AgamaAccount
/// @notice One account per user (EIP-1167 clone). The account is the
///         borrower of record in the Arrow lending pool, so every position is
///         isolated per user and fully readable on-chain.
///
///         EARN ON YOUR STOCKS
///           stock in -> Arrow borrow USDG at the chosen LTV -> USDG into the
///           Agama vault. The vault shares stay in the account as a FREE
///           buffer (not pledged). If the stock falls, `softDeleverage`
///           (callable by anyone once HF < 1.15) redeems those shares and
///           repays debt back to HF 1.40. The stock is only touched if the
///           yield buffer is gone.
///
///         AMPLIFY
///           USDG in -> vault shares -> pledged in Arrow -> borrow USDG ->
///           vault -> pledge ... until the target leverage (max 3x). Close
///           unwinds in the same loop in reverse. `autoUnwind` (anyone) takes
///           the position back to 1x when the Arrow borrow rate plus a 1%
///           buffer exceeds the vault's realized APY: a loop with negative
///           carry is never left running.
///
/// @dev    Protocol addresses are immutables of the implementation, shared
///         by every clone. Entry points take `user` and accept calls from
///         the owner directly or from a router registered in the factory
///         that forwards its own `msg.sender`.
contract AgamaAccount is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant RAY = 1e27;
    uint256 internal constant BPS = 10_000;
    uint256 public constant SOFT_TRIGGER_HF = 1.15e27;
    uint256 public constant SOFT_TARGET_HF = 1.4e27;
    uint256 public constant MAX_LEVERAGE_BPS = 30_000;
    uint256 public constant SPREAD_BUFFER_RAY = 0.01e27;
    uint256 internal constant MAX_LOOPS = 24;

    IArrowPool public immutable POOL;
    IERC20 public immutable USDG;
    IagUSDQueue public immutable QUEUE;
    IERC4626 public immutable VAULT; // sagUSD
    IERC20 public immutable AGUSD;
    ArrowVaultShareAdapter public immutable VAULT_ADAPTER;
    uint256 internal immutable AG_PER_USDG; // 1e12

    address public owner;
    address public factory;

    /// @notice Stock markets this account has used for Earn. Lets Amplify
    ///         know whether its equity is backing an Earn position.
    address[] public earnMarkets;
    mapping(address adapter => bool) public isEarnMarket;

    event EarnOpened(address indexed adapter, uint256 stockAmount, uint256 borrowed, uint256 shares);
    event EarnClosed(address indexed adapter, uint256 repaid, uint256 stockReturned);
    event SoftDeleveraged(address indexed caller, address indexed adapter, uint256 repaid, uint256 hfAfter);
    event AmplifyOpened(uint256 equityUsdg, uint256 debt, uint256 pledgedShares, uint256 loops);
    event AmplifyClosed(uint256 repaid, uint256 sharesOut, uint256 usdgOut, bool keptForEarn);
    event AutoUnwound(address indexed caller, uint256 borrowRateRay, uint256 vaultApyRay);

    error AlreadyInitialized();
    error NotAuthorized();
    error HealthFactorOk(uint256 hf);
    error NothingToDeleverage();
    error RedemptionQueued(uint256 requestId);
    error LeverageOutOfRange();
    error Underwater();
    error UnwindIncomplete(uint256 debtLeft);
    error SpreadPositive(uint256 borrowRateRay, uint256 vaultApyRay);
    error InsufficientToRepay(uint256 shortfall);

    constructor(IArrowPool pool, IagUSDQueue queue, IERC4626 vault, ArrowVaultShareAdapter vaultAdapter) {
        POOL = pool;
        USDG = IERC20(pool.asset());
        QUEUE = queue;
        VAULT = vault;
        AGUSD = IERC20(vault.asset());
        VAULT_ADAPTER = vaultAdapter;
        AG_PER_USDG = vaultAdapter.ASSET_TO_POOL();
        owner = address(0xdead); // the implementation itself is unusable
    }

    function initialize(address owner_) external {
        if (owner != address(0)) revert AlreadyInitialized();
        owner = owner_;
        factory = msg.sender;
    }

    modifier auth(address user) {
        if (user != owner) revert NotAuthorized();
        if (msg.sender != owner && !IAgamaAccountFactory(factory).isRouter(msg.sender)) {
            revert NotAuthorized();
        }
        _;
    }

    // =====================================================================
    //                              EARN
    // =====================================================================

    /// @notice Stock tokens must already be in the account (the router moves them).
    function earnOpen(address user, address stockAdapter, uint256 stockAmount, uint256 borrowAmount)
        external
        nonReentrant
        auth(user)
    {
        _ensurePoolPosition();
        _recordEarnMarket(stockAdapter);
        IERC20 stock = IERC20(IArrowAdapter(stockAdapter).getAssetToken());
        stock.forceApprove(stockAdapter, stockAmount);
        POOL.depositAsset(stockAdapter, abi.encode(stockAmount));
        uint256 shares;
        if (borrowAmount > 0) {
            POOL.borrow(stockAdapter, "", borrowAmount);
            shares = _toVault(borrowAmount);
        }
        emit EarnOpened(stockAdapter, stockAmount, borrowAmount, shares);
    }

    /// @notice Add stock collateral (tokens already in the account).
    function earnAddCollateral(address user, address stockAdapter, uint256 amount)
        external
        nonReentrant
        auth(user)
    {
        _ensurePoolPosition();
        _recordEarnMarket(stockAdapter);
        IERC20(IArrowAdapter(stockAdapter).getAssetToken()).forceApprove(stockAdapter, amount);
        POOL.depositAsset(stockAdapter, abi.encode(amount));
    }

    /// @notice Repay everything on `stockAdapter` (USDG already in the
    ///         account first, then the free vault shares), return the stock,
    ///         and send leftovers to the owner. If the shares do not cover
    ///         the debt (after a soft deleverage, or when interest outran the
    ///         vault yield), reverts with the exact shortfall: the router's
    ///         `closeWithTopUp` brings it from the owner's wallet.
    function earnClose(address user, address stockAdapter) external nonReentrant auth(user) {
        uint256 debt = POOL.getPositionScaledDebt(stockAdapter, address(this), "");
        uint256 repaid;
        if (debt > 0) {
            uint256 have = USDG.balanceOf(address(this));
            if (have < debt) _redeemForUsdg(debt - have);
            uint256 cash = USDG.balanceOf(address(this));
            if (cash < debt) revert InsufficientToRepay(debt - cash);
            USDG.forceApprove(address(POOL), debt);
            repaid = POOL.repay(stockAdapter, "", type(uint256).max);
        }
        uint256 bal = IArrowAdapter(stockAdapter).getInternalBalance(address(this), "");
        if (bal > 0) POOL.withdrawAsset(stockAdapter, abi.encode(bal));
        IERC20 stock = IERC20(IArrowAdapter(stockAdapter).getAssetToken());
        stock.safeTransfer(owner, stock.balanceOf(address(this)));
        _sweepFree();
        emit EarnClosed(stockAdapter, repaid, bal);
    }

    /// @notice Permissionless protection. Below HF 1.15 anyone can make the
    ///         account redeem its FREE vault shares to repay debt back to
    ///         HF 1.40. The stock is not sold.
    function softDeleverage(address stockAdapter) external nonReentrant returns (uint256 repaid) {
        uint256 hf = POOL.calculateHealthFactor(stockAdapter, address(this), "");
        if (hf >= SOFT_TRIGGER_HF) revert HealthFactorOk(hf);

        uint256 debt = POOL.getPositionScaledDebt(stockAdapter, address(this), "");
        uint256 value = IArrowAdapter(stockAdapter).getAssetValue(address(this), "");
        uint256 lt = IArrowAdapter(stockAdapter).LIQUIDATION_THRESHOLD();
        uint256 targetDebt = Math.mulDiv(value * lt, RAY, BPS * SOFT_TARGET_HF);
        uint256 wanted = debt > targetDebt ? debt - targetDebt : 0;

        uint256 freeValue = VAULT_ADAPTER.valueOf(VAULT.balanceOf(address(this)));
        uint256 cash = USDG.balanceOf(address(this));
        uint256 amount = Math.min(wanted, freeValue + cash);
        if (amount == 0) revert NothingToDeleverage();

        if (cash < amount) _redeemForUsdg(amount - cash);
        repaid = Math.min(amount, USDG.balanceOf(address(this)));
        USDG.forceApprove(address(POOL), repaid);
        POOL.repay(stockAdapter, "", repaid);
        emit SoftDeleveraged(
            msg.sender, stockAdapter, repaid, POOL.calculateHealthFactor(stockAdapter, address(this), "")
        );
    }

    // =====================================================================
    //                             AMPLIFY
    // =====================================================================

    /// @notice Loop the vault up to `leverageBps` (10_000 = 1x, 30_000 = 3x).
    /// @param usdgAmount USDG already moved into the account by the router.
    /// @param useFreeShares Also pledge the account's free shares (Earn
    ///        buffer). Stacks Amplify on top of Earn; the Earn position then
    ///        loses its soft-deleverage buffer.
    function amplifyOpen(address user, uint256 usdgAmount, bool useFreeShares, uint256 leverageBps)
        external
        nonReentrant
        auth(user)
        returns (uint256 debt)
    {
        if (leverageBps < BPS || leverageBps > MAX_LEVERAGE_BPS) revert LeverageOutOfRange();
        _ensurePoolPosition();
        address va = address(VAULT_ADAPTER);

        uint256 toPledge = usdgAmount > 0 ? _toVault(usdgAmount) : 0;
        if (useFreeShares) toPledge = VAULT.balanceOf(address(this));
        _pledge(toPledge);

        debt = POOL.getPositionScaledDebt(va, address(this), "");
        uint256 fair = VAULT_ADAPTER.valueOf(VAULT_ADAPTER.balanceOf(address(this)));
        if (fair <= debt) revert Underwater();
        uint256 equity = fair - debt;
        uint256 targetDebt = (equity * (leverageBps - BPS)) / BPS;
        uint256 minBorrow = POOL.minBorrowAmount();

        uint256 loops;
        for (; loops < MAX_LOOPS && debt < targetDebt; ++loops) {
            uint256 cap = (VAULT_ADAPTER.getAssetValue(address(this), "") * VAULT_ADAPTER.MAX_LTV()) / BPS;
            if (cap <= debt) break;
            uint256 capacity = ((cap - debt) * 995) / 1000;
            uint256 b = Math.min(targetDebt - debt, capacity);
            if (b < minBorrow) break;
            POOL.borrow(va, "", b);
            _pledge(_toVault(b));
            debt += b;
        }
        debt = POOL.getPositionScaledDebt(va, address(this), "");
        emit AmplifyOpened(equity, debt, VAULT_ADAPTER.balanceOf(address(this)), loops);
    }

    /// @notice Unwind the loop and send the equity to the owner, as USDG if
    ///         `redeem` (needs instant liquidity in the vault reserve), as
    ///         vault shares otherwise.
    ///         If an Earn position is still open, the equity stays in the
    ///         account as free vault shares instead: it was the Earn buffer
    ///         before `openFromEarn`, and it goes back to being the buffer.
    function amplifyClose(address user, bool redeem) external nonReentrant auth(user) {
        uint256 repaid = _unwind();
        bool keep = hasEarnDebt();
        (uint256 sharesOut, uint256 usdgOut) = keep ? _unpledgeAll() : _releasePledge(redeem);
        emit AmplifyClosed(repaid, sharesOut, usdgOut, keep);
    }

    /// @notice Permissionless spread guard: if Arrow's borrow rate + 1% is
    ///         above the vault's realized APY, the loop is taken back to 1x.
    ///         Equity stays in the account as free vault shares.
    function autoUnwind() external nonReentrant {
        uint256 apy = VAULT_ADAPTER.realizedApyRay();
        uint256 borrowRate = POOL.getReserveState().currentBorrowRate;
        // apy == 0 means no measured yield yet: do not let anyone unwind blind.
        if (apy == 0 || borrowRate + SPREAD_BUFFER_RAY <= apy) revert SpreadPositive(borrowRate, apy);
        _unwind();
        uint256 bal = VAULT_ADAPTER.balanceOf(address(this));
        if (bal > 0) POOL.withdrawAsset(address(VAULT_ADAPTER), abi.encode(bal));
        emit AutoUnwound(msg.sender, borrowRate, apy);
    }

    // =====================================================================
    //                              OWNER
    // =====================================================================

    /// @notice Owner pulls free tokens (never pledged collateral) out of the account.
    function sweep(IERC20 token) external nonReentrant {
        if (msg.sender != owner) revert NotAuthorized();
        token.safeTransfer(owner, token.balanceOf(address(this)));
    }

    // =====================================================================
    //                              VIEWS
    // =====================================================================

    /// @notice True while any Earn market of this account carries debt.
    function hasEarnDebt() public view returns (bool) {
        for (uint256 i; i < earnMarkets.length; ++i) {
            if (POOL.getPositionScaledDebt(earnMarkets[i], address(this), "") > 0) return true;
        }
        return false;
    }

    function earnMarketCount() external view returns (uint256) {
        return earnMarkets.length;
    }

    function freeShares() external view returns (uint256) {
        return VAULT.balanceOf(address(this));
    }

    function freeSharesValue() external view returns (uint256) {
        return VAULT_ADAPTER.valueOf(VAULT.balanceOf(address(this)));
    }

    /// @notice USDG the account can raise right now for a repayment: cash plus
    ///         free shares at the live redemption rate (what the queue pays).
    function redeemableUsdg() public view returns (uint256) {
        uint256 shares = VAULT.balanceOf(address(this));
        uint256 fromShares = shares == 0 ? 0 : VAULT.convertToAssets(shares) / AG_PER_USDG;
        return USDG.balanceOf(address(this)) + fromShares;
    }

    // =====================================================================
    //                            INTERNALS
    // =====================================================================

    function _ensurePoolPosition() internal {
        if (!POOL.vaultOpened(address(this))) POOL.openVaultPosition();
    }

    function _toVault(uint256 usdg) internal returns (uint256 shares) {
        USDG.forceApprove(address(QUEUE), usdg);
        uint256 agOut = QUEUE.deposit(usdg, address(this));
        AGUSD.forceApprove(address(VAULT), agOut);
        shares = VAULT.deposit(agOut, address(this));
    }

    function _pledge(uint256 shares) internal {
        if (shares == 0) return;
        IERC20(address(VAULT)).forceApprove(address(VAULT_ADAPTER), shares);
        POOL.depositAsset(address(VAULT_ADAPTER), abi.encode(shares));
    }

    /// @dev Redeem enough FREE shares to receive at least `usdgWanted`
    ///      (capped by what the account holds). Instant path only.
    function _redeemForUsdg(uint256 usdgWanted) internal returns (uint256 usdgOut) {
        uint256 shares = VAULT.previewWithdraw(usdgWanted * AG_PER_USDG);
        uint256 bal = VAULT.balanceOf(address(this));
        if (shares > bal) shares = bal;
        usdgOut = _redeemShares(shares);
    }

    function _redeemShares(uint256 shares) internal returns (uint256 usdgOut) {
        if (shares == 0) return 0;
        uint256 agOut = VAULT.redeem(shares, address(this), address(this));
        AGUSD.forceApprove(address(QUEUE), agOut);
        uint256 before = USDG.balanceOf(address(this));
        uint256 requestId = QUEUE.requestRedemption(agOut, address(this));
        if (requestId != 0) revert RedemptionQueued(requestId);
        usdgOut = USDG.balanceOf(address(this)) - before;
    }

    /// @dev Reverse loop: withdraw as many pledged shares as HF allows,
    ///      redeem, repay, repeat.
    function _unwind() internal returns (uint256 repaid) {
        address va = address(VAULT_ADAPTER);
        uint256 lt = VAULT_ADAPTER.LIQUIDATION_THRESHOLD();
        uint256 haircut = VAULT_ADAPTER.HAIRCUT_BPS();
        for (uint256 i; i < MAX_LOOPS; ++i) {
            uint256 debt = POOL.getPositionScaledDebt(va, address(this), "");
            if (debt == 0) return repaid;

            uint256 cash = USDG.balanceOf(address(this));
            if (cash > 0) {
                uint256 p = Math.min(cash, debt);
                USDG.forceApprove(address(POOL), p);
                repaid += POOL.repay(va, "", p);
                continue;
            }

            uint256 bal = VAULT_ADAPTER.balanceOf(address(this));
            uint256 v = VAULT_ADAPTER.getAssetValue(address(this), "");
            uint256 minCollat = Math.mulDiv(debt, BPS, lt, Math.Rounding.Ceil);
            if (v <= minCollat) revert Underwater();
            uint256 maxW = ((v - minCollat) * 99) / 100;
            // Haircut value needed to redeem `debt` USDG, plus 0.5% slack.
            uint256 needW = (debt * (BPS - haircut) * 1005) / (BPS * 1000);
            uint256 w = Math.min(maxW, needW);
            uint256 shares = Math.mulDiv(bal, w, v);
            if (shares == 0) revert Underwater();
            POOL.withdrawAsset(va, abi.encode(shares));
            _redeemShares(shares);
        }
        uint256 left = POOL.getPositionScaledDebt(va, address(this), "");
        if (left > 0) revert UnwindIncomplete(left);
    }

    function _recordEarnMarket(address adapter) internal {
        if (isEarnMarket[adapter]) return;
        isEarnMarket[adapter] = true;
        earnMarkets.push(adapter);
    }

    /// @dev Pledged shares back to the account as free shares (Earn buffer).
    function _unpledgeAll() internal returns (uint256 sharesKept, uint256 usdgKept) {
        uint256 bal = VAULT_ADAPTER.balanceOf(address(this));
        if (bal > 0) POOL.withdrawAsset(address(VAULT_ADAPTER), abi.encode(bal));
        sharesKept = VAULT.balanceOf(address(this));
        usdgKept = USDG.balanceOf(address(this));
    }

    function _releasePledge(bool redeem) internal returns (uint256 sharesOut, uint256 usdgOut) {
        uint256 bal = VAULT_ADAPTER.balanceOf(address(this));
        if (bal > 0) POOL.withdrawAsset(address(VAULT_ADAPTER), abi.encode(bal));
        if (redeem) {
            _redeemShares(bal);
        } else {
            sharesOut = bal;
            IERC20(address(VAULT)).safeTransfer(owner, bal);
        }
        usdgOut = USDG.balanceOf(address(this));
        if (usdgOut > 0) USDG.safeTransfer(owner, usdgOut);
    }

    function _sweepFree() internal {
        uint256 s = VAULT.balanceOf(address(this));
        if (s > 0) IERC20(address(VAULT)).safeTransfer(owner, s);
        uint256 u = USDG.balanceOf(address(this));
        if (u > 0) USDG.safeTransfer(owner, u);
    }
}
