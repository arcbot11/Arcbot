# Private-key export review — 2026-09-12, third pass

**Historical review: the three findings below are now fixed locally.** See [third-pass remediation](private-key-export-third-remediation-2026-09-12.md). The descriptions and characterization results below preserve the pre-fix evidence.

The preceding four fixes hold in the reviewed local paths. No new cross-owner export authorization bypass was reproduced. Two medium-priority recovery bugs and one lower-priority Telegram delivery gap remain. This was a source review with local regression/characterization tests; no production code was changed in this pass.

## Findings

### 1. Medium — Returning through browser history can revoke a valid pre-reveal export

Location: lib/key-export/browser.ts:89.

The pageshow handler calls close() whenever event.persisted is true. That revokes the server grant even if the page was restored from the back-forward cache before any key generation, approval or reveal. The separate pagehide/visibility handlers correctly distinguish pre-encryption navigation; pageshow does not. A user returning from X with Back, or restoring the export page through history, can lose the valid request and have to start over.

Reproduced in the browser harness: restore an authenticated but never-revealed page with persisted=true. It sends close with acknowledged=false, disables reveal and shows the close-page message. No RSA key was generated. Real-device frequency is unmeasured.

Fix direction: preserve strict destruction after encryption/reveal, but on pre-encryption restoration reconcile live status and expiry before enabling controls. Do not revive stale encryption material or relax owner/browser checks.

### 2. Medium — A non-retryable X exchange is presented as retryable

Locations: convex/walletExports.ts:214; app/api/key-export/callback/route.ts:16,44.

When the OAuth code may have been consumed but no sealed token was committed, the authority correctly returns OAUTH_RESTART after its lease expires. The callback discards that actionable distinction and renders a generic Retry verification link containing the same code/state. That callback cannot recover this state. Repeated clicks fail until the user independently returns to the export page and starts a fresh X authorization. The generic explanation only points to reauthorization if the request expired, although the grant can still be valid.

Reproduced in two tests: an exchange with no saved token returns OAUTH_RESTART after 30 seconds while its grant remains pending and unexpired; the callback presents the same retry link on repeated OAUTH_RESTART responses. Saved-token recovery remains safe and does work when a token checkpoint exists.

Fix direction: render distinct recovery actions for restart-required, busy, expired/revoked, and recoverable provider failures. Keep same-callback retry only where it can succeed. Preserve cookie/state/code binding and never blindly replay a consumed exchange.

### 3. Low — The initial Telegram confirmation warning has no delivery recovery

Location: convex/telegram.ts:530–544.

The post-confirmation verification link now has durable delivery. The earlier warning containing /export confirm CODE still uses a direct send. If that send fails, the handler sends a generic configuration message and marks intake completed; no retry is scheduled for the intended warning. The user must issue /export again. No verification grant or export quota is consumed at this stage, which limits impact.

Reproduced: reject the first Telegram send, allow fallback delivery, and observe completed intake without grant creation or intended-warning redelivery.

Fix direction: retry the same still-valid confirmation warning through a bounded delivery path, distinguish delivery failure from missing configuration, and continue requiring the separate typed confirmation before creating any grant.

## Protections rechecked

- The X callback uses its own HttpOnly ticket/verifier cookie; stored browser identity alone cannot authorize it. Wrong-cookie and missing-cookie requests cannot exchange or authenticate. Saved-token resume requires the original code digest and current attempt.
- Website retries retain the same owner/session/browser-bound attempt. Digest-only tombstones prevent old tickets being recreated after expired-grant cleanup.
- Telegram exact-update retries recover the same link; another update cannot reuse its consumed confirmation. Worker leases, scheduled rescue, maintenance recovery and immutable account/selection bindings remain in place.
- Canonical provider/user binding, account revision, protected/escrow exclusions, operator eligibility, active website session generation and TG-native selection are rechecked before export.
- RSA4096/OAEP-SHA256 and SPKI validation, immutable public-key/idempotency binding, CDP canonical-name/address checks and browser-derived address verification remain intact. No server-side plaintext key export helper is used.
- Arc/Base pending-work fences, permanent external-control risk marking, ciphertext revocation checks, pre-display/pre-copy checks and visible-key clearing remain enforced in the examined shared paths.
- The isolated origin serves only export routes. Its page has a nonce CSP, no normal wallet framework or storage, and no arbitrary third-party scripts. Telegram framing is limited to its web origins. Ordinary signing credentials are rejected on the broker.

## Validation and limits

431 tests passed across 14 export/wallet/settlement suites. Four new characterization tests deliberately reproduce the findings above; passing those tests does not mean the findings are fixed. Application TypeScript passed. No production source changed, so the preceding successful production build was not repeated.

The local environment has neither export enable flag set to true and none of the eight checked dedicated export configuration values. Remote Convex/Vercel configuration and deployment versions were not inspected. No real key was exported, no user was enrolled, no provider sign-in or Telegram message was sent, and no wallet transaction or deployment was performed.

Rollout still requires deploying the isolated broker and matching Convex schema/functions, completing registry/migration checks, verifying actual credential permissions with a designated disposable CDP account, and testing X app/browser handoff and Telegram native/Web clients on real devices. Under the requested social-only policy, control of the owner's social account can authorize export; no independent passkey was added.
