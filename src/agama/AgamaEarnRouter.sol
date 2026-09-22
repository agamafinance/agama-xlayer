// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
contract AgamaEarnRouter {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;

    AgamaAccountFactory public immutable FACTORY;
    IArrowPool public immutable POOL;

    event Opened(address indexed user, address indexed adapter, uint256 amount, uint256 ltvBps, uint256 borrowed);
    event Closed(address indexed user, address indexed adapter);

    error LtvTooHigh(uint256 ltvBps, uint256 maxLtvBps);
    error MarketClosed();

    constructor(AgamaAccountFactory factory, IArrowPool pool) {
        FACTORY = factory;
        POOL = pool;
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

    function addCollateral(address adapter, uint256 amount) external {
        address account = FACTORY.getOrCreate(msg.sender);
        IERC20(IArrowAdapter(adapter).getAssetToken()).safeTransferFrom(msg.sender, account, amount);
        AgamaAccount(account).earnAddCollateral(msg.sender, adapter, amount);
    }

    function close(address adapter) external {
        AgamaAccount(FACTORY.accountOf(msg.sender)).earnClose(msg.sender, adapter);
        emit Closed(msg.sender, adapter);
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
