# Private-key export second review — 2026-09-12

**Historical review; its four findings are fixed locally.** See [remediation and validation](private-key-export-second-remediation-2026-09-12.md). The original findings and reproductions below describe the pre-fix code. Customer enablement still requires isolated-service rollout and disposable/mobile verification.

**Original assessment: keep customer export disabled.** The preceding fixes address the specific CDP, indexing and response-recovery defects they targeted, but this review identifies an X browser-binding security gap and additional initiation/delivery recovery gaps.

Scope: local website initiation, isolated broker routes and browser bundle source, X callback/recovery, Telegram confirmation and delivery, cryptography, Convex ownership/eligibility and migration, signing fences, shared financial recovery, configuration presence and regression tests. Only review tests and this report were added. No production code was changed, no real authentication or Telegram message was sent, no private key was exported, no customer was enrolled, and nothing was deployed.

## Findings

### 1. High — X authentication can authorize an export claimed by another browser

Locations: `app/api/key-export/callback/route.ts:14–20`, `convex/walletExports.ts:126–132`, `convex/walletExports.ts:175–198`.

The callback looks up the grant using OAuth state, obtains the grant's stored browser hash, and calls `authenticated` using that hash. It never checks that the browser receiving the X callback holds the matching export cookie. A missing or unrelated export cookie does not prevent authentication. PKCE is verified by the backend, but its result is not bound to the browser that actually completes verification.

Concrete preconditions and consequence:

1. Someone obtains an **unused** export ticket before the owner's export page claims it, for example through compromised main-site code reading the initiation response. This is not a random-address or unauthenticated stranger bypass.
2. That person claims the ticket with their browser verifier and obtains its X authorization URL.
3. The real owner is induced to follow that URL and complete X authorization. The original website session must still be active and the grant must still be eligible and unexpired.
4. The callback authenticates the grant for the captured-ticket browser. That browser can submit its own final approval and encryption key and reach the export operation. The real owner's final broker confirmation is not required.

Evidence: a route test completes authentication with an unrelated export cookie; a separate test exercises the actual Convex handlers from ticket claim through export preparation using the other browser's verifier/key after mocked owner verification. No real X account, CDP export or live exploitation was used.

Fix: distinguish completed provider verification from permission to export. Require matching proof from the original export browser before authentication becomes usable for final approval. A mobile handoff must carry a short-lived callback completion proof to that browser and require both the proof and its original cookie; polling with the captured grant alone must not obtain the proof. The regular website flow in `lib/x-oauth-completion.ts:47–74` already contains a callback-proof/browser-check pattern worth adapting. This does not require adding a passkey.

OAuth security guidance requires the PKCE challenge or nonce to be tied to the initiating transaction and user agent; backend PKCE alone does not replace this application's missing browser check. [RFC 9700, section 2.1.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1).

### 2. Medium — Telegram can consume confirmation without delivering the export link

Locations: `convex/walletExports.ts:109–118`, `convex/telegram.ts:539–544`.

`startTelegram` consumes the confirmation and creates a grant, returning the only copy of its raw ticket. Sending the Mini App link happens afterward in a separate action. If the mutation response or Telegram send fails, the pending grant exists but the link is unavailable to the user. Repeating the same update/confirmation fails as consumed. The command handler can send a generic error and mark the update completed, leaving no delivery recovery job for the intended link.

Reproduced: repeat the exact same confirmation update after a committed initiation; it is rejected while its pending grant remains. Three abandoned initiations can exhaust the owner's hourly allowance.

Fix: durable, idempotent initiation plus delivery. Persist a recoverable sealed ticket/delivery intent bound to the same confirmation update, account revision and wallet selection. Retries must deliver the same still-valid link rather than issue a new grant or accept a different update as confirmation. Preserve the explicit confirmation-before-verification requirement.

### 3. Medium — A failed initial page claim leaves no usable recovery control

Location: `lib/key-export/browser.ts:90–100`.

The export page erases its fragment, creates a random browser verifier and calls `claim`. If that first response is lost, `status` is never populated. Verify, Reveal and Retry remain hidden; only Close is usable. If the server committed the claim but its cookie/response did not arrive, reloading loses the in-memory verifier. Reopening the original Telegram link generates a different verifier and is rejected against the already-claimed grant.

Reproduced: a lost initial claim leaves every verification/retry control hidden after fragment removal; a second claim using the newly generated reload verifier is rejected. The mismatch rejection itself is correct security behavior—the missing safe retry is the defect.

Fix: offer initialization retry using the exact in-memory ticket/verifier, reconcile the authoritative claim result, and reuse a valid matching HttpOnly claim cookie on reopen where available. Never weaken the existing prohibition on rebinding a claimed grant to a different browser.

### 4. Medium — Website initiation has no idempotent recovery after response loss

Locations: `app/api/wallet/key-export/route.ts:15–17`, `components/WalletKeyExport.tsx:9–14`.

Every POST generates a different raw ticket and consumes an initiation after the server commits it. The client times out after 15 seconds. If the response arrives too late or is lost, clicking again creates another grant rather than returning the previous one. Repeated transient failures can exhaust the three-per-hour limit without ever opening the export page. This occurs before the improved OAuth recovery code runs.

Reproduced: two equivalent initiation POSTs produce different ticket hashes. The original raw ticket is not recoverable from the stored digest.

Fix: generate an attempt identifier on the initiating client, bind it server-side to the exact session/browser/owner, and recover the same short-lived delivery ticket for retries. Do not make it a lookup that reveals another browser's ticket, and do not simply remove per-owner rate limits.

## Additional operational observations

- **Saved X-token recovery is not exposed clearly in the UI.** A failed callback redirects to the plain view page. Its visible pending action starts a new OAuth request and clears the saved token. Direct callback retry can use the sealed checkpoint, but the normal screen does not offer that recovery path. Address this while fixing finding 1.
- **The three-second status deadline is deliberately strict.** A slow or unavailable status check clears the private key and browser encryption session. This is safe against continued display under unknown authorization, but latency can force a complete restart. Measure isolated-broker/Convex latency before rollout; keep the key hidden during uncertain authority rather than weakening authorization checks.
- **Mobile behavior still requires real-device validation.** The code provides Firefox/Chrome handoff links, but a link alone is not proof of browser binding. Telegram Web framing, copy behavior, app/browser switching and reload recovery were not device-tested here.
- **Audit/cleanup and indexing are implemented, not proven deployed.** The migration must finish before exports are allowed. The current local `.env.local` does not enable export and lacks the dedicated export origin/service/CDP/X configuration. This review did not inspect remote Vercel or Convex environment values and does not infer their state from the local file.
- **Enrollment and credential isolation remain rollout work.** Customer approval is explicit; operator, Personal, fee and escrow wallets must stay excluded. Actual CDP encrypted-export permission and account/project scope still need a designated disposable-account test. A broad stolen provider credential is outside what application allowlists alone can contain.

## Protections checked

- Exact provider/user namespaces, canonical X/TG wallet ownership, frozen/duplicate/changed binding rejection and eligibility revision checks remain enforced.
- Audited CDP-name resolution validates the returned address/name and retains canonical address casing for export.
- RSA-4096/OAEP-SHA256, SPKI validation and client-side address derivation match the installed SDK format. No server-side plaintext export helper is used.
- Telegram production Ed25519 verification, freshness, duplicate-field rejection and cross-grant proof replay denial remain in place. Same-grant authenticated-proof retry works.
- Export approval binds the encryption key and export idempotency intent. Shared Arc/Base reservations, pending records, operator acquisition and begin-signing respect the export fence. The conservative external-control marker persists after ambiguous delivery.
- Indexed address/escrow/pending-work lookups, paginated migration readiness and bounded continuing cleanup avoid the former global history-size ceiling. New wallet/financial writes maintain the indexes.
- Session revocation is checked before ciphertext release and before display/copy; visible keys are periodically checked and cleared on unavailable authority, backgrounding, offline events and timeout. Already delivered/copied keys cannot be revoked.
- The export page has an isolated nonce CSP, no general website framework or third-party scripts, and no local/session-storage persistence. The broker denies unrelated routes and ordinary signer/auth credentials. Error responses and failure audit fields are allowlisted.
- The X button remains at the wallet-page bottom. Telegram exposes typed `/export` with a distinct confirmation before verification, not a normal-menu export button. No passkey was added.

## Validation

**412 tests passed across 14 suites**, including six new review-characterization tests. Those six tests demonstrate the current flaws; their passing result does not mean the flaws are fixed. Application and Convex TypeScript checks passed. The earlier production build was not repeated because this turn changes only tests/documentation.

The new tests are in `tests/keyExportAuthority.test.ts:220`, `tests/keyExportBrowser.test.ts:72`, and `tests/keyExportRecovery.test.ts:50`. Database/provider tests use mocked storage and identities; they do not replace deployment, genuine provider-sign-in, live CDP export or concurrency testing on a disposable account.

Priority: fix finding 1 before any customer enablement, then the three initiation/delivery recovery defects, then perform isolated-service and disposable/mobile validation.
