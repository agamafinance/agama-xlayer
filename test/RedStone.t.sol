// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {RedStoneStockOracle} from "../src/arrow/oracle/RedStoneStockOracle.sol";
import {StockOracle} from "../src/arrow/oracle/StockOracle.sol";
import {IVerifierProxy} from "../src/arrow/oracle/DataStreamsStockOracle.sol";

/// @dev Same contract with the signature extraction stubbed: the RedStone base
///      is exercised for real by `scripts/redstone_check.py` against X Layer,
///      what is tested here is what we do with the values it returns.
contract StubbedRedStoneOracle is RedStoneStockOracle {
    uint256[] internal _values;

    constructor(address admin, address keeper)
        RedStoneStockOracle(admin, keeper, IVerifierProxy(address(0)))
    {}

    function setValues(uint256[] memory v) external {
        _values = v;
    }

    function getOracleNumericValuesFromTxMsg(bytes32[] memory)
        internal
        view
        override
        returns (uint256[] memory)
    {
        return _values;
    }
}

contract RedStoneOracleTest is Test {
    StubbedRedStoneOracle oracle;
    address keeper = makeAddr("keeper");

    function setUp() public {
        vm.warp(1_790_000_000);
        oracle = new StubbedRedStoneOracle(address(this), keeper);
        oracle.addFeed("TSLA");
        oracle.addFeed("NVDA");
        oracle.addFeed("SPY");
        oracle.setRedStoneFeed("TSLA", "TSLA");
        oracle.setRedStoneFeed("NVDA", "NVDA");
    }

    function _push(bytes32[] memory tickers, uint256[] memory eightDecimals) internal {
        oracle.setValues(eightDecimals);
        oracle.pushRedStone(tickers);
    }

    function test_pushRedStone_scalesAndStores_permissionless() public {
        bytes32[] memory t = new bytes32[](2);
        t[0] = "TSLA";
        t[1] = "NVDA";
        uint256[] memory v = new uint256[](2);
        v[0] = 37_882_746_996; // 378.82746996 with 8 decimals
        v[1] = 22_886_225_385;

        vm.prank(makeAddr("anyone"));
        _push(t, v);

        (uint256 p,, bool open) = oracle.getPrice("TSLA");
        assertEq(p, 378.82746996e18, "8 decimals scaled to 18");
        assertTrue(open, "a fresh RedStone package means the market trades");
        (p,,) = oracle.getPrice("NVDA");
        assertEq(p, 228.86225385e18);
    }

    function test_signedPricesAreNotSubjectToTheKeeperDeviationCap() public {
        bytes32[] memory t = new bytes32[](1);
        t[0] = "TSLA";
        uint256[] memory v = new uint256[](1);
        v[0] = 40_000_000_000; // 400
        _push(t, v);

        vm.warp(vm.getBlockTimestamp() + 60);
        v[0] = 24_000_000_000; // 240, a 40% gap: refused from the keeper, fine when signed
        _push(t, v);
        (uint256 p,,) = oracle.getPrice("TSLA");
        assertEq(p, 240e18);

        uint64 later = uint64(vm.getBlockTimestamp() + 60);
        vm.warp(later);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(StockOracle.DeviationTooLarge.selector, 5_000, 1_500));
        oracle.push("TSLA", 120e18, later, true);
    }

    function test_tickerWithoutARedStoneFeedIsRefused() public {
        bytes32[] memory t = new bytes32[](1);
        t[0] = "SPY"; // RedStone does not publish SPY
        uint256[] memory v = new uint256[](1);
        v[0] = 77_400_000_000;
        oracle.setValues(v);
        vm.expectRevert(abi.encodeWithSelector(RedStoneStockOracle.NoRedStoneFeed.selector, bytes32("SPY")));
        oracle.pushRedStone(t);
    }

    function test_keeperStillOwnsMarketStatus() public {
        bytes32[] memory t = new bytes32[](1);
        t[0] = "TSLA";
        uint256[] memory v = new uint256[](1);
        v[0] = 37_882_746_996;
        _push(t, v);

        // Friday close: RedStone stops publishing, the keeper flags the close
        // at the same price, and the frozen price stays readable all weekend.
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.prank(keeper);
        oracle.push("TSLA", 378.82746996e18, uint64(vm.getBlockTimestamp()), false);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        (uint256 p,, bool open) = oracle.getPrice("TSLA");
        assertEq(p, 378.82746996e18);
        assertFalse(open);
    }

    /// RedStone keeps publishing out of session with a fresh timestamp and a
    /// flat value, so a signed push must not be able to unfreeze a closed market.
    function test_signedPushRefusedWhileTheMarketIsMarkedClosed() public {
        bytes32[] memory t = new bytes32[](1);
        t[0] = "TSLA";
        uint256[] memory v = new uint256[](1);
        v[0] = 37_882_746_996;
        _push(t, v);

        uint64 later = uint64(vm.getBlockTimestamp() + 60);
        vm.warp(later);
        vm.prank(keeper);
        oracle.push("TSLA", 378.82746996e18, later, false); // Friday close

        vm.warp(vm.getBlockTimestamp() + 3600);
        v[0] = 36_000_000_000;
        oracle.setValues(v);
        vm.expectRevert(
            abi.encodeWithSelector(RedStoneStockOracle.MarketClosedForTicker.selector, bytes32("TSLA"))
        );
        oracle.pushRedStone(t);

        (uint256 p,, bool open) = oracle.getPrice("TSLA");
        assertEq(p, 378.82746996e18, "close stays frozen");
        assertFalse(open);
    }

    function test_emptyListRefused() public {
        bytes32[] memory t = new bytes32[](0);
        uint256[] memory v = new uint256[](0);
        oracle.setValues(v);
        vm.expectRevert(RedStoneStockOracle.EmptyTickerList.selector);
        oracle.pushRedStone(t);
    }
}
