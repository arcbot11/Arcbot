# Arc quote RPC recovery

The reported website error maps to exhausted Arc RPC reads. Reproduced against the same configured endpoints without signing or submitting transactions.

## Causes

- Arc Scan connections failed locally; Infura served chain/block reads but returned `project ID exceeded quota` for contract calls. Argus served useful calls with intermittent HTTP 502 `upstream unreachable` errors.
- A transient miss marked the entire RPC method unavailable, so a failed token read could block unrelated token quotes.
- Network identity validation captured its reference time before a slow connection attempt. A current block returned after that delay could incorrectly appear to be in the future.
- With explorer discovery unavailable, the balance fallback scanned the entire token catalog. Nested retries and concurrent portfolio loading produced 622 requests in a live combined test, including 422 upstream errors and HTTP 429 rate limits.

## Changes

- Retry the exact transient read twice after checking alternatives. Calldata, sender and block stay unchanged. Contract reverts and exhausted quotas are not retried as transient errors; broadcasts retain a single attempt.
- Temporary per-call failures do not cool down every other call of that method. Quick transient identity-read failures are retried before rejecting a provider. Failed connections cool down for a minute rather than being retried throughout the quote.
- Evaluate the block's time against the clock after network reads. Chain, checkpoint, block-hash and freshness checks remain required.
- Rotate exploratory catalog balance probes in groups of 16, at most once per 15 seconds per wallet. Prioritize known, pinned, discovered and previously held contracts; these are checked each refresh. Explorer-failure results remain partial. Limit balance workers to four and avoid retrying an already-exhausted transport another three times.

## Validation

164 relevant tests passed, including transfers, signed recovery, routing, balance display, transient-provider retries, clock delays and paced portfolio scans.

Live read-only quotes after the changes succeeded while portfolio loading ran concurrently: ARGOS 18.5 seconds; BabyArgus 26.8 seconds. The combined run used 198 requests and recorded no HTTP 429 rate limits. It still encountered recoverable upstream errors, and portfolio discovery remained partial. These observations do not guarantee provider uptime or completion of a funded trade.

No live trade, approval or transfer was submitted during this investigation.

## Deployment

The production build passed compilation, type checking, lint checks and page generation. Deployed the four runtime files over production baseline `9f0a1054e901b7db1ae6055e26fd9c865bab6a42` to Vercel deployment `dpl_H3FpQCm2RoQq5A6g3czPdp5GisGt`. Vercel reports READY and `www.argosbot.io` points to it. Public home and wallet requests returned HTTP 200. Authenticated production quotes were not exercised; the live quote checks above ran locally against the configured RPCs.

Changes remain in the local working tree and must be included in the next Git deployment to preserve this direct production fix. No Convex changes were required.
