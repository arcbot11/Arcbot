# Platform improvements — implementation and verification

14 September 2026. Local implementation; no production deployment or financial transaction was performed for this task.

## OTC listings remain visible

An active listing stays on the market while a purchase settles, including when the purchase temporarily reserves all of its remaining USDC. Its displayed available amount updates from the durable reservation. Buy and cancel controls are disabled while settlement holds the listing. After settlement, a remaining tradable listing becomes purchasable again; closed listings leave the market.

Quote requests still do not reserve listings. Atomic confirmation, escrow settlement ownership, and backend checks continue to prevent two buyers from purchasing the same reserved funds. The UI is not the authorization boundary.

## Implemented platform changes

1. **RPC roles and quote preparation.** Quote reads prefer the configured Infura endpoint, then Argus, with existing eligible fallback endpoints retained. Execution simulation and broadcasts retain separate provider selection. Restricted trace fallbacks remain restricted. Independent pool/code/liquidity reads run concurrently at the same block; existing verified route hints still receive fresh pricing. Insufficient input funds are detected before expensive discovery. RPC diagnostics record role, method, elapsed time, and an error category without endpoint secrets or call parameters.

2. **Durable recovery.** Transactions schedule a targeted retry after five seconds, backing off to thirty seconds. Convex leases prevent competing recovery attempts, and broadcast throttling prevents immediate duplicate attempts. Retries use the existing persisted transaction and signature. A completed escrow step can immediately advance its parent settlement. The minute worker remains the backup, including parent steps whose preparation fails before a new transaction exists. Actual progress timestamps are separate from worker touches.

3. **Persistent holdings.** A Convex inventory remembers verified swap and transfer tokens for both sender and recipient wallets. Wallet reads seed from that inventory and a bounded recent-history bridge. External ERC-20 deposits are discovered from canonical Transfer logs: recent blocks first, then incremental history back to the configured checkpoint. Last observed display balances survive process restarts, while spendable balances still require current checks. Verified zeros remove old holdings. Incomplete discovery is distinct from a failed balance read. Price requests have separate bounded concurrency and a 1.5-second display budget; unavailable prices do not hide token balances.

4. **Independent wallet loading.** Arc, Base, Base USDC, and history load independently. Collapsed history is not polled. Listings, orders, and transactions have owner-scoped pagination and load-more controls. Materialized listing totals avoid rebuilding sales from an entire account history. Open listings receive priority on the first page. Account changes clear prior private data. Safe unpaid-purchase cancellation and verified transaction links are preserved in the new projection.

5. **Bounded Permit2 signatures.** Where customer ownership and CDP support are verified, the swap can carry a Permit2 signature instead of requiring a separate Permit2 approval transaction. The signature binds the wallet, token, exact amount, nonce, chain, reviewed router, and short expiry. It is recorded under a durable signing intent and reused through CDP idempotency. ERC-20 allowance remains exact, including zero-first approval handling. Failed signature preparation falls back to the existing exact on-chain approval. Export and permit-signing fences exclude each other; a recent permit intent can delay key export until its three-minute expiry. Expired intents are cleaned during later preparation.

6. **Progress and diagnostics.** Preparing, signing, submitting, verifying, paused, and terminal states have explicit projections. Sanitized website and social preparation failures are recorded even before a transaction exists. Diagnostic persistence cannot hold a recovery response indefinitely. Sign-in completion/handoff events are logged without authorization codes. Repeated acknowledgment of the same successfully closed export is idempotent while browser, account, and session bindings remain enforced.

## Verification

- 512 distinct targeted regression tests passed across the final focused runs. Coverage includes OTC reservation/settlement, signed recovery, transport and restricted tracing, V3/V4/mixed routing, website/social trading boundaries, persistent inventory, wallet history authorization, Permit2 signatures and export fences, and export/sign-in behavior.
- Web TypeScript and Convex TypeScript checks passed.
- Focused ESLint checks passed without warnings. The broader build retains warnings in unrelated existing files.
- Production builds passed. System CA trust was used on this Windows machine; certificate verification was not disabled.
- A read-only simulation verified the deployed Arc router bytecode and successfully executed the bundled Permit2 command using a newly generated empty ephemeral address. No transaction was broadcast and no customer signing key was used.
- `git diff --check` passed.

The unfiltered repository-wide test run is **not green**. It collected scratch `tmp` review tests and legacy/retired workflow tests alongside current tests, and reported 423 failing assertions. This task does not establish that every such failure predates the changes. The focused passing tests are the validation for this implementation, not a claim that the entire repository suite passes.

## Deployment and remaining validation

Deploy Convex before the website. This adds the inventory, recovery, diagnostics, permit-intent, and listing-total tables/indexes and functions used by the new website routes. The existing minute tick starts a resumable, bounded history backfill; listing history reports that it is updating until that migration is ready. No new environment variable is required; existing CDP, service secret, RPC, and worker URL configuration must remain available in their respective runtimes.

After deployment, verify one ordinary trade, one partial OTC purchase, and wallet history on both an X-linked and Telegram-linked account. Check targeted recovery scheduling, listing visibility, fresh balances, signing fallback, and completion notifications. A funded end-to-end trade using a customer CDP Permit2 signature has not been performed during this task. Deployment-time signing permissions and end-to-end production timing remain to be measured.

Token discovery is bounded and incremental, not an immediate full-chain scan. A failed log provider leaves the cursor unchanged; missing historical tokens can take additional refreshes to discover. Nonstandard tokens without normal Transfer logs still require the explorer, catalog, or an explicit contract lookup. These display inventories and retained values are never spending authorization.

Recovery cannot guarantee a fixed completion time during provider outages, nonce conflicts, or external spending. It preserves the existing concrete blocked states and reconciliation requirements rather than releasing funds on a timeout. OTC remains backend-controlled settlement across two chains; seller-first payout and exact buyer-delivery checks remain in force.
