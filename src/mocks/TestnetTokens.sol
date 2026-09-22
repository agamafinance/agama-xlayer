// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice TESTNET ONLY. X Layer testnet (1952) has no USDG and no xStocks,
///         so the testnet deployment runs the exact same Arrow x Agama stack
///         against these stand-ins. Anyone can mint from the faucet.
contract TestUSDG is ERC20 {
    uint256 public constant FAUCET_CAP = 10_000e6;

    constructor() ERC20("Test Global Dollar (X Layer testnet)", "tUSDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(address to, uint256 amount) external {
        require(amount <= FAUCET_CAP, "cap");
        _mint(to, amount);
    }
}

/// @notice Stand-in for an xStock base token (1 token tracks 1 share).
contract TestXStock is ERC20 {
    uint256 public constant FAUCET_CAP = 100e18;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function faucet(address to, uint256 amount) external {
        require(amount <= FAUCET_CAP, "cap");
        _mint(to, amount);
    }
}

/// @notice ERC-4626 wrapper over a TestXStock, mirroring the Backed wrappers
///         (wTSLAx etc.) that Arrow takes as collateral on mainnet.
///         `faucet` mints base tokens and wraps them in one call.
contract TestXStockWrapper is ERC4626 {
    constructor(TestXStock base, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(IERC20(address(base)))
    {}

    function faucet(address to, uint256 amount) external returns (uint256 shares) {
        shares = previewDeposit(amount);
        TestXStock(asset()).faucet(address(this), amount);
        _mint(to, shares);
    }
}

/// @notice TESTNET ONLY. Stands in for the OKX DEX aggregator, which covers
///         X Layer mainnet but not the testnet: swaps tUSDG for a test xStock
///         at the Arrow oracle price (minus a small spread), minting the stock
///         from its faucet. Same interface shape as an aggregator call, so the
///         zap is exercised on testnet exactly as it is on mainnet.
contract TestDexRouter {
    uint256 internal constant BPS = 10_000;

    TestUSDG public immutable USDG;
    uint256 public spreadBps;

    event Swapped(address indexed buyer, address indexed wrapper, uint256 usdgIn, uint256 stockOut);

    constructor(TestUSDG usdg, uint256 spreadBps_) {
        USDG = usdg;
        spreadBps = spreadBps_;
    }

    /// @param wrapper     Test xStock wrapper to buy.
    /// @param usdgIn      tUSDG pulled from the caller (it approved this router).
    /// @param priceUsdg6  Price of one wrapper token, in tUSDG units (6 decimals).
    function swap(TestXStockWrapper wrapper, uint256 usdgIn, uint256 priceUsdg6)
        external
        returns (uint256 out)
    {
        require(priceUsdg6 > 0, "price");
        USDG.transferFrom(msg.sender, address(this), usdgIn);
        out = (usdgIn * 1e18) / priceUsdg6;
        out = (out * (BPS - spreadBps)) / BPS;
        wrapper.faucet(msg.sender, out);
        emit Swapped(msg.sender, address(wrapper), usdgIn, out);
    }
}
