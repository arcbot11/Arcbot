# Argos Bot — follow-up release review

Reviewed 11 September 2026. This supersedes the readiness assessment in the earlier comprehensive review, while preserving that report as history. Application code was not changed. No deployment, configuration change, signature, transaction, launch, or social post was performed.

The normal USDC trading path has working evidence, and the sampled financial queue is clear. Release readiness is still blocked by vulnerable dependencies, a newly reproduced special-case sell regression, and deployment/configuration gaps.

## Findings

### 1. High — production dependency vulnerabilities remain

The refreshed production audit reports one critical and three high affected packages: Next.js, Sharp, Nanoid, and PostCSS through Nanoid. These are affected-package counts, not four independent exploits. Installed Next.js is 15.5.22; the relevant image-optimization advisory identifies 15.5.24 as patched. Sharp's advisory affects versions below 0.35.4; Nanoid's reported range is below 3.3.18.

The application supports remote images and accepts AVIF through its image proxy. This warrants remediation before release, particularly on a server with access to signing-service credentials. Exploit reachability was not established or tested. The separate Windows-hosted Next advisory should not be confused with Vercel's hosting environment. Some audit findings report no automatic fix, so a successful `npm audit fix` is not sufficient evidence of remediation.

Sources: [Next advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). Local evidence: `tmp/review-final-audit.json`, `package-lock.json`.

### 2. High for special-case trading — the new non-USDC sell path fails before preparation

A fresh read-only quote for 1,000 Baby Argus (`0xe4894eC09505aB0FCF357005dF4866F1D90Ae489`) to USDC fails with **“Quote candidates must share input and output currencies.”**

In `lib/arc/trading.ts:126–133`, special-case discovery creates routes ending in both native USDC and ERC-20 USDC, then groups them only by input currency. `lib/arc/quotes.ts:110` requires both input and output currencies to match. Its exception aborts discovery before the mixed-route fallback can run.

This is a regression in the recent special-case support. The earlier successful Baby Argus buy quote did not verify selling. Existing special-case sell tests mock the quote function and therefore miss its actual validation boundary. No funds were moved in this reproduction.

Required change: quote separate input/output currency groups, then compare their outputs using the correct USDC decimal normalization. Add an integration-level regression covering the real quote validator. Keep ordinary USDC-paired tokens on the normal path; only recorded non-USDC pools need expanded discovery.

Evidence: ignored `tmp/review-special-sell.ts` and `tmp/review-special-sell-result.jsonl`.

### 3. High — public financial state still uses the configured development Convex deployment

The public website CSP identifies `aware-okapi-12.convex.cloud`, matching the local endpoint. Both the local deployment selector and deployment key classify as development. This couples development changes and public financial records.

Establish a deliberate production deployment and migration/rollback procedure. Preserve wallet ownership, CDP mappings, reservations, signing fences, nonce history, OTC inventory, credits, and social delivery records. Do not simply switch to an empty production database. Private Vercel environment values and the deployed source revision could not be verified.

The new recovery and routing changes remain local changes in this checkout. Deploy matching Convex mutations before their website/worker callers. Public pages still reference the older social image, confirming at least some UI deployment drift, but not identifying the exact financial-code version running publicly.

### 4. High for X release — deployed X replies remain disabled

Local `X_REPLIES_ENABLED` is true; the configured Convex value is false. `convex/xReplies.ts:112` uses that flag. Correct local settings do not enable the deployed bot.

Fresh authenticated reads identify the correct bot, **@TheArgosBot**, ID `2097696306135220226`. The developer account remains distinct. Credentials are not the current identity blocker. No new publication test was performed, so acceptance of the link-only replies by X remains unverified. One stored interaction is completed and one failed; interaction completion alone does not prove a reply was published.

Enable deliberately when intended, then verify a newly authorized explicit mention through intake, processing, and the actual published reply. Do not replay deleted posts.

### 5. Medium — Arc RPC redundancy remains fragile

From this machine, the configured Arc primary failed every sampled request. Infura returned correct chain/checkpoint/head data and passed balance, nonce, gas and estimate calls, but the sampled `eth_call` returned -32600. Argus passed the sampled reads and contract call. Both Base providers passed the sampled checks.

Contract reads therefore depend heavily on Argus. A failing primary can add latency on cold instances. Check provider behavior from the production region and monitor individual RPC methods. No broadcast was tested: passing reads or gas estimation does not establish submission support. The Argus read endpoint is not a substitute for a verified broadcast provider.

### 6. Medium — the test suite is not a usable release gate

The complete `tests` run produced **2,518 passed, 361 failed, and 20 skipped**, across 230 files, 42 failing. Comparing assertion identities with the previous review found no newly failed or newly resolved assertions. There are 90 additional passing assertions.

Many failures expect removed launch/fee/terminal features or obsolete text and chain IDs. For example, the wallet access failure expects “Your OTC positions” instead of the requested “Your OTC listings”; the signer identity test supplies chain 4663 rather than 5042. These are not evidence that current access control or chain validation is broken. Other assertions still need deliberate triage.

No `.github/workflows` directory exists. `vitest.config.ts` also does not exclude ignored `tmp` diagnostics, so the default test command can collect those. Retire obsolete expectations, keep financial/security coverage, exclude diagnostics, and establish a green CI gate. Do not restore removed features to satisfy old tests.

Root and Convex TypeScript checks passed freshly. The immediately preceding production build passed on the same application source; it was not repeated during this review. A passing build did not catch finding 2.

### 7. Medium — capacity and recovery still need operational verification

Costly public balance reads and image fetching lack an application-level rate limiter in the reviewed paths; external Vercel firewall rules remain unverified. Arbitrary wallet addresses can cause token discovery and pricing work. Authenticated estimate requests also consume RPC capacity.

Worker errors correctly return HTTP 503, and scheduled callers inspect failure counts. Work rotates by update time, but selection is capped at twelve jobs and processing has a 240-second budget. A large or slow backlog can delay later jobs. Load behavior and external alert delivery have not been verified.

Recent recovery code adds never-signed cancellation, durable signing protection, fee replacement, mined-nonce reconciliation, and bounded repeated gas recovery. These are improvements, not a guarantee that every unusual token or missing-provider-proof case completes automatically. No available gas still requires funding; ambiguous signing or unreconcilable delivery must retain protection. The new recovery operations need controlled live validation after deployment.

### 8. Medium/lower — trading coverage and public guidance still disagree

USDC remains the default quote currency. Verified special quote assets can expand discovery, but the route search is bounded; arbitrary hook implementations and arbitrary custom taxes remain unsupported. Full funded mixed V3/V4 execution has not been demonstrated by the read-only buy quote. Unknown or nonstandard token transfer behavior can still require intervention if receipt and balance evidence cannot be reconciled.

The guide advertises `Buy 50 TOKEN`, although social buying uses a USDC/dollar spend amount. It also omits X's required explicit tag and copyable Telegram slash-command forms. “Any token” claims are broader than supported route/hook behavior. Website preparation errors can still collapse into “Request could not be confirmed,” including the special-case regression above.

The live Telegram command menu lacks `/withdraw`, although local configuration includes it. This proves menu drift, not necessarily a missing deployed handler. Public pages still use `argos-social-banner.jpg`, not the newly prepared social card. Many obsolete automated-fee/launch operator scripts also remain in `package.json`; their presence is maintenance clutter, not evidence that those features are enabled for users.

## Verified health and coverage

| Area | Evidence and limits |
| --- | --- |
| Public pages | Home, wallet, OTC, guide, robots and sitemap returned 200. Titles, dog favicon, current X/TG links and footer branding were correct in sampled pages. |
| Public balances and prices | Wallet response returned `partial:false` in about 3.5 seconds in one sample. ETH price and token search endpoints returned 200. This is not a latency benchmark. |
| Wallet access presentation | Signed-out wallet displayed disabled trading controls and an X login link. Home/wallet/initial OTC accessibility trees were inspected. No signed-in transaction was attempted. |
| Mobile | No real mobile viewport/touch or mobile X OAuth round trip was performed in this review. Source checks and desktop accessibility trees are not mobile visual sign-off. |
| Security changes | Wallet and OTC have enforced strict script policy publicly. Image proxy source pins the connection to the checked IP and rechecks redirects; the prior DNS lookup/connection split is fixed locally. No exploit test was performed. |
| CDP | Fresh read-only account lookup resolved both checked existing account names to their expected addresses. No signing operation or full eight-personal-wallet audit was performed. |
| Configuration | Selected CDP, web auth, OTC, Telegram, X and RPC/checkpoint values match local versus configured Convex without exposing their contents. Vercel private values remain unverified. |
| Telegram | Correct @The_ArgosBot identity; 23 completed updates and 11 delivered wallet notifications in the snapshot. No pending social delivery found in those tables. |
| Financial records | All 110 returned OTC records fit the read limit: 89 completed transactions, three completed orders, one expired order, one active listing, two filled listings, two cancelled listings and twelve wallets. No pending financial work found. Two wallet requests were confirmed. Record status was not independently reverified against every historic receipt. |
| Repository secrets | 743 tracked paths/713 text files scanned for loaded secret matches and private-key headers; none found. Private deployment data remains ignored. This is not a full Git-history or all-untracked-file secret audit. |

## Launch plan remains separate

The launch is not authorized by this review. The durable operator launch-and-follow-up-buy runner is still not implemented/verified. Its gas requirements differ from ordinary swaps, and Personal2/Personal4 follow-up buys require fresh balances, prices, approvals, and independent nonce handling. Submission order does not guarantee block ordering across wallets. Saved salts and predicted addresses are operational launch information even though they are not private keys; review their repository visibility.

## Recommended order

Patch vulnerable dependencies; fix the reproduced special-case sell grouping; establish coordinated production deployment and a green release gate; verify provider behavior and recovery monitoring; update TG menu/social metadata/guide; deliberately enable and test X; then run small authorized end-to-end ordinary and special-case trades plus an OTC partial fill and close. Treat launch execution as a separate approval.

Fresh diagnostic evidence is in ignored `tmp/review-final-*`, `tmp/review-special-sell-*`, and the account/deployment checks described above.
