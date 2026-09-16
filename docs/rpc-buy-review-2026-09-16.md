# Buy failures and dRPC testing

Read-only investigation; no new swaps or broadcasts submitted.

## Observed failures

Recent stored diagnostics contain both RPC-capacity failures and simulation rejections. These are distinct problems. Two Odysseus ARGUS buys were cancelled before signing:

- `trade:bc74ede3-3649-4f6c-8351-3c4d25203a7d`, 2026-09-16 00:16:12 UTC.
- `trade:63532f35-c59f-41f0-a9b3-f4d269ea2f2a`, 2026-09-16 00:16:54 UTC.

Historical read-only replay reproduced `V3TooLittleReceived()` (`0x39d35496`). At their creation blocks, required minimum output exceeded the V3 quoter's gross output by approximately 1.47% and 1.81%, respectively. Those attempts were stopped by price protection, not an unavailable RPC. Stored preview diagnostics cannot establish the exact revert reason for every earlier failure.

## Local improvements

- Recognize V3 minimum-output failures explicitly, alongside the existing V4 selector.
- Reprice preparation once after a minimum-output rejection, retaining the verified route hint and original slippage. This does not retry submission or relax an already accepted transaction. Post-approval flow still enforces the original minimum.
- Record these errors as `price_moved` instead of generic simulation failures.
- Consume a successful final RPC-capacity batch instead of mistakenly returning busy.
- Space actual shared-permit dispatches even when delayed admissions release several late but valid permits.
- Default new web, X, and Telegram trades to 200 basis points (2%). Explicit limits and saved transactions retain their original values.

## dRPC

Credentials remain in local environment only (`ARC_DRPC_HTTP_URL`, optional `ARC_DRPC_API_KEY`, sent as `Drpc-Key`). Tests verified chain 5042, the trusted checkpoint hash, and a fresh head.

Passed: block reads, native/token balances, nonce, gas price, gas estimation, transaction/receipt lookup, `eth_call`, `debug_traceCall`, and `trace_call`. A historical full ARGUS sell replay passed. Warm individual calls were approximately 73–328 ms across two runs.

Using the application pipeline with only dRPC:

| Read-only preparation | Estimate | Approval preparation |
| --- | ---: | ---: |
| V3 ARGUS | 3.405 s | 2.146 s |
| V4 ARGOS | 2.502 s | 1.786 s |

Both application preparations required token approval; neither signed or submitted a trade. Historical replay supplies separate full-swap simulation evidence. Broadcasting and sustained multi-user load remain untested.

dRPC then passed a direct comparison using the same application code and local pacing. Cold ARGOS estimates took 3.791 s on dRPC versus 5.482 s on QuickNode. Three concurrent warm estimates took 1.173 s versus 1.335 s; all six succeeded without HTTP failures. This is a small sample, not a throughput or availability guarantee.

Configured order when the optional dRPC URL exists:

| Operation | First | Second | Third |
| --- | --- | --- | --- |
| Quotes, balances, simulation, gas preparation | dRPC | Configured primary (QuickNode) | Arc public RPC |
| Receipt and transaction lookup | dRPC | QuickNode | Arc public RPC |
| Signed broadcast | QuickNode | dRPC | Arc public RPC |

Custom fallback URLs remain respected. Broadcast alternatives apply only before an attempted submission; uncertain attempts retain durable recovery with the same signed bytes. Authentication is scoped to the dRPC URL, with redirects rejected to prevent forwarding credentials. dRPC has local 50 ms dispatch spacing; QuickNode retains its distributed capacity control. Arc public RPC remains locally paced at 300 ms. The small tests do not establish the dRPC account's aggregate multi-instance limit.

## Validation

197 tests across 11 targeted suites passed. They cover quote, trade-flow, preparation retry, pacing, default slippage, trade API, Telegram workflow, provider authentication, and provider failover. Website and Convex TypeScript checks and targeted ESLint also passed. Full-project regression status is not asserted by this targeted run.

## Deployment

Deployed to the existing Convex backend and Vercel production. Vercel deployment `dpl_4EaqyfdzKucgBxzQm6mMTpU2LSmb` is READY and aliased to `www.argosbot.io`. Both services received the optional dRPC variables. The deployment used a clean archive of `ca7658804918f35dfeaf7e75353799da6defc3f6` plus an explicit whitelist of RPC, slippage, and quote changes. Unfinished launch changes and unrelated working files were excluded.
