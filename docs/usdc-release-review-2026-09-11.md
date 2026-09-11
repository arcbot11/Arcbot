# Argos Bot — current-scope release review

Reviewed 11 September 2026 at commit `2bdc690`. This assessment supersedes the previous review's release priorities. Non-USDC quote pools are explicitly deferred by the owner and are not release blockers. No application changes, deployment, live signing, transactions, launch, or social posts were performed.

## Findings

### 1. High — vulnerable production dependencies

The refreshed audit still reports one critical and three high affected packages: Next.js, Sharp, Nanoid and PostCSS through Nanoid. Installed Next.js is 15.5.22 and Sharp is 0.35.3. The relevant Next AVIF image-optimization advisory lists 15.5.24 as patched. This is material for a wallet application with server-side signing credentials. No exploit was attempted and production exploit reachability has not been established. These are affected-package counts, not four independent exploits.

Update the dependencies and lockfile, then verify the installed versions, audit and production build. Sources: [Next advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and the audit saved at `tmp/review-next-audit.json`.

### 2. Medium — minimum swap output is checked against gross receipt, not net delivery

New confirmed verification bug in `lib/otc/runtime.ts:229–233`: the runtime computes incoming tokens minus outgoing tokens and saves that net value, but checks the promised minimum against incoming tokens alone.

A mocked receipt reproduction requested a minimum of 10 tokens, credited 10, and debited 1 from the recipient in the same transaction. The real settlement runtime accepted completion and saved an actual output of 9. Receipt and block balance evidence were consistent; the missing check is whether net delivery meets the minimum.

This is relevant to a token that makes an additional deduction from the recipient during the swap, independently of whether its pool uses USDC. It is not evidence that an existing live ARGUS trade underdelivered. It also does not establish that every supported router permits such a receipt; the independently enforced settlement invariant is nonetheless wrong.

Use net token delivery for ERC-20 minimum checks, while retaining the separate native-USDC gas treatment. An already mined underdelivery must be recorded accurately without retrying the spend. Evidence: isolated test `tmp/review-net-output.test.ts`, test result `tmp/review-net-output-result.log`; one reproduction passed using synthetic accounts and mocked chain/CDP services.

### 3. High — development and public Convex state remain coupled

The public CSP still names `aware-okapi-12.convex.cloud`, matching the configured local endpoint previously identified as the development deployment. The recent changes are now committed; a commit is not proof that the matching website and Convex functions are deployed.

Plan production separation deliberately. Preserve identity/CDP mappings, pending signing state, nonces, holds, listing inventory, credits and delivery records. Do not redirect the site to an empty database. Private Vercel environment settings and deployed revision remain unverified. Coordinate Convex mutations before the matching runtime callers.

### 4. High for the X release — replies are disabled

Fresh comparison still shows local `X_REPLIES_ENABLED=true` and configured Convex `false`. Authentication succeeds as @TheArgosBot, user ID 2097696306135220226; the developer is a different account. No actual publication test was made. Enable deliberately and test a new authorized explicit mention through the real posted reply, rather than relying on an interaction record's status.

### 5. Medium — Arc provider redundancy remains weak

The configured primary failed the sampled requests from this machine. The Arc backup passed chain/checkpoint/head, balance, nonce, gas and estimation checks but returned -32600 for the sampled contract call. Argus passed those reads including the contract call. Both Base providers passed the same applicable checks.

The application therefore remains heavily dependent on Argus for contract reads. Verify behavior in the deployment region and monitor failures by method. Passing reads or estimates does not verify transaction broadcast capability; no new broadcast was performed. The sampled public balance response took approximately 4.35 seconds and returned `partial:false`, not a performance benchmark.

### 6. Medium — automated checks still cannot serve as a green release gate

Fresh full-suite result: 2,518 passed, 361 failed, 20 skipped, with no new failing assertion names versus the preceding review. Many failures require retired workflows, obsolete branding/copy or the old chain ID. They must be triaged without restoring removed functionality. The wallet access test's old “positions” label is not evidence of an ownership bypass.

There is no `.github/workflows` CI configuration. The default Vitest configuration also includes ignored diagnostics under `tmp`, while root TypeScript includes them through its broad glob. Exclude diagnostics from release checks, update legitimate changed expectations, retain financial/security coverage, and establish a clean CI gate.

Root and Convex TypeScript invocations emitted no type errors. The separate version-reporting command failed because Sharp does not export its package.json; reading the installed file directly confirmed 0.35.3. The prior production build remains the most recent build evidence; it was not rerun. No application code changed during this review.

### 7. Medium — operational recovery and capacity still need production validation

Current code contains atomic OTC inventory reservations, pending-fill cancellation guards, durable signing fences, never-signed expiry/cancellation, receipt-based Base completion, dust handling and bounded recovery. The inspected state has no stuck financial jobs. That does not prove all failure paths under live provider outages or concurrent load.

Public balance discovery, image fetching and authenticated estimates can consume substantial RPC/server work. Application-level rate limiting is absent in the reviewed expensive endpoints; Vercel firewall rules remain unverified. Worker failures return 503 and are checked by the scheduler, but processing is bounded to twelve selected jobs and a 240-second budget. External alert delivery and sustained throughput have not been tested.

A payer with no gas still needs funding. Ambiguous signing or missing delivery evidence must not be unlocked merely because time passed. New operator recovery operations require controlled live verification after deployment.

### 8. Lower priority — deployment and guidance discrepancies

- The live TG menu still omits `/withdraw`, although local configuration includes it. The menu alone does not establish whether the deployed handler is missing.
- Public pages still reference `argos-social-banner.jpg`, rather than the newly committed social card.
- The guide's `Buy 50 TOKEN` example conflicts with social buying by USDC spend; it also omits X's explicit mention and copyable Telegram slash-command syntax.
- Some definite website preparation errors become “Request could not be confirmed,” which gives insufficient guidance about whether waiting helps.
- Obsolete automated-fee/launch scripts remain in package.json. Their presence creates maintenance ambiguity; it does not mean those features are enabled for users.

## Healthy checks and boundaries

| Area | Result |
| --- | --- |
| Website | Home, wallet, OTC, guide, robots and sitemap returned 200. Current Argos title, dog favicon, and no old brand string in sampled HTML. |
| Balances/catalog | Public wallet returned complete balances; token search and ETH price endpoints returned 200. Retired market snapshot endpoint returned its expected 410. |
| Security controls | Wallet and OTC responses enforce strict script policy. Reviewed write authorization checks active session, ownership, origin, CSRF and recent authentication. Image-proxy source pins the checked DNS address to the actual connection. |
| X/TG credentials | Fresh authenticated reads identify @TheArgosBot and @The_ArgosBot correctly. Selected local/Convex secrets and RPC settings match without exposing values. |
| Financial queue | All 110 OTC records fit the read limit: 89 completed transactions, three completed orders, one expired order, one active listing, two filled and two cancelled listings, twelve wallets. Two wallet requests confirmed. No pending financial records. This is a database status inspection, not a recheck of every historical receipt. |
| Telegram queue | 23 completed updates and 11 delivered wallet notifications, no pending records in those snapshots. Recording and scheduling update processing occur in the same mutation. |
| Base verification | Runtime checks canonical receipt and matching transaction, without waiting for Base finality or requiring an unrelated whole-block net balance increase. Both provider checks passed. No live withdrawal was sent. |
| Repository | Clean working tree at review start; 757 tracked paths, 726 text files scanned for loaded secret values/private-key headers, no matches. Not a complete Git-history secret audit. |

No signed-in mobile OAuth journey, mobile visual inspection, load test, funded trade, OTC purchase/cancellation or actual X reply was performed during this review. Those remain separate end-to-end validation steps. Non-USDC pools and their routing limitations are outside the current release scope.

## Recommended next steps

Patch dependencies; correct the net-output verification invariant; establish a deliberate coordinated deployment and clean test gate; validate RPC/recovery operation; refresh Telegram menu and public guidance; then enable and verify X and perform small authorized end-to-end transactions. The planned token launch remains separately unapproved and requires its own execution tooling and checks.

Fresh evidence is saved in ignored `tmp/review-next-*`, `tmp/review-net-output*`, and the deployment/identity checks.
