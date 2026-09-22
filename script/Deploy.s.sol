// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Deployer} from "./Deployer.sol";

/// @notice Broadcast the full Arrow x Agama stack on X Layer and write
///         `deployments/<chainId>.json` for the front and the keeper.
///
///   Mainnet (guarded launch, small caps):
///     forge script script/Deploy.s.sol --rpc-url xlayer --broadcast --slow \
///       --private-key $DEPLOYER_KEY
///
///   Local fork demo (see scripts/fork.sh):
///     forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///       --private-key <anvil key>
///
/// Env (all optional, default = broadcaster): KEEPER, GUARDIAN, TREASURY,
/// SUPPLY_CAP_USDG, BORROW_CAP_USDG (whole USDG), SP_COOLDOWN (seconds).
contract Deploy is Script, Deployer {
    function run() external virtual returns (Deployment memory d) {
        address admin = msg.sender;
        Config memory cfg = Config({
            admin: admin,
            keeper: vm.envOr("KEEPER", admin),
            guardian: vm.envOr("GUARDIAN", admin),
            treasury: vm.envOr("TREASURY", admin),
            supplyCapUsdg: vm.envOr("SUPPLY_CAP_USDG", uint256(5_000)) * 1e6,
            borrowCapUsdg: vm.envOr("BORROW_CAP_USDG", uint256(2_000)) * 1e6,
            spCooldown: vm.envOr("SP_COOLDOWN", uint256(1 days)),
            assets: _mainnetAssets()
        });
        // A local fork keeps mainnet state but runs its own clock: no sequencer check.
        if (block.chainid != 196) cfg.assets.sequencerFeed = address(0);

        vm.startBroadcast();
        d = _deployAll(cfg);
        vm.stopBroadcast();

        _write(d, cfg);
    }

    function _write(Deployment memory d, Config memory cfg) internal {
        string memory c = "contracts";
        vm.serializeAddress(c, "oracle", address(d.oracle));
        vm.serializeAddress(c, "agUSD", address(d.ag));
        vm.serializeAddress(c, "sagUSD", address(d.vault));
        vm.serializeAddress(c, "queue", address(d.queue));
        vm.serializeAddress(c, "pool", address(d.pool));
        vm.serializeAddress(c, "stabilityPool", address(d.sp));
        vm.serializeAddress(c, "factory", address(d.factory));
        vm.serializeAddress(c, "earnRouter", address(d.earn));
        vm.serializeAddress(c, "zapRouter", address(d.zap));
        string memory contracts = vm.serializeAddress(c, "amplifyRouter", address(d.amplify));

        string memory a = "adapters";
        vm.serializeAddress(a, "TSLA", address(d.tsla));
        vm.serializeAddress(a, "NVDA", address(d.nvda));
        vm.serializeAddress(a, "SPY", address(d.spy));
        vm.serializeAddress(a, "AAPL", address(d.aapl));
        string memory adapters = vm.serializeAddress(a, "VAULT", address(d.vaultAdapter));

        string memory t = "tokens";
        vm.serializeAddress(t, "USDG", cfg.assets.usdg);
        vm.serializeAddress(t, "wTSLAx", cfg.assets.wTsla);
        vm.serializeAddress(t, "wNVDAx", cfg.assets.wNvda);
        vm.serializeAddress(t, "wSPYx", cfg.assets.wSpy);
        string memory tokens = vm.serializeAddress(t, "wAAPLx", cfg.assets.wAapl);

        string memory r = "root";
        vm.serializeUint(r, "chainId", block.chainid);
        vm.serializeUint(r, "deployedAtBlock", block.number);
        vm.serializeAddress(r, "admin", cfg.admin);
        vm.serializeAddress(r, "keeper", cfg.keeper);
        vm.serializeString(r, "contracts", contracts);
        vm.serializeString(r, "adapters", adapters);
        string memory json = vm.serializeString(r, "tokens", tokens);

        // DEPLOY_FILE lets a chain-196 fork write next to the real mainnet file.
        string memory path = string.concat(
            "deployments/", vm.envOr("DEPLOY_FILE", string.concat(vm.toString(block.chainid), ".json"))
        );
        vm.writeJson(json, path);
        console.log("written", path);
    }
}
