// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Deploy} from "./Deploy.s.sol";
import {TestUSDG, TestXStock, TestXStockWrapper} from "../src/mocks/TestnetTokens.sol";

/// @notice X Layer testnet (1952). Same Arrow x Agama stack, with public-faucet
///         stand-ins for USDG and the wrapped xStocks, and the testnet
///         Chainlink Data Streams VerifierProxy.
///
///   forge script script/DeployTestnet.s.sol --rpc-url xlayer_testnet --broadcast --slow \
///     --private-key $DEPLOYER_KEY
contract DeployTestnet is Deploy {
    address internal constant DS_VERIFIER_PROXY_TESTNET = 0x72790f9eB82db492a7DDb6d2af22A270Dcc3Db64;

    function run() external override returns (Deployment memory d) {
        address admin = msg.sender;
        vm.startBroadcast();
        TestUSDG usdg = new TestUSDG();
        TestXStockWrapper wTsla = _pair("Tesla", "TSLA");
        TestXStockWrapper wNvda = _pair("NVIDIA", "NVDA");
        TestXStockWrapper wSpy = _pair("SP500", "SPY");
        TestXStockWrapper wAapl = _pair("Apple", "AAPL");

        Config memory cfg = Config({
            admin: admin,
            keeper: vm.envOr("KEEPER", admin),
            guardian: admin,
            treasury: admin,
            supplyCapUsdg: 1_000_000e6,
            borrowCapUsdg: 500_000e6,
            spCooldown: 1 hours,
            assets: Assets({
                usdg: address(usdg),
                wTsla: address(wTsla),
                wNvda: address(wNvda),
                wSpy: address(wSpy),
                wAapl: address(wAapl),
                verifierProxy: DS_VERIFIER_PROXY_TESTNET,
                sequencerFeed: address(0)
            })
        });
        d = _deployAll(cfg);

        // Seed: Arrow lenders and the stability pool.
        usdg.faucet(admin, 10_000e6);
        usdg.faucet(admin, 10_000e6);
        usdg.faucet(admin, 10_000e6);
        usdg.approve(address(d.pool), 20_000e6);
        d.pool.deposit(20_000e6, admin);
        usdg.approve(address(d.sp), 5_000e6);
        d.sp.depositUSDG(5_000e6, admin);
        vm.stopBroadcast();

        _write(d, cfg);
    }

    function _pair(string memory name, string memory ticker) internal returns (TestXStockWrapper w) {
        TestXStock base = new TestXStock(string.concat("Test ", name, " xStock"), string.concat(ticker, "x"));
        w = new TestXStockWrapper(
            base, string.concat("Wrapped Test ", name, " xStock"), string.concat("w", ticker, "x")
        );
    }
}
