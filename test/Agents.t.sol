// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseFork} from "./Base.t.sol";
import {AgamaAccount} from "../src/agama/AgamaAccount.sol";
import {AgamaEarnRouter} from "../src/agama/AgamaEarnRouter.sol";
import {MockDexRouter} from "./Zap.t.sol";

/// The product the user asked for: deposit the stock and never touch it again.
/// Agents keep the position at the chosen level and turn the vault yield into
/// more stock. Everything here is permissionless, so anyone can run them.
contract AgentsForkTest is BaseFork {
    MockDexRouter router;

    function setUp() public override {
        super.setUp();
        router = new MockDexRouter(usdg, wtsla, uint256(1e18) * 1e6 / 420e6); // 1 wTSLAx per 420 USDG
        deal(W_TSLAX, address(router), 100e18);
        d.zap.setTarget(address(router), true);
        d.zap.setSpender(address(router), true);
    }

    function test_stockGoesUp_theAgentBorrowsMoreAndVaultsIt() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        assertEq(acct.targetLtvBps(address(d.tsla)), 2_500, "the LTV the user picked is remembered");

        uint256 debtBefore = d.earn.position(alice, address(d.tsla)).debt;
        _walkPrice("TSLA", 500e18, true); // TSLA 420 -> 500

        vm.prank(liquidator); // anyone can run the agent
        int256 delta = acct.rebalance(address(d.tsla));

        AgamaEarnRouter.Position memory p = d.earn.position(alice, address(d.tsla));
        assertGt(delta, 0, "borrowed more against a stock worth more");
        assertApproxEqRel(p.debt, (p.collateralValue * 2_500) / 10_000, 0.01e18, "back at 25% LTV");
        assertGt(p.debt, debtBefore);
        assertApproxEqRel(p.freeSharesValue, p.debt, 0.01e18, "the extra USDG went into the vault");
    }

    function test_stockGoesDown_theAgentRepaysFromTheYieldBuffer() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        _walkPrice("TSLA", 360e18, true);

        vm.prank(liquidator);
        int256 delta = acct.rebalance(address(d.tsla));

        AgamaEarnRouter.Position memory p = d.earn.position(alice, address(d.tsla));
        assertLt(delta, 0, "repaid without touching the stock");
        assertApproxEqRel(p.debt, (p.collateralValue * 2_500) / 10_000, 0.02e18, "back at 25% LTV");
        assertEq(p.collateral, 10e18, "the stock itself is never sold");
    }

    function test_insideTheBand_theAgentDoesNothing() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        vm.expectPartialRevert(AgamaAccount.AlreadyOnTarget.selector);
        acct.rebalance(address(d.tsla));
    }

    function test_onAClosedPosition_theAgentSaysSoInsteadOfPanicking() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        deal(address(usdg), alice, 10e6);
        vm.startPrank(alice);
        usdg.approve(address(d.earn), 10e6);
        d.earn.closeWithTopUp(address(d.tsla), 10e6);
        vm.stopPrank();

        // The target outlives the close, so a keeper sweeping every account will
        // land here. It must get the custom error, not a division by zero.
        vm.expectPartialRevert(AgamaAccount.AlreadyOnTarget.selector);
        acct.rebalance(address(d.tsla));
    }

    function test_theYieldComesBackAsMoreStock() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        uint256 stockBefore = d.tsla.balanceOf(address(acct));

        _settleYield(200e6); // the vault earns
        _warp(20 days); // let the CAPO ceiling catch up with the settled yield
        d.vaultAdapter.snapshot();
        // Compounding prices the stock it bought against the oracle, so the feed
        // has to be live: twenty days of warping made it stale.
        _pushAll(true);

        uint256 profit = acct.redeemableUsdg() - d.earn.position(alice, address(d.tsla)).debt;
        assertGt(profit, 1e6, "there is yield to compound");
        bytes memory swapData = abi.encodeCall(MockDexRouter.swap, (profit));

        vm.prank(liquidator); // anyone can run the agent
        uint256 added =
            acct.compoundIntoStock(address(d.tsla), profit, address(router), address(router), swapData, 1);

        assertGt(added, 0, "the yield bought stock");
        assertEq(d.tsla.balanceOf(address(acct)), stockBefore + added, "and it became collateral");
        // The user's stock grew: that is the whole promise.
        assertGt(d.earn.position(alice, address(d.tsla)).collateral, 10e18);
    }

    function test_compoundRefusesABadPriceEvenIfTheCallerAsksForIt() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        _settleYield(200e6);
        _warp(20 days);
        d.vaultAdapter.snapshot();
        _pushAll(true);

        // A router that pays a third of the going rate, and a caller who says
        // that is fine by passing a floor of 1. The account is not theirs.
        MockDexRouter bad = new MockDexRouter(usdg, wtsla, uint256(1e18) * 1e6 / 1_260e6);
        deal(W_TSLAX, address(bad), 100e18);
        d.zap.setTarget(address(bad), true);
        d.zap.setSpender(address(bad), true);

        uint256 profit = acct.redeemableUsdg() - d.earn.position(alice, address(d.tsla)).debt;
        bytes memory swapData = abi.encodeCall(MockDexRouter.swap, (profit));
        vm.prank(liquidator);
        vm.expectPartialRevert(AgamaAccount.CompoundPriceTooBad.selector);
        acct.compoundIntoStock(address(d.tsla), profit, address(bad), address(bad), swapData, 1);
    }

    function test_compoundNeverEatsTheBufferThatProtectsTheStock() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        // No yield settled yet: the free shares only cover the debt.
        vm.expectRevert(AgamaAccount.NothingToCompound.selector);
        acct.compoundIntoStock(address(d.tsla), 1e6, address(router), address(router), "", 1);
    }

    function test_compoundOnlyThroughAnAllowlistedRouter() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        _settleYield(200e6);
        address evil = makeAddr("evil");
        vm.expectRevert(abi.encodeWithSelector(AgamaAccount.SwapTargetNotAllowed.selector, evil));
        acct.compoundIntoStock(address(d.tsla), 1e6, evil, evil, "", 1);
    }
}
