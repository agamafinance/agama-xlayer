#!/usr/bin/env node
// Prints the RedStone signed payload (hex, no 0x) for the given feeds, to be
// appended to the calldata of `RedStoneStockOracle.pushRedStone`.
//   node scripts/redstone_payload.js TSLA,NVDA,AAPL
const {requestRedstonePayload} = require("@redstone-finance/sdk");

(async () => {
  const feeds = (process.argv[2] || "TSLA,NVDA,AAPL").split(",").filter(Boolean);
  process.stdout.write(
    await requestRedstonePayload({
      dataServiceId: "redstone-primary-prod",
      dataPackagesIds: feeds,
      uniqueSignersCount: 3, // the threshold the consumer contract enforces
    }),
  );
})().catch((e) => {
  console.error(String(e).slice(0, 300));
  process.exit(1);
});
