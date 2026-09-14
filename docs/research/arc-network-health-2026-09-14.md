# Arc network failures — 14 September 2026

## Live observations

Provider tests around 16:25 UTC used read-only RPC calls through the configured local endpoints. Both responding providers reported chain 5042, matched the trusted checkpoint and served a fresh head. These are local connectivity observations, not a claim that every Vercel region sees identical results.

| Provider | Working in this sample | Failing in this sample |
| --- | --- | --- |
| Arc Scan primary | None established | Two chain-ID attempts reset the connection (`ECONNRESET`) |
| Infura | Chain, checkpoint, blocks, balances, nonces, gas estimates, fees, logs, transactions and receipts | All five ordinary `eth_call` probes returned `project ID exceeded quota` |
| ArgusPad gateway | Chain, checkpoint, blocks, balances, nonces, gas estimates, fees, logs, transactions, receipts and most contract calls | Intermittent HTTP 502 / `upstream unreachable` |

Before the changes, two ARGOS reference quotes and two TICKER reference quotes succeeded. One of two ordinary Arc send preparations failed after three consecutive ArgusPad simulation failures. No send was signed or broadcast. Normal execution simulations do not use the restricted getter/quoter trace fallback, so a working trace-based quote does not establish that submission preparation has a dependable second provider.

The most recent 600 diagnostic records contained 88 events in the 30 minutes preceding the 16:25 check. Among these were 11 website quote/preview events categorized as network failures and ten worker recovery network failures. They also contained successful estimates, previews and confirmations. These counts are diagnostic events, not distinct users or transactions; older deployed classification may include contract reverts misclassified as RPC errors. The ARCASH minimum-output error has its own separate fix.

Vercel reported production deployment `dpl_EYsmZFcxwHm3FSLuDWvooXdNkM9p`, ready, commit `ccdedac43c86a5c36e6189bb9152a320ccbe0123`. Required Arc environment entries were present. The inspection did not establish their decrypted values, so their equality to the local values is not asserted.

## Local recovery improvements

- A short upstream failure during provider validation previously disabled that entire provider for 60 seconds. Such failures now allow a fully revalidated retry after five seconds. Connection outages and quota backoff retain longer cooldowns.
- Recognized missing-block/state errors and null requested blocks fail over using the exact original block. No request silently changes to `latest`. Missing receipts remain legitimate null results.
- Short transient `eth_call` failures get up to four retries after alternate providers are checked, with 250/500/1000/1500 ms backoff. Contract reverts and quota failures do not enter this transient retry path.
- Connection failures are not retried repeatedly inside the same read request after alternatives are exhausted, avoiding multiplied 12-second waits.
- Chain, checkpoint, fresh-head, transaction simulation and receipt checks remain enforced. Broadcast still makes only one provider attempt per request; ambiguous broadcasts remain the durable worker's responsibility.

In the follow-up live sample all six probes succeeded: two ARGOS reference quotes, two ARCASH-paired TICKER reference quotes and two Arc send preparations. Successful send preparation took approximately 2.0 and 2.4 seconds. Two gateway upstream failures occurred and were recovered. This is a small sample, not an uptime guarantee.

Validation: 78 RPC/trace regression tests passed, including cooldown recovery, exact-block failover, bounded retries, rejection handling, and single-attempt broadcasting.

## Remaining action

Deploy the local changes. Inspect the configured Infura project's usage and method access, and resolve the reported quota restriction. Its working block/receipt methods do not imply working contract-call capacity. No Infura account settings, credentials, production configuration or transactions were changed during this review. Provider-side availability still limits transaction preparation, including Arc OTC transfers.
