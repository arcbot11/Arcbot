# Argos Bot project review — 11 September 2026

The core application builds and has completed real transactions, but it is not ready for an unattended rollout. The most important remaining work is dependency patching and durable recovery when execution cannot finish normally.

This was a review, not a deployment or a funded transaction test. It covered the current website feature paths, shared Arc/Base execution and receipt verification, OTC reservation/settlement state machines, social intake and delivery, authentication, RPC configuration, production endpoints, dependencies, and the full automated suite. Existing production records were inspected read-only. No credentials, signed transaction payloads, or private wallet manifests are included here.

## Confirmed findings

### 1. P1 — Installed production dependencies have published security advisories

The build uses Next.js **15.5.22**. The production dependency audit reports **one critical and three high package findings**: Next.js, Sharp **0.35.3**, Nanoid **3.3.16**, and PostCSS through Nanoid. These are package findings, not four independently demonstrated exploits.

Next.js has an AVIF image-optimization advisory with a patch in **15.5.24**. The image optimizer remains enabled and the project permits remote images from X and its configured blob host. There is also a Windows-hosted Next.js advisory; that condition matters to Windows hosting and should not be confused with Vercel's production environment. Sharp's advisory is patched in **0.35.4**. Actual exploitability was not tested.

Update the lockfile and relevant overrides, rebuild, and repeat the production audit. Do not assume a successful build resolves an advisory.

Evidence: `package-lock.json`, `package.json`, `next.config.ts:22`, `tmp/review-dependencies.json`. Primary sources: [Next.js AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Next.js Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).

### 2. P1 — An unsigned trade can lock a wallet indefinitely

The confirm endpoint stores the transaction and sets the wallet's `activeTx` before execution. The worker then simulates the stored swap before signing. Router calldata has a roughly two-minute deadline. If a provider/CDP interruption delays the job past that deadline, or the stored minimum output is no longer achievable, the simulation throws. The worker retries the same immutable payload, but there is no managed-wallet transition for safely abandoning a definitively unsigned, unexecutable transaction. The hold and `activeTx` remain, blocking further transactions on that chain.

The existing CLI unsigned-cancellation feature operates on a different journal; it does not resolve this Convex transaction state. Recovery must distinguish a transaction that definitely never reached signing from an ambiguous signing/broadcast attempt. Never unlock an ambiguous signed request just because time passed.

Evidence: `app/api/wallet/trade/route.ts:47`, `lib/otc/transactions.ts:76`, `lib/otc/runtime.ts:131`, `lib/arc/trading.ts:181`, `lib/otc/runtime.ts:357`.

### 3. P1 — A tiny gas refund is still a mandatory OTC settlement step

An order completes only after deposit, Arc delivery, seller payment, service fee, **and gas refund** have all been verified. Refund preparation throws if the remaining balance cannot cover the refund gas margin. Thus buyer and seller can both be paid while the order retains its pending fill and prevents listing closure/cancellation because a tiny remainder cannot be returned.

The code records residual gas credits after a successful refund, but has no equivalent completion path for a refund that is uneconomic before submission. This needs a verified-credit/dust completion path that preserves ownership of the remainder and releases only the completed order's locks.

Evidence: `lib/otc/escrow-runtime.ts:50`, `lib/otc/escrow-model.ts:112`, `lib/otc/model.ts:190`.

### 4. P1 — Accepted OTC gas caps have an incomplete recovery path

Funding, Arc payout, and Base payout steps compare new gas estimates with the originally accepted caps. Exceeding a cap stops preparation. User retry currently handles a transaction with a verified reverted receipt; it does not repair a step that never prepared because its cap was too small. Pending orders cannot simply expire or be cancelled after acceptance.

Fees falling again may allow progress, but that is not a dependable recovery policy. Add a bounded, owner-authorized gas adjustment/top-up or safe pre-payment unwind, selected according to which payments have actually occurred. Preserve the buyer's exact USDC delivery and other owners' gas credits.

Evidence: `lib/otc/escrow-model.ts:60`, `lib/otc/escrow-model.ts:123`, `lib/otc/model.ts:190`.

### 5. P2 — Base verification can reject a successful payment permanently

Base now correctly avoids waiting for safe/finalized settlement. However, native ETH delivery checks compare the recipient's entire end-of-block balance with its previous-block balance and demand an increase at least equal to this transfer. If the recipient also spends ETH or pays gas in that block, a successful transfer can fail this check. Later polling reads the same historical balances, so waiting does not repair it. A contract recipient forwarding received ETH presents a related case.

Use transaction-specific delivery evidence or reconcile other movements in the block while retaining canonical receipt and transaction checks. Arc USDC verification already performs broader block accounting; Base does not.

Evidence: `lib/otc/runtime.ts:263`. This is a code-level edge case, not a claim that one of the current completed orders is still stuck.

### 6. P2 — Telegram intake can lose a command between reservation and scheduling

`acceptUpdate` commits `reserveUpdate` in one mutation and then schedules `processUpdate` from an action. If the action stops between those operations, Telegram's retry finds the existing update and returns success without scheduling it. The update record does not retain its payload for replay. The result-delivery recovery worker cannot repair a command that never reached the execution/delivery queue.

Persist the payload/binding and schedule processing atomically in the reservation mutation, with recovery for stale processing records. Preserve the original linked wallet and update ID when retrying.

Evidence: `convex/telegram.ts:90`, `convex/telegram.ts:352`, `convex/crons.ts:10`.

### 7. P2 — The release test suite is not a usable green gate

The full run produced **2,303 passed, 360 failed, 20 pending/skipped tests**. Next production build and Convex type checking passed. The failing suite contains substantial obsolete launch, automated-fee, terminal, and burn-total expectations. Examples include an old chain-4663 fixture and a wallet heading still expected to say “Your OTC positions.” Some older wallet-denomination and command tests also need reconciliation with the shared Arc implementation; they should not all be dismissed without review.

There are 179 passing test files. Passing suites cover current Arc quoting/routing, USDC verification, Base transfers, OTC locking/settlement, web security, Telegram linking/consent, and X Arc alignment. This does not establish funded execution of every route.

Retire tests for intentionally removed features, repair current-feature assertions, and make build/typecheck/current tests mandatory in CI. There is no `.github` workflow directory in this checkout.

Evidence: `tmp/full-review-tests.json`, `tmp/review-build.log`, `tmp/review-convex-typecheck.log`, `package.json:10`.

### 8. P2 — The documented standalone Arc CLI currently fails to start

Running `node --use-system-ca --experimental-strip-types scripts/arc-quote.ts --help` fails with `ERR_MODULE_NOT_FOUND` for `lib/project-config`, imported by `lib/arc/config.ts`. Node's native TypeScript execution does not resolve the extensionless imports as the Next/Convex bundlers do. Other CLI commands importing the same graph are exposed to this problem.

Use a consistent supported TS runner/build for operator scripts and verify their read-only startup paths. This is separate from the website build, which succeeds.

Evidence: `package.json:39`, `lib/arc/config.ts:1`; reproduced without submitting a transaction.

### 9. P2 — Worker failures and backlog handling are not ready for scale

The worker returns HTTP 200 with a `failed` count when individual jobs fail. Convex's scheduled caller checks only HTTP status, so an invocation where all jobs fail still appears successful at that boundary. Errors are logged and notes retained, but this path does not escalate stale financial jobs to an operator.

The work query also selects only the first 50 records per status before the worker rotates by `updatedAt` and takes 12. Fifty permanently stuck records in a status can prevent later records in that status from entering recovery. Owner history and active-market queries use unpaginated `collect()` calls.

Add explicit failed/stale-job monitoring and indexed, paginated work selection. This is a scalability/recovery limitation; the inspected production database is currently small and has no pending settlement backlog.

Evidence: `convex/otc.ts:98`, `convex/otc.ts:143`, `lib/otc/runtime.ts:347`, `lib/otc/runtime.ts:360`, `app/api/otc/worker/route.ts:11`.

## Supported features and remaining limits

| Feature | Current status | Remaining limitation or validation |
| --- | --- | --- |
| Home, navigation, guide, footer | Production pages render; Argos branding and current X/TG links observed | Guide is not a platform-specific command reference; generic examples omit the explicit X mention and Telegram slash syntax. |
| Mobile layout | Home, guide, signed-out wallet and OTC inspected at 390 × 844; no major clipping observed | Logged-in holdings, long histories, a populated four-column market, and active trade states were not visually exercised in this pass. |
| Metadata, favicon, social banner | Argos title/icons configured; production assets and canonical domain checked | No fresh preview fetch performed from inside X/TG clients. Their caches may differ. |
| X website login | Login entry uses the new domain/callback; server session checks reviewed | Full user OAuth consent/sign-in was not performed in this review. |
| Session expiry/logout | Signed cookies, server revocation, CSRF and Origin checks; 2-hour session, 30-minute recent-auth boundary for writes | End-to-end expiry during an active user trade remains a live test. |
| Public wallet URLs | Public balance endpoint returned 200 with `partial:false`; no private order/session fields exposed by that route | Public endpoint reads can be RPC-expensive; no application-level request limiter was found on this route. |
| Wallet controls | Buy/sell/swap/send shown disabled while signed out | Signed-in click-through requires user authentication; not fabricated for review. |
| Arc USDC balances | Live endpoint works and canonical-USDC-only indexing tests pass | Depends on healthy RPC fallback. |
| Arc token cards / selected balance | Explorer discovery plus on-chain balances; selected-token balance, USD estimate and tax-aware max implemented | Discovery is bounded; non-indexed token metadata/history may show a CA or base units. Explorer/RPC outages can yield partial holdings. |
| Token ticker search | Production search endpoint works; catalog/search tests pass | Unknown symbols still require a contract. Duplicate handling must remain conservative. |
| Buy / sell | Shared quote/prepare/sign/verify machinery; current test suites pass; historical transaction records exist | Recovery issue 2; repeated on-chain approvals can add latency. |
| V3 routes | Deployed-router encoding covered by current tests | No new funded V3 transaction submitted during review. |
| Hooked V4 routes | Token-specific hook/pool discovery and V4 multihop implemented and tested with mocks | Only recognized/verified pool structures supported; no claim of arbitrary hook support. |
| Mixed V3/V4 | Implemented for two pools joined by **ERC-20 USDC**, with ERC-20 endpoints | Native-USDC bridges, longer mixed routes, and arbitrary intermediate assets are unsupported. See `lib/arc/routing.ts:128`. |
| “Any Arc token” claim | Broader than actual supported routes | No-liquidity pairs, unsupported hooks/routes and nonstandard token behavior can fail. The API reports unsupported liquidity rather than guaranteeing a trade. |
| Tax-aware maximum | Recognizes the reviewed legacy Argus clone implementation; percentage buttons use adjusted maximum | Other custom tax implementations return unknown-as-zero in the tax estimator. Simulation/debit guards can reject the trade, but 100% selling is not universal. See `lib/arc/transfer-tax.ts:21`. |
| Amounts, USD mode, percentages | Shared helpers, precision rules, buy/sell debounce and refresh covered by tests | USD token quantities are estimates from pricing/quotes, not an exact-output trading guarantee. |
| Approval handling | Automatic workflow; hidden from normal history; approval receipts checked | No Permit2 signature optimization; exact on-chain approvals/expiry can require additional transactions. |
| Arc sends / burns | Shared preparation, locks and receipt delivery checks; burns use the dead address | Nonstandard ERC-20 delivery behavior may fail verification; dedicated burn commands are on X/TG, while the website provides Send. |
| Buy-and-send / buy-and-burn | Shared swap destination handling and social tests pass | No fresh funded destination-delivery test this review. |
| Transaction history / completion | Latest-first history and actual swap output are implemented | Unknown tokens/unsupported history decoding can have less detail. Prepared-job recovery and Base verification findings still affect statuses. |
| Base ETH balance, USD value, withdrawal | Current Base reads/fees respond; ETH-only website controls | Finding 5; no fresh withdrawal submitted. Base USDC controls are intentionally removed. |
| OTC create / escrow funding | Dedicated CDP account per listing, budget/gas calculations, verified funding | Funding gas recovery in finding 4. |
| OTC partial purchase / concurrency | Atomic Convex reservations and wallet leases; current tests cover competing fills, cancel races, duplicate requests | Multi-user production load was not simulated with funds. |
| OTC premium / service fee | 0–10,000% premium, $10 minimum, 1.5% fee and premium acknowledgement implemented | Configured fee recipient is fixed by backend policy; actual historical fee amounts were not re-audited transaction by transaction in this pass. |
| OTC Base payment | Version-2 workflow collects payment and payout gas in one Base ETH deposit | No new Base USDC purchase path; old-record compatibility code remains. |
| OTC delivery / payouts | Deposit verified before Arc delivery; seller and fee payouts follow verified preceding steps | Backend-controlled cross-chain escrow is sequential, not a trustless atomic swap. Findings 3–5 apply. |
| OTC cancellation / small remainder close | Locks retained while quotes/fills settle; unsold return triggers closure | Final gas refund/cap failures can still prevent closure. |
| OTC live market / cards | Convex public subscription, price ordering, production empty state and listing modal reviewed | Populated market rendering and concurrent interactive buyers not exercised live. |
| X identity/configuration | Live `/users/me` confirms **@TheArgosBot**, ID 2097696306135220226, read-write access | `X_REPLIES_ENABLED=false` locally and in Convex. Bot will not process/reply normally until enabled. No post was made. |
| X command intake | Explicit tag and self-post exclusion; retired launch/claim/burn-total policies and Arc alignment tests pass | No live mention→trade→reply acceptance test under the new identity. |
| X ambiguous ticker flow | Remaining guided exception is contract clarification | Needs live reply-thread acceptance testing with the bot enabled. |
| X result delivery | Durable queue and continuation machinery present | Provider permissions/rate limits and actual publication remain unverified by a real post in this review. |
| Telegram webhook/menu | Correct **@The_ArgosBot** webhook; enabled; zero pending webhook updates and no reported webhook error | Only one completed update and no linked TG wallet observed. |
| Telegram wallet link | X consent, one-use nonce and original-link binding covered by tests | Real link→wallet→funded command→result flow still required. |
| Telegram commands/buttons | Slash parser, navigation buttons, no AI chat; same Arc backend | Finding 6; buys accept USDC/$ spend, not every generic guide token-amount example. Recipients use full wallet addresses. |
| CDP existing wallets | Current API credentials can read an existing wallet; local/Convex signing credentials match | A fresh signing/broadcast operation was not performed; Vercel environment values were not exported and compared directly. |
| Retired functions | Launches, old market endpoints and other removed product routes remain blocked/retired | Consider removing unused old modules/scripts/tests after preserving any historical recovery dependencies. |
| Git/private operator files | Existing staged hygiene changes preserved; no new private manifests added | Those staged changes still need the user's normal commit/push process. |

## Live service observations

These are point-in-time observations, not service guarantees.

- **Arc Scan primary:** connections to `rpc.arc-scan.org` failed with `ECONNRESET` from this machine. This is not proof that Vercel sees the same failure.
- **Arc Infura backup:** chain ID, checkpoint, head, balances, nonce, fee and basic estimate reads succeeded. The sampled USDC `eth_call` returned RPC error `-32600`.
- **Argus read provider:** checkpoint/head and sampled balance, nonce, fee, estimate and USDC contract-call reads succeeded.
- **Base primary and Tenderly backup:** chain/checkpoint/head and the sampled balance, nonce, fee, estimate and contract-call requests succeeded.
- **Production public wallet:** returned balance/token data in about 3.4 seconds with `partial:false`. ETH/USD and ticker search endpoints also returned 200.
- **Broadcast:** no new valid signed transaction submitted. Read-provider success does not establish transaction broadcast support or fallback recovery.
- Home, guide, wallet, OTC, robots and sitemap returned 200. `/api/market/snapshot` returned an intentional 410 retirement response.
- Current local/Convex CDP, web authentication, OTC service, Telegram, X OAuth-1 signing credentials and Arc/Base checkpoint settings matched without displaying their values.
- Production OTC storage contained **71 completed transaction records and three completed orders**, two filled listings, two cancelled listings, and one expired quote. No unfinished OTC transactions/orders/listings appeared in the inspected records.

## Validation and next work

Build: passed. Convex type check: passed. Full tests: 2,303 passed / 360 failed / 20 pending. Production dependency audit: four affected package entries. The Windows Telegram check printed a successful API result and then encountered a local Node `UV_HANDLE_CLOSING` assertion; the Telegram API results themselves were successful.

Recommended sequence: patch dependencies; implement safe unsigned-transaction recovery; finish OTC gas/dust recovery; repair Base delivery accounting; make Telegram intake durable; restore a meaningful green test/CI gate; then run controlled, small-value end-to-end website/X/TG and V3/V4/mixed-route tests. Verify login, completion messages, balances, listing locks, browser closure, duplicate requests and interrupted workers in that acceptance pass.

No application fixes, environment mutations, bot posts, fund movements or deployments were made during this review.
