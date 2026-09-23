// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

import {agUSD} from "../src/vault/agUSD.sol";
import {sagUSD} from "../src/vault/sagUSD.sol";
import {agUSDQueue} from "../src/vault/agUSDQueue.sol";
import {IagUSDQueue} from "../src/vault/interfaces/IagUSDQueue.sol";

import {ArrowLendingPool} from "../src/arrow/ArrowLendingPool.sol";
import {ArrowStabilityPool, IagUSDQueueRedeem} from "../src/arrow/ArrowStabilityPool.sol";
import {ArrowXStockAdapter} from "../src/arrow/adapters/ArrowXStockAdapter.sol";
import {ArrowVaultShareAdapter} from "../src/arrow/adapters/ArrowVaultShareAdapter.sol";
import {StockOracle} from "../src/arrow/oracle/StockOracle.sol";
import {IVerifierProxy} from "../src/arrow/oracle/DataStreamsStockOracle.sol";
import {RedStoneStockOracle} from "../src/arrow/oracle/RedStoneStockOracle.sol";
import {InterestRateModel as IRM} from "../src/arrow/libs/InterestRateModel.sol";

import {AgamaAccount} from "../src/agama/AgamaAccount.sol";
import {AgamaAccountFactory} from "../src/agama/AgamaAccountFactory.sol";
import {AgamaEarnRouter} from "../src/agama/AgamaEarnRouter.sol";
import {AgamaAmplifyRouter} from "../src/agama/AgamaAmplifyRouter.sol";
import {AgamaZapRouter} from "../src/agama/AgamaZapRouter.sol";
import {IArrowPool} from "../src/interfaces/IArrowPool.sol";

/// @title Deployer
/// @notice Single source of truth for the X Layer deployment, shared by the
///         broadcast script and the fork tests (tests run the exact wiring
///         that goes to mainnet).
abstract contract Deployer {
    // ---- X Layer mainnet (chain 196) ----------------------------------------------
    address internal constant USDG = 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8;
    address internal constant W_TSLAX = 0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171;
    address internal constant W_NVDAX = 0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5;
    address internal constant W_SPYX = 0xE7E553Cd128F0011777323A0b44a7b96EA1CB540;
    address internal constant W_AAPLX = 0x943BF64D566c32A2Bcd41AC92FB63C111cC9De8f;
    address internal constant DS_VERIFIER_PROXY = 0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7;
    address internal constant SEQUENCER_UPTIME_FEED = 0x45c2b8C204568A03Dc7A2E32B71D67Fe97F908A9;
    /// OKX Onchain OS DEX aggregator on X Layer: router called by the zap, and
    /// the address that must be approved to pull the input token.
    address internal constant OKX_DEX_ROUTER = 0x7c5bEE2a8091C3ef39072f64F18Fac913060AEaF;
    address internal constant OKX_DEX_APPROVE = 0x8b773D83bc66Be128c60e07E17C8901f7a64F000;

    // Chainlink Data Streams v11 (US equities, Regular hours) feed IDs.
    bytes32 internal constant DS_TSLA = 0x000b2dbed1640ead18d37338b75e4755630a900649261baf4ed79d9a749be13d;
    bytes32 internal constant DS_NVDA = 0x000b6aa036224454037bab103184565f6aa9ea589c3b349f6d8471ee753524b9;
    bytes32 internal constant DS_SPY = 0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac;
    bytes32 internal constant DS_AAPL = 0x000bbd87a23775b4c11092ae9a1fc7b3393636ae1dbb9f1ef460f845c0f4cff1;

    /// @notice Token and infra addresses. Mainnet values by default; the
    ///         testnet script swaps in mocks (X Layer testnet has no xStocks).
    struct Assets {
        address usdg;
        address wTsla;
        address wNvda;
        address wSpy;
        address wAapl;
        address verifierProxy;
        address sequencerFeed; // address(0) to disable
        address okxDexRouter; // OKX DEX aggregator router (X Layer mainnet)
        address okxDexApprove; // OKX approve address for that router
    }

    function _mainnetAssets() internal pure returns (Assets memory) {
        return Assets({
            usdg: USDG,
            wTsla: W_TSLAX,
            wNvda: W_NVDAX,
            wSpy: W_SPYX,
            wAapl: W_AAPLX,
            verifierProxy: DS_VERIFIER_PROXY,
            sequencerFeed: SEQUENCER_UPTIME_FEED,
            okxDexRouter: OKX_DEX_ROUTER,
            okxDexApprove: OKX_DEX_APPROVE
        });
    }

    struct Config {
        address admin; // governor of every contract
        address keeper; // oracle keeper + vault operator
        address guardian; // pause
        address treasury; // fee recipient
        uint256 supplyCapUsdg; // Arrow lending supply cap, in USDG units
        uint256 borrowCapUsdg; // Arrow lending borrow cap, in USDG units
        uint256 spCooldown;
        Assets assets;
    }

    struct Deployment {
        RedStoneStockOracle oracle;
        agUSD ag;
        sagUSD vault;
        agUSDQueue queue;
        ArrowLendingPool pool;
        ArrowStabilityPool sp;
        ArrowXStockAdapter tsla;
        ArrowXStockAdapter nvda;
        ArrowXStockAdapter spy;
        ArrowXStockAdapter aapl;
        ArrowVaultShareAdapter vaultAdapter;
        AgamaAccountFactory factory;
        AgamaEarnRouter earn;
        AgamaAmplifyRouter amplify;
        AgamaZapRouter zap;
    }

    /// @dev Must be called with `address(this)` (script: the broadcaster)
    ///      acting as `cfg.admin`, since it wires roles right after deploying.
    function _deployAll(Config memory cfg) internal returns (Deployment memory d) {
        // 1. Oracle -----------------------------------------------------------------
        d.oracle = new RedStoneStockOracle(cfg.admin, cfg.keeper, IVerifierProxy(cfg.assets.verifierProxy));
        d.oracle.addFeed("TSLA");
        d.oracle.addFeed("NVDA");
        d.oracle.addFeed("SPY");
        d.oracle.addFeed("AAPL");
        d.oracle.setStream(DS_TSLA, "TSLA", 18, true);
        d.oracle.setStream(DS_NVDA, "NVDA", 18, true);
        d.oracle.setStream(DS_SPY, "SPY", 18, true);
        d.oracle.setStream(DS_AAPL, "AAPL", 18, true);
        // RedStone publishes TSLA, NVDA and AAPL (no SPY, no ETFs): those three
        // get signed prices verified on-chain, SPY stays on the keeper relay.
        d.oracle.setRedStoneFeed("TSLA", "TSLA");
        d.oracle.setRedStoneFeed("NVDA", "NVDA");
        d.oracle.setRedStoneFeed("AAPL", "AAPL");
        if (cfg.assets.sequencerFeed != address(0)) {
            d.oracle.setSequencerUptimeFeed(cfg.assets.sequencerFeed);
        }

        // 2. Agama vault on USDG ------------------------------------------------------
        d.ag = new agUSD(cfg.admin, cfg.guardian);
        d.vault = new sagUSD(address(d.ag), cfg.admin, cfg.guardian, cfg.admin, 0, cfg.treasury);
        d.queue = new agUSDQueue(
            address(d.ag),
            cfg.assets.usdg,
            address(d.vault),
            cfg.admin,
            cfg.guardian,
            cfg.keeper,
            5_000, // 50% of the vault kept liquid (instant exits + liquidations)
            1_000, // 10% protocol fee on yield
            cfg.treasury,
            1e6, // 1 USDG min deposit
            1_000_000e6 // instant redemption ceiling per request
        );
        d.ag.grantRole(d.ag.MINTER_ROLE(), address(d.queue));
        d.vault.grantRole(d.vault.OPERATOR_ROLE(), address(d.queue));
        d.vault.revokeRole(d.vault.OPERATOR_ROLE(), cfg.admin);

        // 3. Arrow lending pool ----------------------------------------------------------
        IRM.Params memory irm = IRM.Params({
            baseRate: 0.01e27, // 1%
            slope1: 0.05e27, // 6% at the kink
            slope2: 0.75e27,
            optimalUtil: 0.9e27
        });
        d.pool = new ArrowLendingPool(IERC20(cfg.assets.usdg), cfg.admin, "Arrow USDG", "arUSDG", irm, false);
        // Lender shares carry a 6-decimal offset (12 decimals): cap in shares.
        d.pool.setSupplyCap(cfg.supplyCapUsdg * 1e6);
        d.pool.setBorrowCap(cfg.borrowCapUsdg);

        // 4. Collateral adapters -----------------------------------------------------------
        //                 (maxLtv, LT, bonus, weekend buffer)
        d.tsla = _stock(d, cfg, cfg.assets.wTsla, "TSLA", 3_000, 4_000, 1_000, 800);
        d.nvda = _stock(d, cfg, cfg.assets.wNvda, "NVDA", 3_000, 4_000, 1_000, 800);
        d.spy = _stock(d, cfg, cfg.assets.wSpy, "SPY", 5_000, 6_000, 600, 500);
        d.aapl = _stock(d, cfg, cfg.assets.wAapl, "AAPL", 3_500, 4_500, 800, 800);
        d.vaultAdapter = new ArrowVaultShareAdapter(
            address(d.pool),
            IERC4626(address(d.vault)),
            6,
            cfg.admin,
            7_000, // max LTV -> 3x reachable after the haircut
            8_000, // LT
            500, // bonus
            300, // 3% haircut on NAV
            1_500, // NAV may not grow faster than 15%/yr between snapshots
            200 // borrows pause if NAV drops 2% under the snapshot
        );
        d.pool.registerAdapter(address(d.vaultAdapter), true);

        // 5. Stability pool ----------------------------------------------------------------
        d.sp = new ArrowStabilityPool(IERC4626(address(d.pool)), cfg.admin, 300, cfg.spCooldown);
        d.pool.setStabilityPool(address(d.sp));
        d.sp.addAdapter(address(d.tsla));
        d.sp.addAdapter(address(d.nvda));
        d.sp.addAdapter(address(d.spy));
        d.sp.addAdapter(address(d.aapl));
        d.sp.addAdapter(address(d.vaultAdapter));
        d.sp.setVault(IERC4626(address(d.vault)), IagUSDQueueRedeem(address(d.queue)));
        d.queue.grantRole(d.queue.PRIORITY_ROLE(), address(d.sp));

        // 6. The vault may never fund the pool that takes its shares as collateral.
        d.queue.setForbiddenVault(address(d.pool));

        // 7. Agama accounts and routers ---------------------------------------------------
        AgamaAccount impl = new AgamaAccount(
            IArrowPool(address(d.pool)),
            IagUSDQueue(address(d.queue)),
            IERC4626(address(d.vault)),
            d.vaultAdapter
        );
        d.factory = new AgamaAccountFactory(address(impl), cfg.admin);
        d.earn = new AgamaEarnRouter(d.factory, IArrowPool(address(d.pool)), cfg.admin);
        d.amplify = new AgamaAmplifyRouter(d.factory, IArrowPool(address(d.pool)), d.vaultAdapter);
        d.factory.setRouter(address(d.earn), true);
        d.factory.setRouter(address(d.amplify), true);

        // 8. Buy and Earn in one transaction, through the OKX DEX aggregator.
        d.zap = new AgamaZapRouter(d.earn, cfg.admin);
        d.earn.setZap(address(d.zap), true);
        // The accounts read the zap's swap allowlist when the agents compound
        // vault yield back into stock.
        d.factory.setZapRouter(address(d.zap));
        if (cfg.assets.okxDexRouter != address(0)) {
            d.zap.setTarget(cfg.assets.okxDexRouter, true);
            d.zap.setSpender(cfg.assets.okxDexApprove, true);
        }
    }

    function _stock(
        Deployment memory d,
        Config memory cfg,
        address wrapper,
        bytes32 ticker,
        uint256 ltv,
        uint256 lt,
        uint256 bonus,
        uint256 weekendBuffer
    ) internal returns (ArrowXStockAdapter a) {
        a = new ArrowXStockAdapter(
            address(d.pool),
            IERC4626(wrapper),
            ticker,
            StockOracle(address(d.oracle)),
            6,
            cfg.admin,
            ltv,
            lt,
            bonus,
            weekendBuffer
        );
        d.pool.registerAdapter(address(a), true);
    }
}
