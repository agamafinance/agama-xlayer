// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseFork} from "./Base.t.sol";
import {AgamaEarnRouter} from "../src/agama/AgamaEarnRouter.sol";
import {AgamaAccount} from "../src/agama/AgamaAccount.sol";
import {ArrowLendingPool} from "../src/arrow/ArrowLendingPool.sol";

contract EarnForkTest is BaseFork {
    function test_open_borrowsAtChosenLtv_andParksUsdgInVault() public {
        uint256 borrowed = _openEarn(alice, 10e18, 2_500);

        // 10 wTSLAx * 420 * wrapper ratio (1.0 for TSLA) = 4,200 USDG; 25% = 1,050.
        assertEq(borrowed, 1_050e6, "borrow");
        AgamaEarnRouter.Position memory p = d.earn.position(alice, address(d.tsla));
        assertEq(p.collateral, 10e18);
        assertEq(p.collateralValue, 4_200e6);
        assertEq(p.debt, 1_050e6);
        // HF = 4200 * 40% / 1050 = 1.6
        assertApproxEqRel(p.healthFactorRay, 1.6e27, 1e14);
        // The borrowed USDG sits in the Agama vault as free shares.
        assertApproxEqAbs(p.freeSharesValue, 1_050e6, 1);
        assertEq(wtsla.balanceOf(alice), 0);
    }

    function test_close_returnsStock_andYield() public {
        _openEarn(alice, 10e18, 2_500);
        // Vault earns: 2% of its assets over the period.
        _settleYield(21e6);
        _warp(30 days);
        _pushAll(true);

        vm.prank(alice);
        d.earn.close(address(d.tsla));

        assertEq(wtsla.balanceOf(alice), 10e18, "stock back");
        assertEq(d.pool.getPositionScaledDebt(address(d.tsla), address(_account(alice)), ""), 0, "no debt");
        // Alice keeps the spread: vault yield minus 30 days of interest, as
        // vault shares and/or USDG. Yield (net of 10% fee) is ~18.9 USDG,
        // interest at the low utilization of this test is ~1.3 USDG.
        // Measured at the live vault rate (the adapter's CAPO ceiling would
        // under-count a yield jump settled right after deployment).
        uint256 leftover = d.vault.convertToAssets(d.vault.balanceOf(alice)) / 1e12 + usdg.balanceOf(alice);
        assertGt(leftover, 15e6, "positive carry");
        assertLt(leftover, 20e6);
    }

    function test_marketClosed_blocksNewBorrows_andTightensThreshold() public {
        _openEarn(alice, 5e18, 2_500);
        uint256 t = _warp(60);
        vm.prank(keeper);
        d.oracle.push("TSLA", TSLA_PX, uint64(t), false);

        assertFalse(d.tsla.borrowAllowed());
        assertEq(d.tsla.LIQUIDATION_THRESHOLD(), 3_200, "40% - 8% weekend buffer");

        vm.startPrank(alice);
        wtsla.approve(address(d.earn), 5e18);
        vm.expectRevert(AgamaEarnRouter.MarketClosed.selector);
        d.earn.open(address(d.tsla), 5e18, 2_500);
        vm.stopPrank();

        // Frozen price stays usable for valuation for up to 4 days.
        _warp(3 days);
        assertEq(d.tsla.valueOf(1e18), 420e6);
        _warp(2 days);
        vm.expectRevert();
        d.tsla.valueOf(1e18);
    }

    function test_ltvAboveMax_reverts() public {
        vm.startPrank(alice);
        wtsla.approve(address(d.earn), 10e18);
        vm.expectRevert(abi.encodeWithSelector(AgamaEarnRouter.LtvTooHigh.selector, 3_100, 3_000));
        d.earn.open(address(d.tsla), 10e18, 3_100);
        vm.stopPrank();
    }

    function test_softDeleverage_usesVaultShares_notTheStock() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);

        // TSLA 420 -> 300: HF = 3000 * 40% / 1050 = 1.143 < 1.15
        _walkPrice("TSLA", 300e18, true);
        uint256 hf = d.pool.calculateHealthFactor(address(d.tsla), address(acct), "");
        assertLt(hf, 1.15e27);

        // Anyone can trigger it.
        vm.prank(liquidator);
        uint256 repaid = acct.softDeleverage(address(d.tsla));

        uint256 hfAfter = d.pool.calculateHealthFactor(address(d.tsla), address(acct), "");
        assertApproxEqRel(hfAfter, 1.4e27, 1e15, "back to 1.40");
        assertApproxEqAbs(repaid, 1_050e6 - 857_142_857, 2e6);
        assertEq(d.tsla.balanceOf(address(acct)), 10e18, "stock untouched");
    }

    function test_softDeleverage_revertsWhenHealthy() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        vm.expectRevert();
        acct.softDeleverage(address(d.tsla));
    }

    function test_onlyOwnerOrRouter_canOperateAccount() public {
        _openEarn(alice, 10e18, 2_500);
        AgamaAccount acct = _account(alice);
        vm.prank(bob);
        vm.expectRevert(AgamaAccount.NotAuthorized.selector);
        acct.earnClose(alice, address(d.tsla));
        vm.prank(bob);
        vm.expectRevert(AgamaAccount.NotAuthorized.selector);
        acct.earnClose(bob, address(d.tsla));
    }

    function test_directBorrow_blockedWhenMarketClosed() public {
        uint256 t = _warp(60);
        vm.prank(keeper);
        d.oracle.push("TSLA", TSLA_PX, uint64(t), false);
        vm.startPrank(alice);
        d.pool.openVaultPosition();
        wtsla.approve(address(d.tsla), 1e18);
        d.pool.depositAsset(address(d.tsla), abi.encode(uint256(1e18)));
        vm.expectRevert(ArrowLendingPool.BorrowNotAllowed.selector);
        d.pool.borrow(address(d.tsla), "", 10e6);
        vm.stopPrank();
    }
}
