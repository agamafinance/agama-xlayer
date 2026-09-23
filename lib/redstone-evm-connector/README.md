# RedStone evm-connector (vendored)

Vendored from `@redstone-finance/evm-connector@0.7.5` (contracts/core, contracts/libs
and `PrimaryProdDataServiceConsumerBase`), so the build needs no npm step.

Licensed under BUSL-1.1 (see LICENSE): redistribution and non-production use are
granted; production use needs a grant from the licensor. That is why this is used
for the hackathon deployment and flagged in the README.

Why it is here: X Layer has no equity price a contract can read (no Chainlink
equity feed, and Data Streams is not live, confirmed by OKX on 2026-09-23).
RedStone's pull model needs nothing deployed by RedStone: the signed data package
rides at the end of the calldata and the consumer verifies the signatures itself.
