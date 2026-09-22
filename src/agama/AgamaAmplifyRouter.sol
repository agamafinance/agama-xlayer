// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {AgamaAccount} from "./AgamaAccount.sol";
import {AgamaAccountFactory} from "./AgamaAccountFactory.sol";
import {ArrowVaultShareAdapter} from "../arrow/adapters/ArrowVaultShareAdapter.sol";
import {IArrowPool} from "../interfaces/IArrowPool.sol";

/// @title AgamaAmplifyRouter
/// @notice Amplify: the Agama vault yield, looped on Arrow, capped at 3x.
///
///         net APY = vaultAPY + (L - 1) * (vaultAPY - borrowAPR)
///
///         Break-even is borrowAPR = vaultAPY; every extra point of borrow
///         rate costs (L - 1) points. `AgamaAccount.autoUnwind` enforces the
///         spread guard on-chain.
contract AgamaAmplifyRouter {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant RAY = 1e27;

    AgamaAccountFactory public immutable FACTORY;
    IArrowPool public immutable POOL;
    ArrowVaultShareAdapter public immutable VAULT_ADAPTER;
    IERC20 public immutable USDG;

    event Opened(address indexed user, uint256 usdg, uint256 leverageBps, uint256 debt);
    event Closed(address indexed user, bool redeemed);

    constructor(AgamaAccountFactory factory, IArrowPool pool, ArrowVaultShareAdapter vaultAdapter) {
        FACTORY = factory;
        POOL = pool;
        VAULT_ADAPTER = vaultAdapter;
        USDG = IERC20(pool.asset());
    }

    /// @param usdg        USDG to put to work.
    /// @param leverageBps 10_000 = 1x ... 30_000 = 3x.
    function open(uint256 usdg, uint256 leverageBps) external returns (uint256 debt) {
        address account = FACTORY.getOrCreate(msg.sender);
        USDG.safeTransferFrom(msg.sender, account, usdg);
        debt = AgamaAccount(account).amplifyOpen(msg.sender, usdg, false, leverageBps);
        emit Opened(msg.sender, usdg, leverageBps, debt);
    }

    /// @notice Stack Amplify on the vault shares an Earn position produced.
    function openFromEarn(uint256 leverageBps) external returns (uint256 debt) {
        address account = FACTORY.accountOf(msg.sender);
        debt = AgamaAccount(account).amplifyOpen(msg.sender, 0, true, leverageBps);
        emit Opened(msg.sender, 0, leverageBps, debt);
    }

    function close(bool redeemToUsdg) external {
        AgamaAccount(FACTORY.accountOf(msg.sender)).amplifyClose(msg.sender, redeemToUsdg);
        emit Closed(msg.sender, redeemToUsdg);
    }

    // ---- Views for the front ------------------------------------------------------

    /// @notice Net APY at `leverageBps` for a given vault APY (RAY), using
    ///         the live Arrow borrow rate. Signed: a negative carry shows.
    function netApyRay(uint256 vaultApyRay, uint256 leverageBps) public view returns (int256) {
        int256 borrowRate = int256(POOL.getReserveState().currentBorrowRate);
        int256 v = int256(vaultApyRay);
        int256 extra = int256(leverageBps) - int256(BPS);
        return v + (extra * (v - borrowRate)) / int256(BPS);
    }

    struct Position {
        address account;
        uint256 pledgedShares;
        uint256 exposure; // USDG units, fair value of pledged shares
        uint256 debt;
        uint256 equity;
        uint256 leverageBps;
        uint256 healthFactorRay;
        uint256 borrowRateRay;
        uint256 vaultApyRay;
    }

    function position(address user) external view returns (Position memory p) {
        p.account = FACTORY.accountOf(user);
        p.borrowRateRay = POOL.getReserveState().currentBorrowRate;
        p.vaultApyRay = VAULT_ADAPTER.realizedApyRay();
        if (p.account == address(0)) return p;
        p.pledgedShares = VAULT_ADAPTER.balanceOf(p.account);
        p.exposure = VAULT_ADAPTER.valueOf(p.pledgedShares);
        p.debt = POOL.getPositionScaledDebt(address(VAULT_ADAPTER), p.account, "");
        p.equity = p.exposure > p.debt ? p.exposure - p.debt : 0;
        p.leverageBps = p.equity == 0 ? 0 : (p.exposure * BPS) / p.equity;
        p.healthFactorRay = POOL.calculateHealthFactor(address(VAULT_ADAPTER), p.account, "");
    }
}
