# Private-key export implementation review — 2026-09-12

**Assessment: not ready to enable for customers.** The owner-resolution and encryption design has useful protections, but the CDP adapter has a confirmed interoperability blocker and the authentication recovery paths need work. This review does not recommend or add passkeys; the user's social-only authentication decision remains in place.

Scope: source inspection of the new website/TG export flow, Convex authorization and signing integration, installed CDP SDK/schema comparison, official Telegram/CDP documentation, local adversarial tests, application/Convex TypeScript checks, and a live **read-only** CDP address-format comparison. No private key was exported, no customer enrollment or credential permission was changed, no transaction/message was sent, and nothing was deployed. Only review tests and this report were added during the review.

## Remediation update

The six implementation findings below have now been addressed locally. See [remediation and verification](private-key-export-remediation-2026-09-12.md). The original findings remain below as the review record. Live isolated deployment, credential-scope validation, disposable-account export and mobile-device checks are still rollout requirements.

## Original findings

### 1. High — CDP account addresses are lowercased before API requests

`lib/key-export/broker.ts:29` calls `exportAddress`, which lowercases the address. That spelling is used for both the account GET and export POST URL. The live account API returned **200 and the matching account for the CDP-returned canonical address**, but **404 for the lowercase form of that same account**. This used Personal1 account metadata only; it did not call export or fetch a key.

For an affected mixed-case account, the customer completes fresh authentication and consent, then the adapter fails before the export POST. Because `begin` has already executed, it also creates the temporary coordination fence and conservative external-control marker despite the account lookup failing. The generic error obscures the actual problem.

The original tests used an all-numeric address, hiding this bug. Added a mixed-case characterization test reproducing the current failure. Fix by normalizing only for comparisons and retaining a verified provider-canonical address for CDP URLs (or resolving the audited name and verifying its returned address before export). Verify the export endpoint with a designated disposable account after fixing the read lookup; this review deliberately did not test a real export POST.

### 2. Medium — A transient X callback failure permanently consumes the attempt

`convex/walletExports.ts:122` / `app/api/key-export/callback/route.ts:12` mark the OAuth state used **before** contacting X for token exchange and identity. An interruption or provider failure afterward leaves the grant pending with an already-used state. The callback cannot retry it, and `oauthStart` rejects replacing it within the same grant. The user must restart; repeated failures consume the three-per-hour initiation allowance.

Reproduced by taking a valid OAuth state and interrupting before authentication: both callback reuse and new OAuth authorization on that grant fail. Use a durable, purpose-bound callback lifecycle. Distinguish a safely retriable stage from an ambiguous/consumed token exchange, and make completed stages idempotently recoverable without accepting another identity or replaying proof into a new grant. Do not simply remove single-use validation.

### 3. Medium — Telegram authentication does not recover a lost success response

`convex/walletExports.ts:131` accepts authentication only when the grant is pending. Repeating the identical verified proof against the same already-authenticated grant fails. `lib/key-export/browser.ts:51` does not reconcile status after a failed authentication response. It also erases its in-memory proof before the subsequent status call; if that status call fails, the UI can still offer verification while no longer having the proof needed to perform it.

Reproduced a committed TG authentication followed by replay of the same grant/proof: retry fails although the authoritative status is authenticated. Recover by reading the existing grant state after an uncertain response and accepting an exact same-grant/proof/browser retry where appropriate. Continue rejecting proof reuse across grants or owners.

### 4. Medium — Global history size can disable every customer's export

`convex/walletExports.ts:17` scans both customer-wallet tables and `:33` scans all historical listing records during ownership resolution. Every status/authorization transition repeats these scans. If either wallet table or the listing history exceeds 2,000 rows, even an unrelated eligible customer is denied. The pending-transaction audit has a similar per-state limit at `:153`.

Reproduced by adding 2,001 unrelated closed listing records: a previously valid export status request fails. This does protect against incomplete scans, but it creates a global availability cliff. Full-range reads also create unnecessary work and possible Convex conflicts with unrelated wallet/listing changes. Use indexed canonical ownership/address classifications and per-wallet pending-work lookup, with an audited paginated backfill. Do not fix this by silently truncating the scan.

### 5. Medium — Logout does not actively hide the isolated reveal page

The server rechecks session revocation before authorizing a ciphertext response. However, `lib/key-export/browser.ts:34` / `:40` reveals an already-authorized response without checking session state again, and `:72` only reacts to browser visibility/navigation. There is no ongoing revocation check while the key is displayed.

A logout or account switch in another visible window does not fire visibility events in the export page. An already-displayed key therefore remains until its 30-second timer, and an in-flight response authorized just before logout can still be revealed after logout. Reproduced the latter browser behavior with a delayed mocked response. This is a lifecycle gap, **not a demonstrated cross-user ownership bypass**. Add a final status check before disclosure and bounded revocation checking while visible; acknowledge that already delivered/copied key material cannot be revoked and network races cannot be made retroactively atomic.

### 6. Medium — Export errors hide actionable causes

`app/api/key-export/route.ts:53` maps pending transactions, incorrect configuration, rate limits, CDP failures, expired grants and invalid identity to the same HTTP 403 and generic message. Redaction is appropriate, but treating all failures as authorization problems directs users toward re-verification even when it cannot help. The confirmed CDP casing failure is one example. There is also no sanitized audit event that identifies the failed provider/stage.

Return a small allowlist of fixed error codes and messages such as pending wallet work, verification expired, temporarily unavailable, and configuration unavailable. Log only safe outcome/stage metadata, never private keys, provider tokens, raw proof, full requests or provider error bodies. Clearly identify whether retrying the same request is supported.

## Additional usability and operational gaps

- The main starter uses `websiteSession(request,true)` (`app/api/wallet/key-export/route.ts:12`), which inherits the ordinary recent-auth requirement. A valid website session older than that window must reconnect before it can start the dedicated fresh X verification. Retain session/CSRF/ownership checks but avoid requiring two consecutive sign-ins when the export flow performs its own fresh authorization.
- The “Finish in browser” control is a normal same-origin link (`app/api/key-export/view/route.ts:8`). It does not itself hand off from X's embedded browser to the original Firefox/Safari browser. Returning manually to the original browser can resume its cookie-bound authorization, but the automated mobile handoff has not been implemented or device-tested.
- Every customer currently needs explicit operator enrollment. This is a deliberate initial restriction, not an automatic public rollout. Enabling the UI flags alone will not make export available to all existing customers.
- Grant/proof/audit metadata has no cleanup job. Expiration checks prevent using expired grants, but do not remove abandoned sealed PKCE verifiers or bound public keys. Define retention and bounded cleanup while preserving necessary audit evidence.
- A single 100-requests-per-hour global initiation allowance can be exhausted by multiple legitimate owners. It is an availability tradeoff; monitor and size it for rollout rather than assuming the per-owner limit is enough.

## Protections that passed the review checks

- Canonical ownership is resolved on the server. Address/name/owner substitution is rejected at the public API boundary. Export never creates a customer account.
- X/TG numeric ID namespaces remain separate, including identical numeric IDs. TG linkage alone cannot export an X wallet.
- Unapproved, duplicate, protected, frozen or changed bindings are denied. Escrow and the configured fee wallet are denied by explicit checks; Personal CDP names cannot enroll as customer accounts.
- Telegram validation matches the production Ed25519 protocol and exact bot ID, with freshness, duplicate-field and replay checks. Forged bot-token-only proof is not accepted. This matches [Telegram's third-party verification specification](https://core.telegram.org/bots/webapps#validating-data-for-third-party-use).
- RSA-4096 SPKI/OAEP-SHA256 matches the installed CDP encrypted-export format. Browser decryption/address matching is tested with generated disposable cryptographic material. The [CDP export API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/evm-accounts/export-an-evm-account) supports encrypted delivery, but actual export permission and live response interoperability remain untested.
- The approval retry retains the same browser public key and CDP idempotency intent. Changed-key retries, cross-browser requests and revoked-session responses are denied by server checks.
- Shared Convex signing/reservation and operator-lease mutations respect the export fence. Pending records on both chains, including orphaned prepared/signed/submitted transactions, prevent export. Expired fences do not leave a permanent transaction lock, and the external-control marker remains after an ambiguous attempt.
- Dedicated escrow ownership and payout destinations are unchanged. The regular key export does not expose the escrow key or redirect payouts. Outside-spending recovery remains necessary because the exported wallet can transact independently.
- The reveal page has its own restrictive nonce CSP, no ordinary wallet framework, no external scripts, no analytics/storage API use, no cache, and explicit copy. Backgrounding during RSA generation or after reveal clears/cancels access. Unsupported Telegram data fails closed.
- The broker blocks unrelated routes, including prefetch, and rejects ordinary trading/authentication secrets in its runtime configuration. Main-site secret alone cannot act as the export service.

## Important assurance limits

No wrong-owner disclosure was found in the tested scenarios. This is not a claim of universal safety. The broker and dedicated export credential remain trusted: compromise of a project-wide CDP export credential can bypass application-level protected-account checks. The same-project configuration must be reviewed against actual CDP permission scope. The configured project ID is not a cryptographic attestation of credential restrictions.

Shared transaction paths are fenced; arbitrary manual/direct CDP scripts cannot be controlled by that fence. The legacy public signer allowlist currently permits only provisioning, balances and metadata, so old signing helpers are not publicly reachable through those routes. Continue excluding operator/Personal/platform accounts and audit any future caller that bypasses the shared transaction store.

Without passkeys, control of the owner's social account remains sufficient to authorize an export through that provider. This is the selected product policy. Export also cannot revoke an already copied key, undo old allowances or make cross-chain settlement atomic.

Live X/TG verification, actual CDP encrypted export, Vercel host isolation, mobile browser handoff and external-spend races with an exported disposable wallet still require end-to-end testing before customer enablement. No production-readiness conclusion should be inferred from mocked provider tests.

## Validation record

- Main review run: 263 tests passed across 10 export, authentication, financial recovery and Telegram-native-wallet suites. Five added characterization cases deliberately reproduce current defects; their passing result is evidence of those defects, not acceptance of them.
- Application and Convex TypeScript checks pass. Targeted ESLint checks pass.
- The previous implementation turn's production build passed. This review changes only tests and this report, so it does not repeat a production build or claim a new deployment.
- Read-only CDP GET comparison: canonical address HTTP 200/matching account; lowercase HTTP 404. An initial connectivity failure cleared on subsequent read attempts. No export POST was made.

Recommended repair order: canonical CDP addressing; X/TG response-loss recovery; indexed ownership/pending-work resolution; reveal revocation handling; actionable sanitized errors; then isolated-host/disposable-wallet/device validation.
