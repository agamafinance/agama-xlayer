// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {AgamaAccount} from "./AgamaAccount.sol";
import {AgamaAccountFactory} from "./AgamaAccountFactory.sol";
import {IArrowAdapter} from "../arrow/adapters/IArrowAdapter.sol";
import {IArrowPool} from "../interfaces/IArrowPool.sol";

/// @title AgamaEarnRouter
/// @notice "Earn on your stocks", one transaction each way.
///
///         open:  wrapped xStock in -> Arrow borrow USDG at `ltvBps` of the
///                stock value -> USDG into the Agama vault. The user keeps
///                the stock exposure and earns (vault APY - borrow APR) on
///                the borrowed amount.
///         close: repay from the vault shares, stock back to the wallet,
///                leftover yield sent as vault shares.
contract AgamaEarnRouter is AccessControl {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;

    AgamaAccountFactory public immutable FACTORY;
    IArrowPool public immutable POOL;
    IERC20 public immutable USDG;

    event Opened(
        address indexed user, address indexed adapter, uint256 amount, uint256 ltvBps, uint256 borrowed
    );
    event Closed(address indexed user, address indexed adapter);

    error LtvTooHigh(uint256 ltvBps, uint256 maxLtvBps);
    error MarketClosed();
    error NotAZap(address caller);

    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");

    /// @notice Contracts allowed to open a position on behalf of a user
    ///         (AgamaZapRouter: buy the stock and open Earn in one call).
    mapping(address zap => bool) public isZap;

    event ZapSet(address indexed zap, bool allowed);

    constructor(AgamaAccountFactory factory, IArrowPool pool, address admin) {
        FACTORY = factory;
        POOL = pool;
        USDG = IERC20(pool.asset());
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE, admin);
    }

    function setZap(address zap, bool allowed) external onlyRole(GOVERNOR_ROLE) {
        isZap[zap] = allowed;
        emit ZapSet(zap, allowed);
    }

    /// @param adapter Arrow xStock adapter (e.g. the wTSLAx market).
    /// @param amount  Wrapped xStock amount (18 decimals).
    /// @param ltvBps  Borrow as a share of the stock value (2_500 = 25%).
    function open(address adapter, uint256 amount, uint256 ltvBps) external returns (uint256 borrowed) {
        uint256 maxLtv = IArrowAdapter(adapter).MAX_LTV();
        if (ltvBps > maxLtv) revert LtvTooHigh(ltvBps, maxLtv);
        if (ltvBps > 0 && !IArrowAdapter(adapter).borrowAllowed()) revert MarketClosed();
        address account = FACTORY.getOrCreate(msg.sender);
        IERC20(IArrowAdapter(adapter).getAssetToken()).safeTransferFrom(msg.sender, account, amount);
        borrowed = (IArrowAdapter(adapter).valueOf(amount) * ltvBps) / BPS;
        AgamaAccount(account).earnOpen(msg.sender, adapter, amount, borrowed);
        emit Opened(msg.sender, adapter, amount, ltvBps, borrowed);
    }

    /// @notice Same as `open`, for `user`, called by an allowlisted zap that
    ///         already holds the stock tokens. The position belongs to `user`.
    function openFor(address user, address adapter, uint256 amount, uint256 ltvBps)
        external
        returns (uint256 borrowed)
    {
        if (!isZap[msg.sender]) revert NotAZap(msg.sender);
        uint256 maxLtv = IArrowAdapter(adapter).MAX_LTV();
        if (ltvBps > maxLtv) revert LtvTooHigh(ltvBps, maxLtv);
        if (ltvBps > 0 && !IArrowAdapter(adapter).borrowAllowed()) revert MarketClosed();
        address account = FACTORY.getOrCreate(user);
        IERC20(IArrowAdapter(adapter).getAssetToken()).safeTransferFrom(msg.sender, account, amount);
        borrowed = (IArrowAdapter(adapter).valueOf(amount) * ltvBps) / BPS;
        AgamaAccount(account).earnOpen(user, adapter, amount, borrowed);
        emit Opened(user, adapter, amount, ltvBps, borrowed);
    }

    function addCollateral(address adapter, uint256 amount) external {
        address account = FACTORY.getOrCreate(msg.sender);
        IERC20(IArrowAdapter(adapter).getAssetToken()).safeTransferFrom(msg.sender, account, amount);
        AgamaAccount(account).earnAddCollateral(msg.sender, adapter, amount);
    }

    function close(address adapter) external {
        AgamaAccount(FACTORY.accountOf(msg.sender)).earnClose(msg.sender, adapter);
        emit Closed(msg.sender, adapter);
    }

    /// @notice Close in one transaction even when the vault shares no longer
    ///         cover the debt: pulls the shortfall (plus a 0.01% margin for
    ///         interest accrued before inclusion) from the caller, capped by
    ///         `maxTopUp`. Anything unused comes back with the leftovers.
    function closeWithTopUp(address adapter, uint256 maxTopUp) external returns (uint256 toppedUp) {
        address account = FACTORY.accountOf(msg.sender);
        uint256 short = closeShortfall(msg.sender, adapter);
        if (short > 0) {
            toppedUp = short > maxTopUp ? maxTopUp : short;
            USDG.safeTransferFrom(msg.sender, account, toppedUp);
        }
        AgamaAccount(account).earnClose(msg.sender, adapter);
        emit Closed(msg.sender, adapter);
    }

    /// @notice USDG the owner must add for `close` to succeed now (0 if none).
    function closeShortfall(address user, address adapter) public view returns (uint256) {
        address account = FACTORY.accountOf(user);
        if (account == address(0)) return 0;
        uint256 debt = POOL.getPositionScaledDebt(adapter, account, "");
        uint256 have = AgamaAccount(account).redeemableUsdg();
        if (have >= debt) return 0;
        return debt - have + debt / 10_000 + 1;
    }

    // ---- Views for the front ------------------------------------------------------

    /// @notice What `open` would borrow, and the HF right after.
    function quote(address adapter, uint256 amount, uint256 ltvBps)
        external
        view
        returns (uint256 stockValue, uint256 borrow, uint256 hfRay)
    {
        stockValue = IArrowAdapter(adapter).valueOf(amount);
        borrow = (stockValue * ltvBps) / BPS;
        hfRay = borrow == 0
            ? type(uint256).max
            : (stockValue * IArrowAdapter(adapter).LIQUIDATION_THRESHOLD() * 1e27) / (borrow * BPS);
    }

    struct Position {
        address account;
        uint256 collateral; // wrapped xStock units
        uint256 collateralValue; // USDG units
        uint256 debt; // USDG units
        uint256 healthFactorRay;
        uint256 freeShares;
        uint256 freeSharesValue; // USDG units
        bool borrowAllowed;
        uint256 liquidationThresholdBps;
    }

    function position(address user, address adapter) external view returns (Position memory p) {
        p.account = FACTORY.accountOf(user);
        p.borrowAllowed = IArrowAdapter(adapter).borrowAllowed();
        p.liquidationThresholdBps = IArrowAdapter(adapter).LIQUIDATION_THRESHOLD();
        if (p.account == address(0)) return p;
        p.collateral = IArrowAdapter(adapter).getInternalBalance(p.account, "");
        try IArrowAdapter(adapter).valueOf(p.collateral) returns (uint256 v) {
            p.collateralValue = v;
        } catch {}
        p.debt = POOL.getPositionScaledDebt(adapter, p.account, "");
        try POOL.calculateHealthFactor(adapter, p.account, "") returns (uint256 hf) {
            p.healthFactorRay = hf;
        } catch {}
        p.freeShares = AgamaAccount(p.account).freeShares();
        p.freeSharesValue = AgamaAccount(p.account).freeSharesValue();
    }
}
