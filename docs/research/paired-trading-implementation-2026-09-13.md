# ARGUS-paired trading implementation

Implemented locally on 2026-09-13. No deployment or signed transaction was performed for this work.

## Funding and presentation

- Shared web/X/Telegram planner reads each token's recorded quote asset. Ordinary markets continue to buy and sell against USDC.
- Dollar buys of ARGUS-paired tokens use held ARGUS when it covers the complete quoted buy. Otherwise the entire buy uses USDC through ARGUS in one router transaction. Partial balances are not combined.
- Explicit `buy 100 ARGUS of BABYARGUS` preserves ARGUS units; explicit `buy 10 USDC of BABYARGUS` forces USDC. Dollar wording uses automatic selection.
- Paired sells return ARGUS. Dollar-valued sells still select a token quantity from a fresh USD reference; they do not promise USDC proceeds.
- Website shows the actual spending asset and amount directly above the action, including `Buy with ARGUS`, `Buy with USDC`, and `Sell for ARGUS`. USDC pays network gas in every case.
- Wallet-bound authenticated funding plans freeze the input currency and amount through approvals/recovery. Changed or expired plans cannot silently switch assets. Existing social transactions without plans finish under their previous USDC policy.

## Routing and admission

- Shared canonical-block-checked identity cache; fresh prices for every quote.
- Reviewed quote registry currently contains USDC and ARGUS. Future quote currencies require transfer, decimal, routing and valuation review before admission.
- Portal #7 is recognized with its expected registry identity. Existing per-token hook/pool verification remains mandatory. This does not enable launch creation.
- The reviewed legacy ARGUS V3 buy tax is deducted before feeding intermediate ARGUS into the V4 quote. Direct ARGUS-to-child and child-to-ARGUS paths retain their actual V4 transfer behavior.
- Source allowances, actual balances, gas availability, final output minimum and delivered-token verification remain enforced by the shared transaction engine.

## Validation

Production Next.js build passed, including type checking and lint (existing unrelated unused-variable warnings remain).

347 tests passed across 15 relevant suites; one pre-existing discovery fixture is skipped. Coverage includes funding choice, forced currencies, tampering, wallet/request binding, approval recovery, quote taxes, website and social boundaries, Telegram commands and funding display. A broader run also found 25 failures in the older `walletCommands.test.ts` suite, largely assertions for retired launch/legacy behavior; this is not a claim that the entire repository test suite passes.

Read-only `eth_call` simulation at block `0x13bd65c` used the deployed tokens, pools and Universal Router, the updated quote engine, and a 1% slippage minimum. Temporary wallet code/balance/approval overrides existed only within calls; no signatures or broadcasts occurred.

| Path | Input debit | Quoted and received output |
|---|---:|---:|
| ARGUS → BABYARGUS | 1 ARGUS | 145.133237691657617528 BABYARGUS |
| BABYARGUS → ARGUS | 1,000 BABYARGUS | 6.618709851045948164 ARGUS |
| USDC → ARGUS | 10 USDC | 5,004.685568823774930712 ARGUS |
| USDC → ARGUS → BABYARGUS | 10 USDC | 725,751.362373957017261281 BABYARGUS |

Evidence: `paired-launches-simulation-2026-09-13.json`. These historical simulations are not current price offers or funded CDP end-to-end tests. Other child hooks, taxes and liquidity must still pass sender-specific preparation. Arbitrary quote assets/hooks and all possible multihop tax combinations are not enabled.

## Error handling, speed and timeout follow-up

- Definite preparation failures, including excessive slippage, now return a final error before any transaction is prepared. The same wording during uncertain stored-transaction recovery remains pending; error wording alone is not proof of failure.
- Website estimates retain sanitized API errors instead of replacing every failure with a generic message. Provider diagnostics remain hidden. Read-only quote failures do not suggest that a payment may have been sent.
- Paired trades first quote their recorded markets and verified USDC connectors. Broader discovery remains the fallback when these have no usable quote. This prioritizes the known paired market rather than claiming an exhaustive best-price search across every pool.
- Identical concurrent reads and market discovery are combined. Provider identity evidence is reused only within the existing five-second validation window; balance, price and latest-block results are not cached. Quota/unsupported-method failures cool down for 60 seconds. A broadcast is still attempted only once and never through a read-only provider.
- Buy/sell estimate HTTP timeout: 180 seconds. Website trade API execution limit: 300 seconds. Website preview/confirmation and X/TG caller timeout: 305 seconds, allowing the server response to arrive. Transaction-status tracking continues against the existing record without submitting again.
- No new automatic estimates start after two idle minutes. An estimate already running may finish within its request timeout and remains usable only until its original expiry. Changed inputs still abort obsolete estimates.
- Read-only benchmark from this machine: cold USDC → ARGUS → BABYARGUS estimate improved from 38,857 ms / 136 fetches to 23,884 ms / 88 fetches; refresh from 15,390 ms / 53 fetches to 12,690 ms / 42 fetches. These are individual observations, not latency guarantees.
- Local RPC probe: Arc Scan connection failed, Infura served chain ID but rejected contract calls for quota, Argus returned the correct USDC decimals. This does not establish Arc Scan's availability from production. The configured primary and broadcast roles were not changed.
- Follow-up regression run: 292 passed, one existing discovery test skipped. Tests cover clear errors without reservations, uncertain recovery, estimate errors and extended in-flight waits, route-search avoidance, read coalescing, fresh balances, quota cooldown, and no duplicate broadcast.
