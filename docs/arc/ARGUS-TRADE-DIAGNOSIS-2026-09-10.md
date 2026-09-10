# ARGUS trade diagnosis

Read-only investigation on 2026-09-10. No transactions signed or broadcast.

Wallet: `0x96145386E08123F311EBe5c3548EBe706f0d85Dc`.
ARGUS: `0xece5ca8bf9220718e5727754026757512212cb3c`.

Both recorded allowance transactions are completed in Convex and successful on-chain:
- `0x28b4deba93f78603f01dc1e23499e15c6e9c824a30c7dcbe0fa34377b851ae50`
- `0x7547e99f464e1d2536742142e4a03c5eedd1aa6c58bbbfe037b95b22490a7200`

No swap record followed them at inspection time. Wallet holds were empty, with no active transaction.

Two fresh 10 USDC to ARGUS preview probes took approximately 18.1 and 17.4 seconds (including receipt reads) before router simulation reverted. The underlying Argus RPC response was `execution reverted`, selector `0x3b99b53d` (`SliceOutOfBounds()`).

`lib/arc/routing.ts` currently encodes V3 exact-input command `0x00` as five arguments: address, uint256, uint256, bytes, bool. The current upstream Universal Router dispatcher also reads a sixth argument, `uint256[] minHopPriceX36`:
https://github.com/Uniswap/universal-router/blob/main/contracts/base/Dispatcher.sol

Controlled read-only comparison against the deployed router, same sender, 10 USDC input, 9,500 ARGUS minimum, 10000 fee path, and fresh deadline:
- Five-field payload: `0x3b99b53d` revert.
- Six-field payload, adding `[0]` for the single hop: successful `eth_call`, result `0x`.

This demonstrates a V3 encoder incompatibility, not an unmined swap. Successful simulation does not itself prove a future transaction's delivery.

Latency: each preview probe attempted 139 RPC requests, including 68 chain-ID checks and 33 block reads. Failed primary/fallback validation is retried for successive requests; successful validation is cached only briefly per transport. Sequential route discovery and validation add overhead. These timings are from the local runtime, not Vercel runtime logs.

The deployed website JavaScript contained the automatic approval flow and no old Review trade button at inspection time.

Follow-up: update V3 encoding and regression fixtures, validate one minimum-hop-price value per pool, retain final minimum-output protection, then reduce duplicate provider validation without weakening chain/checkpoint/freshness checks. No production encoder change was made during this analysis.

## Implemented fix

The subsequent implementation adds the sixth V3 field, with one zero minimum-hop-price entry per pool. The final minimum-output limit remains enforced. A read-only call against the deployed, code-hash-verified router at approval block 20161748 succeeded for 10 USDC to ARGUS with a 9,500 ARGUS minimum.

RPC validation now shares in-flight checks, keeps the existing maximum five-second success cache bounded by head freshness, cools down failed provider validation for ten seconds, and cools down retryable per-method failures for five seconds. Trade discovery shares its transport across clients. Quote candidates run at most four at a time and reuse duplicate contract-code/call reads within their pinned block. Ambiguous broadcasts are still attempted only once, never through Argus's read-only endpoint.

Final current preview measurement: 9,008 ms, 66 RPC requests, valid V3 quote, `approve router` stage because the previous Permit2 permission expired. Earlier measurements were 17–18 seconds and 139 attempts, ending in a swap simulation failure; the earlier counts also included two receipt reads. These are local observations and different final stages, not a controlled Vercel benchmark.

Validation: 42 targeted tests passed, including both read-only live checks; root and Convex TypeScript checks and production-file ESLint passed. No transactions were signed or broadcast. Changes require deployment before the live website uses them.
