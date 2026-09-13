# Private-key export implementation

The initial two-user pilot is being expanded to all eligible customer wallets. Fresh social verification remains required **without a passkey**, as requested. An empty disposable CDP wallet passed encrypted export and address verification before this rollout.

## Implemented flow

- X: the export button at the bottom of the signed-in wallet page starts a five-minute request for that session's canonical X customer wallet. A separate export service requires a new X OAuth flow, checks the numeric user ID against the original session and customer binding, and returns to the initiating export browser. X may reuse an existing provider login; this does not force an X password/MFA prompt. The callback must present the original export cookie before any OAuth exchange or authentication. If X opens another browser, a handoff carries the still-PKCE-bound callback back to the initiating browser; it never transfers the export ticket or verifier. Failed callbacks offer a retry of the same authorization, including a saved encrypted token checkpoint.
- Telegram: `/export` is a typed command, with no export button in the regular menu. It first shows a warning and asks for `/export confirm CODE` in a separate message. Only a matching, unused confirmation for the same owner, wallet revision and selection within five minutes creates the verification grant and atomically schedules delivery of its Mini App link. Repeating the exact confirmation update recovers the same grant; another update cannot reuse the consumed confirmation. No verification grant is created by the first command. Its Telegram-signed launch data is read from the fragment into memory before clearing the URL. The broker validates Telegram's production Ed25519 signature, exact configured bot ID, numeric owner ID, freshness and replay. No bot-token-only HMAC fallback. The page does not need Telegram's third-party JavaScript bridge or storage. A linked X wallet cannot be exported using a TG proof.
- With `WALLET_EXPORT_ALL_CUSTOMERS=true` in Convex, the authenticated website eligibility check or a validated private Telegram `/export` update can automatically enroll a customer. The server resolves the canonical binding, derives the original CDP customer account name using the signer naming secret, and reads that account from CDP to verify the exact name and address. A mutation rechecks ownership and project after the network call before inserting the registry entry. Existing revocations, registry collisions, and changed bindings fail closed; an existing entry's revision and export fence are never reset. This supports existing and future customers without a manual allowlist. No wallet or export grant is created by enrollment. Export itself still resolves only the stored registry target and checks CDP name/address again before requesting encrypted key material.
- The isolated browser generates a temporary RSA-4096 OAEP/SHA-256 key, binds its public-key digest to explicit consent, and retains the private decryption key in memory. CDP receives the approved public key and returns ciphertext directly; the application does not call the SDK convenience method that decrypts on the server. The browser checks the decrypted key's EVM address before revealing it.
- Reveal lasts 30 seconds. Backgrounding, navigation or closing cancels disclosure, including during RSA generation. Copy requires a user action. There is no key download, chat delivery, browser persistence, telemetry or server-side plaintext-key handling in this flow. Clearing the UI is not guaranteed memory erasure or clipboard clearing.
- Grants bind provider, ID, audited account revision, initiating browser and original website session generation or TG wallet selection. Each protected transition rechecks them. Same-key retries retain the same CDP UUID and encryption key; changing the key requires starting again. A revoked session cannot receive a subsequently returned ciphertext response.
- A cross-chain fence checks both wallet active slots/reservations and unresolved prepared/signed/submitted records before calling CDP. The shared Convex transaction store prevents new signing/reservations during the fence, including operator leases through that store. The fence expires after 60 seconds; an ambiguous response does not lock the wallet forever. `externalControlPossibleAt` is recorded before CDP submission and never removed on timeout or close.
- Dedicated OTC escrow is excluded. Export does not change any fixed buyer/seller destinations or give access to a listing's escrow key. After export, database reservations cannot prevent outside spending. Existing external-spend/nonce reconciliation remains necessary for every transaction, whether or not a user has exported.

## Deployment in the existing Vercel project

The selected mode is **shared**: one existing Vercel project and its existing CDP and X OAuth credentials. A separate Vercel project or new CDP key is not required. Add an isolated hostname, such as https://keys.argosbot.io, to the existing project. Middleware permits only the export API, reveal document, script and callback on that hostname. Those routes are denied on the main website and Vercel preview domains. Ordinary website/authentication/signing endpoints and static assets are denied on the export hostname.

The reveal document retains its standalone CSP, host-only export cookie, encrypted-only response and Telegram-only frame policy. A shared backend has the authority of the ordinary signing credentials: hostname isolation does not provide a separate server or credential compromise boundary. This is the requested deployment tradeoff.

Use npm run build, which generates the browser bundle before Next builds. lib/key-export/browser-bundle.ts is generated and ignored by Git.

### Existing website project environment

| Variable | Value |
| --- | --- |
| WALLET_EXPORT_RUNTIME | shared |
| WALLET_EXPORT_ENABLED | false during configuration, then true for rollout |
| WALLET_EXPORT_ORIGIN | Exact separate HTTPS origin, e.g. https://keys.argosbot.io |
| NEXT_PUBLIC_WALLET_EXPORT_ENABLED | false during configuration, then true; rebuild required |
| NEXT_PUBLIC_WALLET_EXPORT_ORIGIN | Same origin, without a trailing slash; rebuild required |
| WALLET_EXPORT_SERVICE_SECRET | New random secret, at least 32 characters, shared only with Convex |
| WALLET_EXPORT_CDP_PROJECT_ID | The existing customer-wallet CDP project ID |

Retain the existing CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET, X_OAUTH_CLIENT_ID and X_OAUTH_CLIENT_SECRET. Shared mode uses these when there is no dedicated export credential set. A partial dedicated credential set fails closed; credentials from different sets are never mixed. Do not reuse the WEB_AUTH_SECRET, OTC_SERVICE_SECRET or signer secret as the export service secret.

### Convex environment

| Variable | Value |
| --- | --- |
| WALLET_EXPORT_ENABLED | false until backend, website and provider configuration are ready |
| WALLET_EXPORT_ORIGIN | Same isolated origin |
| WALLET_EXPORT_SERVICE_SECRET | Same new export secret as the website |
| WALLET_EXPORT_CDP_PROJECT_ID | Same existing customer-wallet project ID |
| WALLET_EXPORT_PROTECTED_ADDRESSES | Audited operator, Personal and platform addresses |

OTC escrow and the configured fee recipient are independently denied. No account is automatically approved. The website checks eligibility before showing export controls; Telegram still requires the approved permanent TG wallet and fresh owner verification.

### Provider configuration

Add https://keys.argosbot.io/api/key-export/callback to the **existing** X OAuth app's callback list, preserving the normal website callback. Configure Telegram's Mini App domain for the same HTTPS hostname. Actual provider permissions and browser/app behavior still require live validation; local tests do not prove them.

### Setup commands

Run npm run keys:setup -- --prepare --project-id EXISTING_PROJECT_ID to create an ignored .deployment-private/key-export/shared.env file with disabled flags and a new service secret. It refuses to overwrite an existing file. This file supplements .env.local for operator checks; it is not automatically loaded by Next or uploaded to Vercel/Convex.

Run npm run keys:setup -- --check for local configuration, and add --remote to read deployed migration/configuration status. After deploying Convex, --migrate schedules the resumable ownership index migration. Check that migrationReady is true; never force the database readiness flag.

Use --enroll --manifest PRIVATE_JSON_FILE to verify exact numeric identities, canonical bindings and CDP account names/addresses. Add --execute to enroll only those accounts. The whole batch is checked before mutations. Repeating the command skips already eligible entries. No setup command creates a grant, retrieves a key, signs a transaction, or turns on global feature flags.

The standalone WALLET_EXPORT_RUNTIME=broker mode is still supported as an optional stricter deployment: use only dedicated WALLET_EXPORT_CDP_* and WALLET_EXPORT_X_* credentials and exclude ordinary signing/authentication credentials from that deployment.

### Customer enrollment

Nothing is automatically enrolled. Audit each initial customer's exact canonical binding, unique address and CDP account name/project, then use the internal operator mutation `walletExports:approveCustomer` with:

```json
{
  "provider": "x",
  "userId": "NUMERIC_PROVIDER_ID",
  "address": "AUDITED_CUSTOMER_ADDRESS",
  "bindingId": "EXACT_CANONICAL_CONVEX_WALLET_RECORD_ID",
  "projectId": "AUDITED_CDP_PROJECT_ID",
  "cdpAccountName": "EXACT_EXISTING_CDP_CUSTOMER_NAME",
  "approved": true
}
```

Use provider `telegram` for a permanent TG wallet. Names are checked against the existing customer naming formats; historical internal names are intentionally retained rather than recalculated after secret rotation. `Personal` names are rejected. Revoking eligibility uses the same internal mutation with `approved:false` and increments the binding revision, invalidating existing grants. Do not approve developer, fee, escrow or operator wallets simply because an address appears in a social account record.

After testing, enable the main UI and Convex flags, then publish the conditional Telegram `/export` slash-command entry using the existing configuration script. Disabling either initiating surface stops new requests; disabling Convex or the broker stops redemption. An already revealed private key cannot be revoked this way.

## Validation and remaining rollout work

Automated checks cover provider-ID collisions, owner substitution, forged/replayed Telegram proof, stale session generations and wallet selection, public input substitution, protected/duplicate bindings, unexpected CDP names/addresses, immutable retry keys, both chains' pending records, timed-out fences, response loss, isolation/CSP, and browser reveal/background clearing. RSA/Ed25519 cryptography is tested locally with disposable generated material. CDP HTTP and provider identity calls are mocked; no production key is used.

Before enabling customers:

1. Deploy the prior financial-recovery fixes on both services and review deployment versions. Passing local tests does not establish production deployment.
2. Configure the isolated hostname on the existing project and the provider callback/domain. Verify the existing CDP key's actual export permission and encrypted response interoperability using an explicitly designated disposable account. Account project/name checks do not cryptographically attest CDP credential scope; a compromised project-wide export credential may still reach protected accounts outside this application. Separate projects remain an optional stronger isolation boundary.
3. Audit eligible customer accounts and all signing callers. Shared wallet operations and operator leases are fenced; arbitrary direct CDP access/manual scripts cannot be fenced by the application. Never enroll operator accounts or let legacy direct signers operate on eligible customers.
4. Test X browser/app handoff and Telegram on Firefox mobile, Safari/iOS, Android and desktop. Telegram clients missing signed launch data fail closed. Test externally spending from a disposable exported wallet while preparing bot sends/trades and escrow deposits.
5. Verify response/storage/log capture on the deployed isolated host and conduct another authorization review. Main-site scripts, browser extensions, provider account takeover, backend/admin compromise and stolen provider proof remain part of the threat model. No software can promise 100% protection from them. The chosen social-only policy means someone controlling the owner's social account may authorize export.

Current operational bounds: three initiations per owner/hour. OAuth recovery stays in the same grant and does not consume another initiation; same-grant OAuth restarts have a separate ten/hour limit. The old shared 100/hour cap is removed. An optional positive integer Convex `WALLET_EXPORT_HOURLY_CAP` sets an operator emergency ceiling; it is off by default.

Ownership resolution uses owner/address indexes and per-wallet pending-work indexes. The `walletExportMaintenance:migrate` internal mutation backfills existing records in pages of 100, persists its cursor atomically and schedules the next page. The minute cron retries unfinished migration. New wallet and financial writes maintain these fields. Exports fail closed until the `walletExportMigration` row `key=v1` reports `ready=true`. Do not manually mark it ready or approve accounts before it completes. The migration classifies records; it does not approve customer eligibility.

Cleanup runs every minute in bounded batches of 100 per table, scheduling further batches after one second while a backlog remains. Expired grants (including sealed OAuth material and public encryption keys), confirmation prompts and expired limiter rows are deleted. Spent Telegram proof hashes stay for an additional five minutes after grant expiration to cover proof freshness. Audit metadata (account/grant IDs, stage, safe outcome code, time) is retained for 90 days. Customer approval records and the conservative external-control marker remain. Never store plaintext private keys, plaintext OAuth tokens or raw Telegram proof. OAuth verifiers and short-lived recovery tokens are encrypted with purpose/attempt-bound AES-GCM and removed on authentication, restart, close or expiry cleanup.

CDP resolution now looks up the audited account name, checks its returned name and normalized address, and uses the exact provider-returned address for encrypted export. X persists a sealed token before identity lookup. Lost token exchanges safely restart OAuth within the original grant after a 30-second callback lease; saved-token and committed-authentication stages can resume. Stale workers cannot complete a replaced attempt. Telegram accepts only an exact same-grant/browser/proof retry and reconciles authoritative status before discarding its in-memory proof.

The browser checks status again after decryption and before showing the key, before copying, and every two seconds while visible. A failed check hides it; checks time out after three seconds. Backgrounding, offline events and the 30-second display timeout also clear it. Logout detection is bounded by browser scheduling and network timing, not instantaneous or retroactive revocation. Android/iOS links open Firefox or Chrome on the isolated origin. The OAuth handoff contains only the PKCE-bound state/code callback and still requires the initiating export cookie; it never conveys the grant ticket/verifier or an access token. Other browsers use the app menu/manual return in the same browsing mode. The original browser must still hold its export cookie. Actual device behavior requires testing.

Safe HTTP errors distinguish configuration (503), eligibility (403), expiry (410), rate limits (429), pending work (409), callback recovery (409) and provider retry (503). ConvexError preserves these fixed codes in production. The export handler never forwards provider bodies; audit failures contain only allowlisted stage/outcome values.

Protocol references: [Telegram third-party proof validation](https://core.telegram.org/bots/webapps#validating-data-for-third-party-use), installed CDP SDK `src/utils/export.ts` and generated encrypted EVM export API schema. These support the implementation format; actual project permissions still require the disposable integration test.

## Initiation and delivery recovery (second-review fixes)

- Website initiation uses a client-generated attempt ID retained in memory across retries. A purpose-separated HMAC derives the delivery ticket from that attempt and the exact authenticated owner, session and browser family. Convex returns the existing live grant before charging initiation quota. A digest-only attempt tombstone lasts until the original immutable website session expires, so expired-grant cleanup cannot resurrect an old ticket. Expiry prompts the client to use a new attempt; owner/session/browser changes remain denied.
- Telegram's short-lived delivery ticket is similarly derived with the dedicated export secret and immutable confirmation-update/account/selection identity. Raw bearer tickets are not persisted in database records. The grant and delivery schedule commit with confirmation consumption. Lease-bound delivery retries recover the same URL, stop after delivery/expiry/revocation/selection change, and never transmit private keys. A scheduled lease rescue and the minute maintenance sweep recover interrupted workers, including interruptions before the initial lease. An ambiguous Telegram send response may produce a duplicate of the same short-lived link; it cannot create another grant or bypass verification.
- Initial browser claim and status failures expose an opening retry using the original in-memory proof. Reopening a ticket can reuse an existing matching HttpOnly cookie. A different ticket or browser cannot borrow that cookie or rebind the grant. If both the cookie and ephemeral verifier are lost, a new export request remains required.
- Callback recovery validates the request cookie against the grant before consuming X authorization. Saved-token recovery additionally requires the original callback-code digest. The code is not exchanged twice after its sealed token was saved; stale workers and replaced OAuth attempts remain rejected. No passkey was added.

The same minute cleanup removes expired attempt tombstones and continues bounded grant/proof/confirmation/limit/audit cleanup. The new schema and delivery functions must be deployed together with both website services before rollout. These changes add no environment variables.

## Third-review recovery fixes

Browser history restoration before encryption now hides stale controls and rechecks the current grant, expiry and wallet identity. Consent is unchecked again. Responses from older page lifecycles cannot overwrite the restored page. Once encryption or reveal has started, restoration still clears the key/session instead of reviving it. Authorization failures leave controls hidden and an appropriate retry or restart path.

X callback errors retain their fixed error categories. OAUTH_RESTART links to the export page for a new X authorization, without replaying the consumed callback. BUSY tells the user to wait 30 seconds. Recoverable provider failures retain same-callback retry. Expired/revoked/ineligible requests return to the wallet. A distinct browser-mismatch code preserves the original-browser handoff without confusing it with a revoked website session. Owner identity mismatch is an explicit authorization error.

The initial Telegram warning is now queued atomically with its confirmation record. Same-update retries retain the same code. Delivery leases, five-second failure retries, 30-second crash rescue, and the minute maintenance sweep recover failed or interrupted sends. New deliveries stop after expiry, consumption, replacement, wallet-selection change or eligibility revocation; an already in-flight Telegram send may still finish, but its old code cannot authorize a new grant. Stale workers cannot acknowledge a replacement prompt. This first stage consumes no export quota and creates no verification grant. Delivery failure messages no longer claim the service is unconfigured.

Deploy the updated confirmation schema, maintenance mutations and Telegram delivery action together. No additional environment variables are required. Export remains disabled until the separate service and provider/mobile validation are completed.
