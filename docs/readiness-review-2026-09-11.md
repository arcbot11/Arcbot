# Argos Bot readiness review — 11 September 2026

The core product is working and is substantially closer to release. I would still fix the security advisories and remaining recovery dead ends before an unattended public rollout. This report supersedes the earlier review where it discusses fixes made since then.

This was a review, not a deployment or a transaction test. I inspected the current local implementation, built the app, checked Convex types, ran the full suite, checked public production pages and APIs, read selected Convex records and service configuration, authenticated read-only X/TG/CDP requests, and reproduced an OTC failure with mocks. No funds were moved, posts sent, credentials changed, or application fixes applied. Records changed during the review as real users continued using the project.

## Findings to address before rollout

### 1. P1 — Production dependencies still have security advisories

Installed Next.js is **15.5.22** and Sharp **0.35.3**. The fresh production npm audit reports **one critical and two high affected packages**: Next.js, Sharp and Nanoid. This is a package audit, not three demonstrated exploits.

Next's AVIF image optimization advisory affects the installed version and is patched in **15.5.24**. Image optimization remains enabled; the configuration allows remote images from X and the configured blob host. Sharp's advisory is patched in **0.35.4**. Nanoid's reported affected range is below **3.3.18**. Update the actual lockfile resolution and repeat the audit/build. The separate Windows-hosted Next advisory should not be assumed to apply to Vercel's runtime.

Sources: [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). Local evidence: package-lock.json, next.config.ts:22, tmp/readiness-audit.json.

### 2. P1 — An expired trade can still get stuck after a signing attempt started

The new cancellation path fixes trades that expire **before signing starts**. It deliberately refuses cancellation once signingStartedAt exists. That safety rule is appropriate, but there is still a missing reconciliation path.

Concrete sequence: the worker records begin_signing; CDP times out or its reply is lost before raw signed bytes are stored; the router deadline expires. The next worker pass cannot cancel because signingStartedAt exists, and re-simulates the expired swap before asking CDP for the idempotent signing result. That simulation fails first. The wallet lease and reservation therefore remain, and the worker never reaches signing-result recovery.

Recover/reconcile the original signing request before imposing a fresh simulation on that already-started attempt. Do not unlock merely because signed bytes are absent. Also provide an operator recovery path for definitively rejected signing and stuck underpriced signed transactions; re-broadcasting immutable bytes alone does not solve every fee/nonce problem.

Evidence: lib/otc/runtime.ts:116, 139, 168; lib/otc/unsigned-recovery.ts:22; lib/otc/signing.ts. This is a code-path finding, not a currently stuck production wallet observed in this review.

### 3. P1 — The dust refund fix still leaves a narrow settlement dead end

A Base remainder at or below **0.000001 ETH** is now retained as an owner-attributed credit and does not block completion. Above that cutoff, the refund path requires the remainder to cover **twice the estimated refund gas**. A remainder can exceed the fixed dust cutoff yet still fail that second requirement.

I reproduced this with all principal payouts marked verified: remainder **0.0000015 ETH**, estimated refund allowance **0.000001 ETH**. The code throws “Escrow needs gas to return the remaining funds,” does not finalize the order, and retains the pending listing state. These are test values, not a measured live order.

Handle uneconomic refunds within an explicit owner-approved small-value ceiling, based on actual refund economics as well as the fixed threshold. Preserve other owners' gas credits and never discard an existing submitted refund.

Evidence: lib/otc/escrow-runtime.ts:52, 94–97. Reproduction: tmp/readiness-edge.test.ts; its single selected proof test passed by reproducing the expected failure.

### 4. P2 — Gas recovery has limited coverage and its errors are obscured

A current order can make one bounded gas recovery deposit per chain. It cannot complete that recovery if the buyer/seller no longer has spendable funds, and a subsequent increase can exhaust the already-used allowance. This is a deliberate spending bound, but it needs a clear operational response.

The new messages “Add funds for settlement gas. The recovery allowance is already used” and “Settlement gas exceeds the small recovery allowance” are not classified by settlementFailure. They become generic **Pending verification**, including in the worker's sanitized log. That makes a condition requiring funding/intervention look like a normal receipt wait. HTTP 503 now exposes a failed run, but does not identify what needs fixing.

Add stable diagnostic codes and explicit operator guidance for these states. Keep spending capped and exact buyer delivery unchanged. Verified reverted top-ups have a retry path; a top-up that never prepares cannot be repaired by that revert-only retry.

Evidence: lib/otc/escrow-runtime.ts:83–85, lib/otc/gas-recovery.ts, lib/otc/settlement-error.ts, lib/otc/runtime.ts:353.

### 5. P2 — The release test suite is not a reliable green gate

Fresh full run: **2,341 passed, 360 failed, 20 skipped/pending**. Build and Convex typecheck passed. Many failures are obsolete launch, fee, terminal, and burn-inquiry tests, but some are current-feature expectations such as gas help, amount interpretation, wallet display, and flood protection. They must be triaged rather than all dismissed as obsolete.

There is still no .github workflow directory in this checkout. Retire obsolete expectations, resolve current-feature failures, and require a clean current-feature suite plus build/typecheck in CI before release. Current dedicated recovery, routing, account-linking and transaction tests pass, but a red full suite can conceal a new regression.

Evidence: tmp/readiness-tests.json; package.json; tests/gasHelp.test.ts, tests/nativeSendDisplay.test.ts, tests/walletPageAccess.test.tsx and other failures listed in the test report.

### 6. P2 — Main financial pages miss the intended strict script policy

middleware.isSensitivePage matches /wallet/ descendants, but not the exact **/wallet** route, and does not include **/otc**. Those principal financial pages receive the fallback script policy with unsafe-inline instead of the nonce-based script policy used for selected sensitive routes. This is a defense-in-depth gap; I did not demonstrate an XSS exploit.

Include the actual wallet and OTC routes in the strict policy, then verify Next hydration/navigation and the listing dialog under it.

Evidence: middleware.ts:16, 39.

### 7. P2 — Public image proxy validates DNS separately from the actual connection

The image proxy checks hostname resolution for private addresses, then calls ordinary fetch with the hostname. Fetch can resolve it again. There is no code binding the outbound connection to the already-approved IP, leaving a DNS-rebinding gap. Redirect destinations are revalidated and response sizes/types are bounded, which helps but does not close the resolution race.

Pin resolution through the HTTP transport or use a trusted image-host allowlist. This is a code-level gap, not a successful internal-network access test; production network restrictions may further limit impact.

Evidence: app/api/token-image/route.ts:39, 47.

## Configuration and production observations

- X credentials authenticate successfully as **@TheArgosBot**, ID **2097696306135220226**. **X_REPLIES_ENABLED=false** in local and Convex configuration. The bot will not normally process/reply until enabled. This is an activation setting, not a credential failure; it was not changed.
- Telegram authenticates as **@The_ArgosBot**, ID **8280311402**. The webhook targets https://www.argosbot.io/api/telegram/webhook, has zero pending updates and no returned last-error message. Telegram is enabled locally and in Convex.
- One active Telegram wallet link was observed. A later read found a **confirmed Telegram buy and confirmed Telegram sell**, both with transaction hashes. This is useful live execution evidence, but those receipts were not independently re-audited transaction by transaction here and do not cover every route/command.
- The initial OTC snapshot contained **83 completed transaction records**, three completed orders, two filled listings and two cancelled listings. No pending OTC transactions/orders/listings appeared in that snapshot. It was a point-in-time read during ongoing use.
- Three social queue CLI outputs were not parseable as JSON in the review helper. Do not interpret that as proof that those queues were empty or that recovery workers ran successfully.
- Local and Convex values matched for the inspected CDP credentials, web/OTC secrets, Telegram secrets, X OAuth-1 credentials, and Arc/Base RPC checkpoint settings. Values were compared without printing them. This does not verify Vercel's private environment values.
- CDP read access successfully resolved both existing account-name mappings to their expected public addresses. No fresh signing call was made.
- Vercel API discovery did not identify a matching project in the available account/team result. The public website is reachable, but I could not independently match its deployment commit to this checkout or compare its private environment settings. The absence of a match is a review limitation, not proof the deployment is missing.
- The tracked-file scan covered **732 paths / 702 text files** and found no exact current-secret matches, literal private-key matches, or provider-key URLs. Private manifests, env files and deployment state are ignored. This was a current tracked-tree scan, not an exhaustive historical secret audit.

## RPC and endpoint observations

| Check | Result |
|---|---|
| Arc primary configured RPC | Calls failed from this machine; not evidence every hosting region fails |
| Arc Infura backup | Correct chain/checkpoint/head; balance, nonce, fee and estimate reads succeeded; sampled contract call returned -32600 |
| Argus read RPC | Correct chain/checkpoint/head; sampled reads, estimate and contract call succeeded |
| Base primary and backup | Correct chain/checkpoint/head; sampled balances, nonces, fees, estimates and contract calls succeeded |
| Public home, guide, wallet, OTC | HTTP 200 |
| Robots and sitemap | HTTP 200 |
| ETH/USD API and ARGUS token search | HTTP 200 |
| Public wallet balance/token endpoint | HTTP 200, partial:false, about 2.9 seconds in the sample |
| Retired market snapshot | Intentional HTTP 410 |
| Broadcast failover | Not tested with a new signed transaction; read success is not broadcast proof |

Arc contract calls deliberately prioritize Argus ahead of Infura in the fallback path. A failed primary therefore need not mean the application is unusable. Broad public wallet/image endpoints still lack an application-level rate limiter; assess Vercel protection and RPC cost limits before increasing traffic.

## Feature-by-feature status

| Feature | Current status and remaining limit |
|---|---|
| Home/navigation/branding | Public browser inspection shows Argos branding, correct X/TG links, wallet link and affiliation disclaimer |
| Metadata/social/favicons | Current metadata configuration and shared title are present; this pass did not visually revalidate every image crop/platform preview |
| Signed-out wallet | Buy/sell/swap/send controls are visible and disabled; no Base box without an applicable balance |
| X website login/logout | State + PKCE, signed sessions, server-side revocation, CSRF/Origin checks and recent-auth spending boundary implemented; full mobile browser/app handoff still needs acceptance testing |
| TG linking | New OAuth-return token is completed only by the originating TG account, with one-use and identity collision checks; no second website confirmation page. Telegram may require its Start button |
| Public wallet pages | Public chain data only; sampled endpoint complete. Private session/order data is not returned by that route |
| Token search/catalog | Canonical-USDC-only policy and indexed ticker lookup covered; unknown symbols still require a CA |
| Token balances/value/percentages | Shared balance and amount helpers, token cards, percentages and USD estimates implemented; bounded discovery can omit unsupported holdings |
| Arc buys/sells | Shared website/social preparation/signing/receipt path and confirmed TG buy/sell records; recovery finding 2 remains |
| V3 | Current router encoding covered by tests; tax-aware selling recognizes reviewed implementation/clones |
| Hooked V4 / new Argus Portal | New 11-word Portal decoder and recorded quote/hook/pool checks included; previous turn verified a real newest-Portal token read-only |
| V4 and mixed multihop | Up to three pools, ERC-20 intermediates; bounded candidates, no arbitrary hooks or native mixed bridges. New three-hop funded execution not established |
| Custom taxes | Unknown implementations are not universally modeled; simulation/debit guards may reject maximum sells. “Any token” marketing is broader than actual supported execution |
| Sends/burns | Shared native/ERC-20 delivery checks; burns use the dead address. Unusual token behavior is not guaranteed |
| Buy-and-send/buy-and-burn | Shared destination and swap path; no new funded acceptance test in this review |
| Approvals | Automatic, receipt checked, hidden from normal history; still separate on-chain transactions when needed |
| Status/history/refresh | Actual receipt output, descending history, balance refresh and retrying status polling implemented |
| Base ETH withdrawal | Website-only; canonical successful native transfer verification avoids block-wide recipient-spending false negatives |
| OTC create/fund | Dedicated CDP wallet, total-budget gas deduction, minimum amount and funding verification implemented |
| OTC quotes/concurrency | Atomic reservations prevent duplicate spend; current escrow quote policy allows only one pending fill per listing, including a reserved quote |
| OTC premium/fee | Up to 10,000% premium and 1.5% service fee after premium; buyer acknowledgment required |
| OTC payment/delivery | Combined Base ETH payment/gas deposit, exact Arc delivery, seller/fee payouts; backend-controlled sequential escrow, not cross-chain atomic execution |
| OTC cancel/close | Active fills prevent cancellation; returns preserve others' credits; fixed small-dust cases complete, but finding 3 remains |
| OTC gas recovery | One bounded recovery deposit per chain; source is the relevant participant; residual limits and diagnostics in finding 4 |
| X commands | Explicit tag/self-exclusion and shared Arc authorization checks present; disabled in production config and no live post acceptance test here |
| TG commands/buttons | Slash/button-only interface; shared Arc command path. Confirmed buy/sell records observed; other command combinations still need acceptance coverage |
| Guide | Generic examples lack TG-specific slash syntax and include token-denominated buying while TG's buy parser expects USDC/$ spend; clarify platform-specific examples |
| Workers | Failures return 503 and scheduled caller checks them; age-index rotation exists. No production load/alert-delivery validation in this review |
| Operator tools | Repaired Node TS resolution is present; previous turn verified eight CLI entry points. project:health still checks obsolete fee/legacy-wallet services and should not be treated as current launch readiness |
| Retired functions | Public policy blocks retired workflows, but substantial old code/scripts/tests remain and add maintenance noise |

## Validation limits and release sequence

The public home and signed-out wallet were inspected through the browser, and OTC markup/CSS was reviewed. Responsive CSS has one-/two-/four-column market breakpoints, wrapping and touch-target provisions. I did not complete a signed-in populated mobile viewport walkthrough in this pass. Do not equate that with a complete mobile acceptance sign-off.

1. Patch dependency advisories and restore a meaningful green CI gate.
2. Close the started-signing reconciliation and above-threshold uneconomic refund paths; expose actionable gas recovery diagnostics.
3. Tighten financial-page CSP and image proxy connection validation.
4. Verify that matching Convex schema/functions/crons and Vercel code/env are deployed.
5. Run controlled acceptance tests: mobile TG link; X tag/response; website and TG send/burn/swap; hooked V4 and three-hop routes; OTC partial purchase, refund, cancel and interruption recovery; session expiry and duplicate requests.
6. Enable X replies only when ready to receive real commands. Verify scheduler errors reach an operator and define who handles the bounded recovery exceptions.

Build: passed. Convex typecheck: passed. Full suite: 2,341 passed / 360 failed / 20 skipped. Additional mocked refund-stall reproduction: confirmed. No application fixes or deployment were performed by this review.
