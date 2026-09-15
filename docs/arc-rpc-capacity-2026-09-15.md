# Arc RPC capacity changes

QuickNode allowance supplied by the operator: 50 requests/second. Local dispatch targets 40 requests/second. Convex allocates slots across Vercel, social execution, recovery and operator processes using the same backend. Quotes, balances, gas simulation, approvals, broadcasting and receipt reads all pass through the limiter. Separate tooling bypassing this transport still consumes the provider account limit.

The shared coordinator permits no more than one scheduled dispatch per 25ms. Slots expire after 150ms; late coordinator responses are discarded instead of bursting. The queue is bounded to one second, and admission retries are bounded. Vercel/Convex clocks must remain synchronized. Coordinator failures stop the RPC request rather than bypassing the account budget. A signing/broadcast failure continues to use existing durable recovery; this does not authorize a second transaction.

QuickNode HTTP 429 reads get one bounded retry. Broadcasts do not. Rate limits no longer disable eth_call for one minute or attempt trace_call to evade the quota. Explicit method/monthly quota errors retain their existing cooldown. The main configured endpoint is tried ahead of old fallbacks.

Automatic estimates are limited to once a minute, stopping after two minutes. The initial input debounce remains 500ms. Expired estimates are removed; Refresh estimate performs an explicit request. Selected-token balance polling is once a minute. Approval and swap execution still obtain fresh terms and verify delivery.

## Deploy order

1. Deploy Convex with the rpcCapacity table and rpcCapacity:reserve mutation. It uses the existing OTC_SERVICE_SECRET; no new secret is needed.
2. Deploy the website/backend changes. They require that mutation and fail closed if it is absent.
3. Test concurrent signed-in estimates, then an operator-authorized small buy through any required approvals, swap, receipt and output delivery.

The shared coordinator has unit tests but has not been deployed or live load-tested in this change. Local direct read-only estimates before coordinator integration completed in 2.169 seconds (cold, 47 total HTTP requests) and 0.564 seconds (reused route, 14 HTTP requests), with no 429s. These are not full purchase timings or a throughput guarantee. No live purchase was sent during testing.
