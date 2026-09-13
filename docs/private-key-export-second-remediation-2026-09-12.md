# Private-key export: second-review remediation

All four reported findings are addressed locally. Customer export remains disabled by default. No production key export, real provider sign-in, Telegram message, wallet transaction, enrollment, credential change or deployment was performed.

## Changes

1. **X browser authorization:** the callback hashes its own HttpOnly ticket/verifier cookie; Convex checks that pair against the grant and OAuth state before exchanging a code or returning saved authorization. It no longer trusts a browser hash merely read from the grant. Missing/wrong browser cookies lead to a handoff that carries the PKCE-bound callback to the initiating browser. The original cookie remains mandatory. Code digests prevent substituting an arbitrary code when resuming a saved token. Callback failures offer retry with the same authorization rather than silently discarding the checkpoint.
2. **Telegram link delivery:** confirmation consumption, grant creation and scheduled delivery commit atomically. Same-update retry recovers the same ticket without another initiation charge. Delivery uses immutable owner/account/revision/selection identity, a worker lease, crash rescue, bounded expiry and a maintenance sweep. A stale worker cannot acknowledge a newer attempt. An uncertain send may duplicate the same verification link; it cannot issue another grant or expose a private key.
3. **Browser startup:** lost claim/status responses now leave an opening retry control. The retry preserves the original in-memory proof. A matching HttpOnly cookie can recover the same ticket on reopen; a new browser or different ticket cannot rebind it. Encryption-retry and startup-retry controls remain separate internally.
4. **Website initiation:** client attempt IDs and session-bound ticket derivation make retries idempotent. Convex verifies the owner/session/browser and reuses a live grant before charging quota. Expired/revoked grants remain unusable; digest-only tombstones prevent an old ticket being reissued after cleanup while its original website session is still active.

The original provider/owner checks, permanent TG-wallet selection rule, protected-account exclusions, RSA encryption, explicit reveal consent, revocation checks and Arc/Base signing fences remain enforced. No passkey requirement or normal TG-menu export button was introduced. X export remains at the wallet-page bottom; Telegram still requires typed /export and a separate confirmation command.

## Validation

The 14-suite export/wallet/settlement regression set passed 426 tests. After the final callback/tombstone changes, the affected authority and callback suites passed all 71 tests, including the added expired-ticket regression (427 distinct tests in the checked set). The isolated browser bundle build and Next.js production build passed. Application and Convex TypeScript passed; targeted ESLint passed with only two existing unused-argument warnings in the Telegram test fixture. The production build reports existing unused-variable warnings in unrelated routing/OTC/X files. Tests use disposable local cryptographic material and mocked database/provider responses, never production private keys.

Regression coverage includes wrong-browser callback denial, original-code recovery, callback retry UI, same-session initiation replay, owner/session substitution denial, same-update TG replay, lost delivery, worker interruption, stale-worker fencing, expiry/selection/revocation, opening retry and cookie reuse, and expired-ticket cleanup.

## Rollout limits

The isolated broker, new Convex schema/delivery functions, migration readiness, dedicated credentials and explicit customer eligibility still need deployment/validation before enabling export. Actual X app/browser handoff, Telegram mobile/Web framing, and CDP encrypted export with a designated disposable account have not been live-tested. Social-account compromise remains sufficient under the explicitly chosen social-only policy. These fixes do not change that policy or enable exports.
