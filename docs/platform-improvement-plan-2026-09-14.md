# Platform function improvement plan

Reviewed current local code on 14 September 2026 against the recent activity and trade timing reviews. This is a proposed implementation plan; no transaction logic, RPC configuration or deployed settings were changed during this review.

Implementation update: the changes below have now been built locally. See [implementation and verification](platform-improvements-implemented-2026-09-14.md) for the completed work, deployment order, checks, and remaining validation limits. The paragraphs below preserve the original review findings.

## 1. Faster quoting with explicit RPC roles

The earlier read-only comparison reduced cold BABYARGUS/ARGUS quotes from 14–18 seconds to about 3 seconds by prioritizing Infura and using the existing restricted trace fallback. Cached-route quotes took about 1 second. These are local observations, not production service guarantees.

- Separate provider preferences for quote/getter reads, execution simulation, broadcast and receipt verification. A provider that serves tracing well is not automatically suitable for every other role.
- Prioritize measured successful quote reads; retain validated fallback and method-specific cooldowns.
- Keep trace fallback restricted to its reviewed selectors and pinned-block inputs. Execution and delivery verification retain their current semantics.
- Reuse verified route identities across estimate, approval and swap requests. Reprice amounts and check the final minimum output.
- Parallelize independent metadata/code/pool checks at the same block. Do not cache balances or prices as authorization.

Acceptance: repeated cold/warm tests for USDC-to-token, token-to-USDC, paired ARGUS buys/sells and token swaps; execution reverts remain reverts; provider failures do not become “no liquidity”; canonical block and router-code checks remain enforced.

## 2. Prompt, durable transaction recovery

Current website polling calls receipt-only verification. Failed or uncertain broadcasts can wait for the minute worker. Recent approvals spent roughly 89 and 112 seconds between their first recorded submission attempts and mining.

- Schedule targeted recovery from durable state, with a proposed first retry around 3–5 seconds and bounded backoff. Keep the minute sweep as backup.
- Atomically throttle/lease each attempt so browser polling, social handlers and workers cannot create competing recovery work.
- Before retrying, inspect canonical receipts, nonce evidence, prior signed attempts, deadline and funds coverage.
- Retry the same persisted, verified signed bytes through an eligible provider. Never create a new purchase, increment a nonce or produce a new signature merely because the original response is uncertain.
- Recover signing responses using their original idempotency keys before checking whether an unsigned trade would now expire.
- Continue even if the user closes the browser or Telegram.

Acceptance: injected lost broadcast responses, accepted-but-unacknowledged submissions, worker interruptions, simultaneous pollers, externally spent funds and nonce replacements. Each authorized request must have at most one economic execution, with eventual truthful terminal status or a concrete recovery reason.

## 3. Reliable token holdings across channels

The explorer returned an empty list for Odysseus while an on-chain read showed BABYARGUS holdings. All 13 Telegram balance replies in the reviewed six-hour sample were partial. Known-token recovery from shared transaction records already exists on website and social paths; display retention is also present.

- Maintain a compact persistent inventory keyed by chain and normalized wallet address, supporting both X and Telegram ownership models. Update it from verified swaps and token transfers, including recipient wallets.
- Seed balance reads from this inventory and existing transaction records. Keep explorer discovery as an additional source.
- For deposits made outside the bot, incrementally discover token Transfer events with persisted cursors, bounded ranges and reorg handling; inventory entries still require actual balance reads. Never assume all externally deposited tokens can be discovered from bot history.
- Retain the last observed display value across server restarts. A failed read must not erase holdings or restore an old spendable balance.
- Separate known-token balance failures from incomplete token discovery. A successful empty explorer response cannot establish an empty wallet.
- Keep token USD pricing independent so unavailable prices do not block balances.

Acceptance: empty explorer response for a funded wallet; cold process; cross-channel reads; external token deposit; actual zero after sale; unrelated failed token query; missing USD price; no stale balance used to approve spending.

## 4. Smaller, faster wallet requests

`otc:read({owner})` collects all owned/counterparty records. The wallet API rebuilds orders/listings/history and checks Arc, Base and Base USDC before returning a response. The browser repeats this every ten seconds, including when history is collapsed. Token inventory reads also load the owner history.

- Add a small authenticated wallet-summary query for identity, active transactions and commitments.
- Fetch native balances, holdings and history independently so a slow chain or historical order does not hold back the entire page.
- Use paginated history queries, fetching collapsed history only when opened or explicitly refreshed.
- Publish an authenticated, sanitized progress projection for active actions; preserve server-side authorization and avoid exposing signing payloads or service credentials.
- Coalesce duplicate refreshes and refresh affected assets on verified completion.

Acceptance: summary request size does not grow with years of history; pagination preserves access to old records; delayed Base RPC does not suppress Arc rendering; account changes clear previous-wallet data; only owner-authorized private records are returned.

## 5. Fewer approval transactions

Current ERC-20 and Permit2 approvals authorize the exact input amount; the Permit2 allowance expires after ten minutes. Many trades therefore require two approval transactions before the swap.

- Investigate a transaction-bound Permit2 typed-data signature carried with the swap, after verifying the deployed router commands and CDP signing path. This could remove the separate Permit2 approval transaction.
- ERC-20 approval to Permit2 is still necessary. Reusable allowances would change the exposure policy and must not be silently widened to unlimited approvals.
- When an approval is needed, reuse route identity and avoid unnecessary discovery. Always reprice/simulate before the final swap and preserve the original minimum commitment.

Acceptance: replay, wrong wallet/chain/router/token/amount, expired signature, insufficient allowance, zero-first approval tokens, and external revocation. This should follow recovery and quote improvements, not delay them.

## 6. Accurate errors and operational evidence

- Replace the sell-oriented “tokens plus token tax” message on USDC buys with an asset-specific insufficient-funds message. Reject known unfunded requests before expensive route preparation, while still rechecking before signing.
- Keep distinct stages for preparing, signing, submitting, verifying, completed, rejected and paused. Report “processing” only for accepted active work.
- Record sanitized request ID, channel, stage, timings, provider role, RPC method and error category. Do not log private keys, signed payloads, OAuth tokens or keyed endpoint URLs.
- Retain diagnostics for failures before a transaction record exists. Current audits cannot fully reconstruct failed previews.
- Record acknowledgment and last actual progress separately from worker scheduling/touch timestamps, so an unchanged retry does not look like progress.
- Make repeated export close/acknowledgment operations idempotent for the same authenticated grant, preserving ownership/expiry checks. Do not classify a post-success close as a failed key delivery.
- Add non-secret sign-in failure categories and browser-handoff completion events; the current records cannot distinguish abandonment from browser failures in every expired attempt.

Acceptance: user-facing messages match durable state; normal retries do not produce false failure alerts; actionable blocks stay visible; operators can identify where a slow request spent time without accessing secrets.

## Suggested order and measurement

1. RPC role selection and quote timing instrumentation.
2. Targeted submission recovery and truthful progress.
3. Persistent inventory and independent balance refreshes.
4. Smaller wallet queries and paginated history.
5. Approval optimization after compatibility/security tests.

Asset-specific error wording and idempotent export close are small adjacent fixes. Measure median and 95th-percentile time for quote, preparation, signing, broadcast acknowledgment, mining and confirmation separately. Targets should be established from repeated production measurements, not a single successful local quote. Preserve existing OTC escrow isolation, seller-first payouts, exact buyer delivery, fee accounting, nonce recovery, ownership checks and external-spending safeguards throughout.
