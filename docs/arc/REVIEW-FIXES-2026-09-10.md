# Review fixes — September 10, 2026

## OTC payout recovery

The seller can retry a finalized reverted Arc payout from wallet order history. The retry requires a fresh balance and gas simulation, the seller's authenticated session, the current attempt number, and a recorded finalized failure. It preserves the Base payment and all Arc reservations. A new attempt gets a new transaction ID; earlier signed bytes and hashes remain in history. Concurrent retries cannot create another attempt. If the previous revert consumed the seller's gas cushion, the seller must replenish Arc USDC. Retries cannot exceed the original gas allowance.

## ERC-20 delivery

Finalized receipt transfers are checked against the complete token log set for that block. The recipient's block balance delta must match all incoming and outgoing transfers, including other transactions. A same-block outgoing transfer no longer falsely blocks settlement. Missing receipt logs, incomplete block logs, inconsistent state, and insufficient swap output remain reserved for investigation. Rebasing/nonstandard tokens without reconcilable Transfer events are not accepted as verified delivery.

## Website trading

`/api/wallet/trade` provides exact-input preview and confirmation. Buy spends a specified Arc USDC amount; Sell spends a token amount and can output USDC or another token. Candidate discovery checks standard V3 fee tiers and USDC bridge routes, plus standard hookless V4 single-pool candidates. Live factory/state/quote verification and the pinned router bytecode are required. USDC's native 18 decimals and ERC-20 6 decimals are accounted for separately.

ERC-20/Permit2 approvals are separate durable transactions for the requested amount, with an optional zero-reset step. Website users re-review after finalized approval to receive a fresh quote. Swap quotes bind owner, wallet, serialized transaction, output minimum, gas reservation and expiry with an HMAC. The reservation includes native USDC principal even when spending its ERC-20 representation. Transactions appear in wallet history and recover through the existing worker. Native V4 output requires `debug_traceCall` and `debug_traceTransaction` with prestateTracer diffMode for transaction-specific balance evidence; this must be available on the configured RPC.

Mixed V3/V4 execution, V4 multihop, custom fee/tick configurations outside the candidate list, and unreviewed hooks remain unsupported. The UI does not claim these paths work. The swap adapter is not universal coverage for every token contract.

## Reauthentication

The X start endpoint only reuses sessions within the 30-minute spending authentication window. Older active sessions enter OAuth again. The wallet account menu provides a Refresh X sign-in link; users do not need to sign out first.

## X and Telegram Arc commands

Supported social commands now enter a separate chain-5042 service endpoint instead of the retired chain executor. The service loads the original command from the stored Convex request, checks the active wallet and Telegram linking authorization, and repeats authorization before signing. Base ETH requests and creation workflows are rejected. Source request IDs produce deterministic transaction IDs; repeated calls resume existing records. Convex schedules bounded continuation checks for approval and settlement steps.

Supported input forms are USDC-budget buys, token-amount/percentage sells, percentage token swaps, and explicit-amount sends/burns to EVM addresses. Token identifiers resolve against the Arc catalog or an explicit address. Exact-output buys, dollar-denominated token sells/swaps, handle-recipient resolution in this new path, and compound buy-and-send/burn requests are rejected rather than falling back to the retired executor. Existing supported parser variants are not all executable variants.

## Deployment and verification limits

Changes are local. Vercel and Convex must both be deployed; the production Arc command service uses WEB_AUTH_SECRET shared between them and the existing wallet reservation storage. No new secret is required. Network configuration and OTC deployment values remain as described in VERIFIED-NETWORK-ENV.md. No funded transaction or social publication was performed.

Native trace semantics follow [Geth prestateTracer documentation](https://geth.ethereum.org/docs/developers/evm-tracing/built-in-tracers).
