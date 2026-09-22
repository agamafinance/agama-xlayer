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
