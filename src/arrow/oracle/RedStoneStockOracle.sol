// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    PrimaryProdDataServiceConsumerBase
} from "@redstone/data-services/PrimaryProdDataServiceConsumerBase.sol";

import {DataStreamsStockOracle, IVerifierProxy} from "./DataStreamsStockOracle.sol";

/// @title RedStoneStockOracle
/// @notice The oracle the Arrow markets read, with a third write path:
///         RedStone signed prices, verified on-chain.
///
///         X Layer has no equity price a lending market can read: no Chainlink
///         equity push feed, and Data Streams is not live there (confirmed by
///         the OKX team on 2026-09-23, and by the chain: the mainnet
///         VerifierProxy never had a verifier initialised). RedStone's pull
///         model fills that hole without anyone deploying anything: the caller
///         appends a signed data package to the transaction calldata and this
///         contract recovers the signatures itself. Three distinct authorised
///         signers out of five are required, and the package must be less than
///         three minutes old (RedStone defaults).
///
///         `pushRedStone` is PERMISSIONLESS: a signed package is the source of
///         truth whoever carries it.
///
///         Market status stays with the keeper and its calendar. RedStone does
///         NOT stop publishing when the US session ends: timestamps stay fresh
///         every ten seconds while the value flatlines at the last close, so a
///         valid package proves the data is fresh, never that the market is
///         open. A signed push is therefore only accepted while the feed is
///         marked open, which keeps the Friday close frozen for the weekend
///         (the thing the liquidation thresholds are sized against).
///
/// @dev    RedStone numeric values carry 8 decimals; feeds here are 1e18.
contract RedStoneStockOracle is DataStreamsStockOracle, PrimaryProdDataServiceConsumerBase {
    /// @notice RedStone data feed id per ticker (both are bytes32 of the
    ///         symbol, but keeping the mapping explicit allows a ticker whose
    ///         RedStone id differs, and disables the path for tickers RedStone
    ///         does not publish, such as SPY).
    mapping(bytes32 ticker => bytes32) public redStoneFeedId;

    uint256 internal constant REDSTONE_DECIMALS_SCALE = 1e10; // 8 -> 18

    event RedStoneFeedSet(bytes32 indexed ticker, bytes32 feedId);
    event RedStonePriceWritten(bytes32 indexed ticker, uint256 price);

    error NoRedStoneFeed(bytes32 ticker);
    error EmptyTickerList();
    error MarketClosedForTicker(bytes32 ticker);

    constructor(address admin, address keeper, IVerifierProxy verifier)
        DataStreamsStockOracle(admin, keeper, verifier)
    {}

    /// @notice Write prices from a RedStone payload appended to this call.
    ///         Permissionless: the signatures are what is trusted.
    /// @param tickers Tickers to update, each with a configured RedStone feed.
    function pushRedStone(bytes32[] calldata tickers) external {
        if (tickers.length == 0) revert EmptyTickerList();

        bytes32[] memory feedIds = new bytes32[](tickers.length);
        for (uint256 i; i < tickers.length; ++i) {
            bytes32 id = redStoneFeedId[tickers[i]];
            if (id == bytes32(0)) revert NoRedStoneFeed(tickers[i]);
            // Refuse to move a price the keeper has marked closed: RedStone
            // keeps publishing out of session and the close must stay frozen.
            if (!_feeds[tickers[i]].marketOpen && _feeds[tickers[i]].price != 0) {
                revert MarketClosedForTicker(tickers[i]);
            }
            feedIds[i] = id;
        }

        // Reverts unless three authorised signers agree and the package is
        // fresh (RedStone validates the timestamp against block.timestamp).
        uint256[] memory values = getOracleNumericValuesFromTxMsg(feedIds);

        for (uint256 i; i < tickers.length; ++i) {
            uint256 price = values[i] * REDSTONE_DECIMALS_SCALE;
            // Status is carried over, never decided here (the keeper owns it);
            // a first ever price bootstraps as open. `forced` skips the keeper
            // deviation cap: signed data is allowed to gap.
            bool open = _feeds[tickers[i]].price == 0 ? true : _feeds[tickers[i]].marketOpen;
            _write(tickers[i], price, uint64(block.timestamp), open, true);
            emit RedStonePriceWritten(tickers[i], price);
        }
    }

    function setRedStoneFeed(bytes32 ticker, bytes32 feedId) external onlyRole(GOVERNOR_ROLE) {
        if (!_feeds[ticker].exists) revert UnknownTicker(ticker);
        redStoneFeedId[ticker] = feedId;
        emit RedStoneFeedSet(ticker, feedId);
    }

    /// @dev The RedStone base uses `block.timestamp` freshness; the aggregation
    ///      of several signers is the median, which is what we want here.
    function aggregateValues(uint256[] memory values) public view virtual override returns (uint256) {
        return super.aggregateValues(values);
    }
}
