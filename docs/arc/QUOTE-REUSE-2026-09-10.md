# Trade quote reuse

Website estimates return a signed route identity that follows the trade through preview and token/Permit2 approvals. It works across Vercel instances. Only the selected pools are re-quoted during that flow; previous prices and gas estimates are never reused as execution authorization.

The hint binds the authenticated wallet, input/output assets and configured RPC/checkpoint scope. It expires five minutes after discovery and refreshes do not extend that lifetime. Native and ERC-20 Arc USDC share an asset binding, while the route preserves its actual currency address and decimals. Provider credentials are hashed into the binding, never included in the payload.

A process cache also reuses selected routes for one minute. Missing, invalid, expired or unusable hints fall back to discovery. A valid hint is checked against its original canonical block; each refresh checks the current chain/head, reviewed router code, pool identity and current quote. Preparation and settlement retain their simulation, minimum-delivery, gas, balance, reservation and receipt/finality checks. USD sell conversion uses the same hint. The wallet pauses its background token-balance polling during execution.

V3, V4 and mixed candidate groups now share the head verified within a single preparation. Head age and final block hash are still checked. ERC-20 and Permit2 allowances are read concurrently; exact approval amounts remain unchanged.

## Read-only benchmark

Local ARGUS quotes on September 10, 2026, with 1 USDC buys and 1 ARGUS sells:

| Repeat estimate | Before | After | RPC requests before → after |
| --- | --- | --- | --- |
| Buy | 5.299 s | 2.675 s | 32 → 14 |
| Sell | 7.790 s | 3.454 s | 45 → 22 |

These are individual process-cache measurements, not guaranteed production latency or end-to-end transaction timings. Cold discovery still takes longer. No trades were signed or submitted for this benchmark. Cross-instance reuse is covered by a regression test that clears all process caches before using the signed hint.

The selected route may cease to be the best-priced route while the hint is valid; it is still freshly quoted for the exact amount and slippage. Required approvals and settlement verification continue to take time. This change does not introduce unlimited approvals or bypass confirmations.
