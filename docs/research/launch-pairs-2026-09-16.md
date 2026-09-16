# EURC and cirBTC launch pairs

Verified on Arc chain 5042 at block 21160441, 2026-09-16 12:55 UTC.

Portal 7 (`0xb021be536808f551b31789422fd28a6c9c6e97da`) returned `quoteApproved=true` for both:

| Symbol | Address | Decimals |
| --- | --- | --- |
| EURC | 0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1 | 6 |
| cirBTC | 0x171a4217b86a807a64eb94757db6849fb4bdbaa0 | 8 |

Registry `0xfa4552dd491acc08051725fe522f4cfeaec8edc6` returned each token itself from `payoutAssetFor`. Symbol and decimals were read on-chain. This establishes Argus pairing approval, not independent issuer or reserve attestation.

Read-only shared launch quotes passed at block 21160644. A $25 developer buy converted to 21.637052 EURC or 0.00032853 cirBTC using the selected USDC pools. These are time-specific observations, not fixed rates. No launch, approval, or trade was submitted.

Launch input, deterministic X pairing, intent prompts, preparation controls, and the guide now accept both assets. USDC remains the default. Existing dynamic trading discovery remains unchanged; new assets still require valid routes, simulation, and receipt verification. Developer buys require holding the chosen pair asset. Preparation retains on-chain approval, decimals, and payout checks.
