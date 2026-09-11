# Argos Bot — comprehensive release review

Local follow-up: issues 2, 5 and 6 have implementation fixes and focused validation documented in [Recovery and routing fixes](RECOVERY-AND-ROUTING-2026-09-11.md). The findings below preserve the original review; they are not a new deployment assessment.

Reviewed 11 September 2026 against the current checkout, its local changes, the public website, configured Convex data, and read-only provider/account checks. No deployment, setting changes, messages, approvals, signatures, or transactions were performed. Only this report and ignored diagnostic files were added.

**Assessment: core flows have working evidence, but several release blockers remain. Do not treat a successful build or an empty recovery queue as proof of readiness for unattended public use.**

## Priority findings

### 1. High — vulnerable production dependencies remain installed

The fresh production audit reports one critical and three high affected packages: Next.js, Sharp, Nanoid, and PostCSS (the last through Nanoid). These are affected-package counts, not four independent exploits. The build reports Next.js 15.5.22. The relevant Next image-optimization advisory is patched in 15.5.24; Sharp's advisory affects versions below 0.35.4. Nanoid's audit range is below 3.3.18.

This is material for a wallet server holding signing-service credentials. The app enables Next image optimization for remote hosts, and its public image proxy accepts AVIF. I did not attempt an exploit or establish that an arbitrary malicious image reaches the vulnerable decoder. The separate Windows-hosted Next advisory must not be assumed to describe Vercel's runtime.

Action: update resolved dependencies and lockfile, check actual installed versions, rerun audit/build/tests, then deploy. Do not rely on `npm audit fix` alone: some audit entries currently report no automatic fix.

Primary sources: [Next advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). Evidence: `package-lock.json`, `next.config.ts`, `app/api/token-image/route.ts`, `tmp/review-latest-audit.json`.

### 2. High — fee-on-transfer sends and burns can remain locked after mining

`prepareArcSend` accepts arbitrary token contracts and prepares a transfer when the call succeeds. It does not establish the amount the destination will actually receive. Settlement then requires the destination Transfer amount to equal the original requested amount exactly.

Reproduction: a transfer of 100 tokens succeeds and credits 99 after the token's transfer fee. Preparation accepts it, but `verifyTransferDelivery` rejects the successful receipt. The normal completion path never releases the wallet reservation. Burns use the same transfer path, so tokens taxing transfers to the dead address are also affected. This does not claim ordinary ARGUS transfers currently exhibit this particular deduction model; it is a reproducible gap in the advertised arbitrary-token support.

Action: establish and authorize token-specific delivery expectations before sending, or block unsupported transfer behavior before signing. If a transfer is already mined, reconcile actual delivery and record a definite outcome without blindly retrying the transfer or weakening OTC exact-USDC delivery checks.

Evidence: `lib/arc/wallet-actions.ts:34`, `lib/otc/runtime.ts:193`, `lib/otc/token-delivery.ts:52`. Mock reproduction passed: `tmp/review-current-edge.test.ts`. No live send was made.

### 3. High — the public application still uses the development Convex deployment

The public CSP identifies `aware-okapi-12.convex.cloud`, matching the local endpoint. Both the local deployment selector and deployment key classify as `dev`. Development changes and public financial state therefore share the configured backend.

Action: establish a deliberate production deployment and migration/rollback plan. Preserve CDP account mappings, owner identities, transaction signing fences, nonces, reservations, OTC inventory, gas-credit ownership, and pending social deliveries. Pointing the website at an empty production database would not be a safe migration. Verify deployment-key selection explicitly; a dev deployment key takes precedence over a `--prod` selector in the installed CLI.

The available Vercel account/team listing did not identify a matching project. Its private environment and deployed commit remain unverified.

### 4. High for X release — live X replies are disabled

Fresh environment comparison: local `X_REPLIES_ENABLED=true`, configured Convex `X_REPLIES_ENABLED=false`. The backend flag controls polling/replies, so local configuration does not enable the deployed bot. I left it unchanged.

The OAuth credentials correctly identify @TheArgosBot, ID 2097696306135220226. Telegram also identifies the correct bot. The earlier X publication rejection concerning crypto addresses after authentication remains relevant history, but this review did not make a new post to determine whether link-only replies are now accepted. Authentication success is not publication success.

Action: deliberately enable replies when intended and perform one authorized end-to-end mention/reply check. Verify intake, execution result, publication queue and actual X post, including the wallet-link response. Do not replay the deleted test post.

Evidence: `convex/xReplies.ts:112`, `tmp/review-latest-services.jsonl`; live X identity check. Current interaction snapshot: one completed, one failed. No inference that the completed interaction proves a newly published reply.

### 5. Medium — new Portal support still excludes actual non-USDC Argus pools

The four configured Portal versions include the newest eleven-word record. However, discovery still rejects any hook quote asset other than native or ERC-20 USDC. Discovery happens before general route selection, so rejection can also prevent considering another route for that token.

Fresh read-only reproduction at Arc block 20345382: Baby Argus, `0xe4894eC09505aB0FCF357005dF4866F1D90Ae489`, returns `Unsupported Argus pool configuration.` Its saved launch record uses ARGUS as quote asset. This is a real current token, not only a hypothetical future hook.

Action: support verified non-USDC quote assets from recorded launch data, and discover the connecting pools needed for them. Preserve per-token hook/pool identity validation. Mixed V3/V4 support alone does not resolve this discovery restriction.

Evidence: `lib/arc/argus-discovery.ts:40`, `lib/arc/trading.ts:51`, `docs/launch/onchain-review-2026-09-11.json`, read-only `tmp/review-argus-pool.ts`.

### 6. Medium — recovery remains incomplete for several definite stuck states

The expired unsigned swap cancellation and original-signature recovery fixes are present. Remaining cases include:

- Unsigned sends and approvals have no equivalent general safe cancellation/repreparation path. The cancellation helper explicitly requires an expired swap. A definite pre-signing failure such as a stale nonce can continue retrying unchanged.
- Signed transactions with inadequate fees or a consumed nonce lack a general replacement/reconciliation workflow. Replaying identical signed bytes does not solve every fee/nonce failure.
- OTC gas recovery is intentionally bounded and allows one top-up per order/chain. Exhausted recovery or a participant without spendable gas still requires intervention. The user retry path handles verified reverted steps rather than all unprepared underfunded steps.

Action: add explicit operator recovery states/procedures with immutable signing identity and receipt reconciliation. Only release an unsigned reservation when the durable signing fence establishes that signing never started. Never unlock an ambiguous signed transaction merely because time elapsed.

Evidence: `lib/otc/unsigned-recovery.ts:22`, `lib/otc/runtime.ts`, `lib/otc/escrow-runtime.ts`, `lib/otc/gas-recovery.ts`. No currently stuck financial record was found.

### 7. Medium — Arc provider redundancy is still fragile

From this machine, the configured primary failed every sampled request. Infura passed chain/head/checkpoint, balance, nonce, gas and estimate checks, but rejected the sampled contract call with JSON-RPC -32600. Argus passed those reads including the contract call. Both Base providers passed the sampled checks.

The transport appropriately prefers Argus for fallback contract calls, validates chain/checkpoint/head, and caches validation. It still tries the failing primary first on a cold instance. Contract-call availability currently depends heavily on Argus. Broadcasts intentionally stop after an attempted submission and are not routed through the read-only Argus endpoint; an endpoint passing reads is not proof of sendRawTransaction support.

Action: verify production-region behavior, make a reliably working endpoint the primary where appropriate, monitor method-level failures, and test broadcast/recovery with an authorized small transaction. No broadcast was attempted here.

Evidence: `lib/arc/transport.ts`, `tmp/review-latest-services.jsonl`. Public wallet balance request succeeded with `partial:false` in approximately 5.7 seconds in one sample; not a latency benchmark.

### 8. Medium — no clean automated release gate

The full run contains 361 failed assertions under `tests/`, across 42 failing files out of 227. Counts from individual assertion records are 2,428 passed and 20 skipped. The runner's overall aggregate additionally includes ignored-directory diagnostic tests and differs from these assertion counts. Two old `tmp` reproduction tests still expect bugs that have since been fixed and fail for that reason. `vitest.config.ts` does not exclude `tmp`.

Many failures expect intentionally removed launches, fees, claims, terminal workflows or old copy. Some active-looking expectations also need triage rather than blanket dismissal: wallet signer, amount parsing and native-send reconstruction. For example, a swap validation test still expects 50% swaps to be forbidden even though percentage swaps were added intentionally.

No `.github/workflows` directory exists. Action: remove/retire obsolete tests, update deliberate behavior changes, retain financial and security assertions, exclude diagnostic directories, and add a green CI build/type/test gate. Do not re-enable old features to satisfy old tests.

### 9. Medium — capacity protections and recovery observability need a release plan

Public wallet balances accept any valid address and can trigger explorer discovery plus up to 250 token candidates, with six concurrent readers and token pricing. The cache is short-lived, in-process and address-specific. I found no application-level request limiter on this endpoint or the public image proxy; any Vercel firewall/rate rules remain unverified. An authenticated user can also repeatedly request expensive trade estimates.

Worker failures now correctly return HTTP 503 and the scheduled caller checks failures. Processing remains sequential, selects up to twelve jobs per pass, and has a 240-second internal budget. Jobs rotate by update time, addressing the previous fixed-head backlog issue, but a large or slow queue still increases recovery latency. No load test or external alert delivery was verified.

Action: rate-limit costly public reads and authenticated estimates, bound/cache pricing work, monitor oldest pending age and worker failures, and test throughput under concurrent wallets/orders. This is a code/configuration concern; no abusive traffic was generated.

Evidence: `app/api/wallet/public/[address]/route.ts`, `lib/arc/wallet-tokens.ts`, `app/api/token-image/route.ts`, `app/api/wallet/trade/route.ts`, `lib/otc/runtime.ts:364`, `convex/otc.ts`.

### 10. Lower priority — deployed UI and guidance still differ from the intended release

- Telegram's live command menu lacks `/withdraw`, although the local configuration script includes it. This establishes menu drift, not that the deployed handler is necessarily absent.
- All inspected public pages still reference `argos-social-banner.jpg`. The new 1200×600 card is local and not yet reflected live.
- The newest wallet-reply copy is also an uncommitted local change; its live deployment was not established.
- The guide advertises `Buy 50 TOKEN`, but social buying uses a USDC/dollar spend amount. It also omits X's required explicit mention and copyable TG slash-command forms.
- Some website preparation failures become the generic “Request could not be confirmed” message. The newer explicit unsupported-pool handling is in the social endpoint; the website error mapping remains narrower.
- The build succeeds but logs local certificate-chain failures during static data fetches and existing unused-variable warnings. The certificate issue is specific to this build environment; this is not evidence of a Vercel TLS failure.

## Launch-specific readiness

The selected ARGOS parameters and read-only simulation are saved, but the dedicated durable operator launch-and-follow-up-buy runner is not implemented/verified. Normal transaction gas policy is below the simulated launch's approximately 3.22 million gas. Personal2 then Personal4 purchases, each spending 95% of current available USDC, require fresh balances, approvals, bounded quotes, nonce coordination and opening-tax timing. The second submission must not assume an unchanged price after the first. On-chain ordering across separate wallets is not guaranteed by submission order.

Launch planning files are tracked in Git, including random salts and a predicted token address. They are not private keys, but reveal prelaunch plans if pushed to a public repository. Review whether those operational details should be private. The private wallet manifests and deployment-state directories are ignored.

Execution remains unauthorized. No launch or follow-up buy was performed during this review.

## What passed / improved

| Area | Evidence and practical limit |
|---|---|
| Build/type checks | Next production build, root TypeScript and Convex TypeScript passed. Build caveats above. |
| Live financial backlog | All 107 OTC records fit within the 200-row read: 88 completed transactions, 11 wallet records, three completed orders, one expired quote, two filled listings, two cancelled listings. No pending financial state in that table. |
| Social state | 20 completed TG updates, nine delivered wallet results, one active TG link, two confirmed social wallet requests. |
| OTC concurrency | Atomic inventory/holds, per-listing settlement claim and cancellation guards remain present; current OTC tests pass. This is not a live two-buyer load test. |
| Refund handling | Bounded uneconomic gas remainders remain owner-attributed, and completion requires verified payment/payouts. Existing refund transactions cannot be discarded as dust. |
| Base verification | Successful canonical receipt and exact transaction fields are checked; no finalized/safe-block wait and no recipient whole-block net-balance requirement for native ETH. |
| Signing recovery | Original idempotent signing result is retrieved before expired-trade simulation; signed bytes and signing fence are durable. |
| Arc settlement | Native/USDC swap output uses transfer/balance/gas evidence, including native transfer logs; Arc finality checks remain. Token transfer-fee limitation above. |
| Authentication | Signed sessions, server-side session revocation, ownership checks, origin/CSRF validation and 30-minute recent-auth requirement inspected. Fresh mobile OAuth was not tested. |
| CSP/proxy | Public wallet and OTC pages now enforce strict-dynamic. Local proxy pins the validated IP, checks redirects, preserves TLS verification and bounds response size. No exploit test performed. |
| Credentials/wallet identity | Selected local/Convex secrets and chain settings match; X/TG identities correct. Existing CDP account-name lookups match both expected social wallet addresses. No signing-permission test. |
| Git secret scan | 743 tracked paths / 713 text files scanned: no exact currently loaded secret values or private-key headers found. Not a complete Git-history or arbitrary-secret audit. |
| Website | Home, guide, wallet, OTC, robots and sitemap return 200. Dog favicon and Argos branding present; no old brand detected in sampled HTML. ETH price, token catalog and public wallet reads succeed. |

## Scope limits and recommended order

This was source/test review plus read-only live checks. It did not perform new funded buys, sells, burns, withdrawals, OTC fills, mobile sign-ins, fresh browser layout screenshots, adversarial load, penetration testing or backup restoration. Responsive styles were inspected; actual mobile sign-in and funded interaction states still need device testing. Private Vercel settings and deployed commit were not accessible through the available project listing.

Recommended order: patch dependencies; resolve fee-on-transfer completion; establish production Convex separation; finish unsigned/signed recovery procedures; support current non-USDC Argus pools; establish a green release gate and monitoring; deploy the coordinated version and TG menu; deliberately enable and test X; perform small funded end-to-end transactions and a partial OTC fill/cancellation; separately finish the operator launch runner before authorizing the launch.

Diagnostic evidence is saved under ignored `tmp/review-latest-*` files and the specific reproduction files referenced above.
