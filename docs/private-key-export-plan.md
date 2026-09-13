# Wallet private-key export plan

Implementation has started locally. No wallet keys were exported or export endpoints enabled. See private-key-export-implementation.md for the implemented controls and deployment steps.

Updated after the 2026-09-12 ownership/export-readiness review. See `private-key-export-review-2026-09-12.md` for current gaps, test evidence and release gates. This document records the design; the implementation document states what is built and what still needs deployment validation.

## Feasibility and scope

The installed CDP SDK supports EVM server-account export by address or name. Its convenience method returns a 32-byte private key encoded as 64 hexadecimal characters. These are the account types used by Argos Bot. A live disposable-account export must still verify project permissions before rollout.

One key controls the same EVM address on Arc, Base, and other EVM chains. Export does not move funds, change the wallet address, revoke CDP signing access, or remove the Telegram/X association. A revealed key cannot be revoked; replacing it requires a different account and moving funds.

Allowed identities:

| Wallet | Export surface | Authority |
| --- | --- | --- |
| X-linked customer wallet | Website wallet page | Fresh X authentication for the wallet's immutable X user ID |
| Permanently TG-linked customer wallet | Mini App opened from the private Telegram bot chat | Validated fresh Telegram initData and an owner-bound export challenge |
| X wallet selected within Telegram | Website only | Telegram linkage alone cannot export the X wallet |
| OTC escrow, operator Personal accounts, platform-controlled accounts | Never through customer export endpoints | Explicitly excluded |

The resolver must use existing customer wallet records. No supplied wallet address, CDP name, username, or ownerReference can select an export target. Validate the stored signer reference and CDP address against that resolved record. Do not auto-create a wallet during export.

## X website experience

1. On the authenticated owner's wallet page, add an Export private key control under wallet settings. Never expose it to public wallet viewers or Telegram website sessions.
2. Start a separate, short-lived export challenge bound to the initiating browser, session generation, immutable X ID and resolved wallet address. Its purpose must be key export, never an ordinary wallet session or Telegram-link grant.
3. Complete a fresh X OAuth authorization specifically for this challenge. Reusing the normal 30-minute transaction-authentication window is insufficient. Bind mobile completion to the initiating browser. Fresh OAuth may reuse an existing X login; do not claim it forces an X password or MFA prompt.
4. After returning to the initiating browser, generate the in-memory encryption key and permanently bind its public-key digest to this challenge. Show the wallet being exported and require explicit confirmation: Anyone with this key can take all funds on Arc, Base, and other EVM chains. Never share it. Exporting does not disconnect Argos Bot.
5. Reveal only after confirmation. Offer an explicit Copy action, hide after 30 seconds, and clear display on close, logout, wallet switch, navigation, or backgrounding. Hide is not revocation or guaranteed memory erasure. Do not promise clipboard clearing.

## Telegram experience

1. Add Export TG wallet key to the private-chat wallet settings for users with a permanent TG wallet. If an X wallet is selected, require switching to TG first and clearly identify the selected wallet.
2. An inline web_app button opens the HTTPS export Mini App inside Telegram. No key is sent through sendMessage, sendData, callback payloads, bot message persistence, or downloadable Telegram attachments.
3. Validate Telegram's signed initData on the server, including numeric user ID and a short auth_date window. Prefer Telegram's Ed25519 signature verified with its production public key and this exact bot ID, so possession of the bot token alone cannot forge the export identity. Reject missing, forged, stale, future-dated, duplicate-field or replayed data. Never authorize from initDataUnsafe or username. Do not silently fall back to weaker validation on clients missing the required signature.
4. A dedicated challenge binds that Telegram user, permanent wallet record, Mini App browser key, and initiating private-chat action. Require a fresh confirmation tied to the same challenge; a forwarded link or a stolen ordinary website cookie is insufficient.
5. Use the same isolated reveal interface as X. It must not sign the user into the main website or replace an existing X website session.

Telegram cannot supply the user's Telegram password or guarantee a fresh account MFA check for this action. Someone controlling their Telegram account/device could authorize an export in a social-login-only design. The user explicitly chose fresh social verification without an independent passkey. The implementation follows that choice; control of the social account remains sufficient to act as its owner. No raw-key chat fallback on unsupported clients.

## Encrypted delivery

Prefer the CDP encrypted export endpoint over calling the SDK convenience method, which decrypts the private key inside the application server.

1. Browser Web Crypto generates a temporary RSA-4096 OAEP/SHA-256 key pair. Keep the decryption key nonextractable and in memory. Export only the public SPKI key.
2. Bind that public key's digest to the authenticated export challenge before approval.
3. A dedicated server endpoint resolves the account and calls CDP using server-side CDP credentials and wallet authorization. Supply the approved public key as exportEncryptionKey.
4. Relay encryptedPrivateKey to the same authorized client. Decrypt locally and derive its public address locally to verify the expected wallet before reveal.
5. Convex stores only owner/wallet references, challenge/public-key digest, timestamps, and audit outcome. Never store a plaintext private key, decrypted response, clipboard content, or ordinary command result containing one.

This design is supported by the installed SDK's encryption format and API schema, but browser/CDP interoperability must be proven on a disposable wallet. It reduces routine server exposure; it does not protect against malicious frontend code or a compromised export server substituting its own key.

Use an isolated page without analytics, session replay, error payload capture, or general wallet polling. Apply no-store responses, no-referrer, a restrictive script/connect policy, and no service-worker caching. Permit only the Telegram integration scripts/frame context required by tested Mini App clients. Keep all CDP credentials server-side. Do not expose this operation through the existing generic command dispatcher or AI execution paths.

## Export authorization and recovery

Use the dedicated persistent challenge state machine specified below, including separate identity verification, encryption-key binding, approval, export, and response acknowledgment. Proposed defaults: five-minute challenge, 60-second confirmation grant, and three initiations per owner per hour. These limits are implementation choices, not provider requirements.

Consume approval atomically; fence concurrent attempts. A lost response may retry the same approved encryption key and CDP idempotency intent during a bounded window. Never rebind an approved request to a new wallet, browser key, or identity. A closed browser that lost its decryption key must start a new authorization.

Audit metadata can distinguish CDP response relayed from client acknowledgment; neither proves the user safely saved their key. Treat export-attempted accounts conservatively for transaction safety. Revocation, unlinking X, logout, session-generation changes, and expired authentication invalidate outstanding export grants.

## Effect on trades and OTC

Dedicated listing escrow remains viable: the deposited funds are in a different CDP account whose key is never exported. Exporting the seller's ordinary wallet does not unlock that escrow. Keep immutable buyer/seller payout destinations; exporting is not permission to change an accepted order's recipient.

Before first export, atomically prevent new wallet signing while checking both Arc and Base for active signing, ambiguous CDP results, submitted transactions, and funding operations. Finish/reconcile existing work first. Open listings whose deposits are already verified need not block export solely because the escrow is still active. Any legacy holds backed by funds in the ordinary wallet need explicit settlement before export.

After export, a database lock cannot stop outside transactions. Do not claim otherwise. Persist an exported/external-control-possible marker and harden all future execution for fresh nonce/balance checks, replacement transactions, externally consumed nonces, and missing funds. Never retry a different payment after the original could have landed. Never permanently lock a wallet merely because its nonce was consumed externally; reconcile the actual transaction or report a concrete unresolved conflict. This must be reviewed on both chains before rollout.

## Implementation order and acceptance checks

1. Disposable-wallet export/encryption proof, with no production-user keys exposed.
2. Shared owner resolver, export grants, audit metadata, and endpoint exclusions.
3. X fresh-authorization flow and isolated browser reveal.
4. Telegram Mini App identity verification and reveal, including BotFather HTTPS configuration.
5. External nonce/balance conflict handling for exported wallets and interaction with existing operator/signing locks.
6. Security and device testing before enabling either surface.

Required tests include wrong-owner requests, address/name substitution, cross-provider access, revoked X links, stale/replayed Telegram data, public-wallet viewing, concurrent grant redemption, browser-key substitution, response loss, pending signing on either chain, escrow export attempts, navigation/background clearing, and absence of key material in logs/storage. Device tests: Firefox mobile with X-app handoff, Safari/iOS Telegram, Android Telegram, and desktop Telegram. Test externally spending from an exported disposable wallet while a bot request is preparing; recovery must not double-pay or silently deadlock.

## Implementation specification refinements — 2026-09-12

### Ownership is a server invariant

Introduce a canonical `walletAccounts` registry, keyed by normalized EVM address and carrying an immutable account ID, CDP project ID, account class, identity provider, immutable numeric owner ID, stored signer address and binding revision. Account classes distinguish customer X, customer TG, escrow, operator and platform accounts. Register accounts atomically when provisioning; backfill and audit existing records before enabling export. Explicitly mark excluded addresses rather than inferring eligibility from a CDP name prefix. Block any ambiguous cross-table ownership or conflicting classification.

For X, follow `xReplyUsers.walletId` to the canonical active `cryptoWallets` row. For TG, resolve only `telegramNativeWallets` for the authenticated numeric Telegram ID. The TG wallet selector and `telegramAccountLinks` are not export authority for an X wallet. Normalize `x:<id>` and `tg:<id>` centrally; existing execution code uses both bare X IDs and prefixed signer owner references, so never accept an arbitrary owner-reference string at the export boundary.

Every authorization/redemption must satisfy:

`authenticated provider + numeric ID == registry owner == fresh proof owner == grant owner`

`registry wallet == original customer binding == stored signer address == CDP account address == grant wallet`

Also require an allowed account class, unchanged binding revision, active unrevoked authentication and the approved browser/public-key binding. A URL address, username, hidden form field, callback argument or CDP name is never the selector. Zero or multiple candidates means deny. Export never calls `getOrCreateAccount`; the legacy HMAC naming scheme must not be used to recompute an existing target, especially after secret rotation. Local address derivation after decryption is a final consistency check, not a substitute for server authorization: a wrong key must be prevented from being released in the first place.

### Separate export authority and rendering

Prefer an isolated export service and origin with a minimal static reveal bundle, independent deployment credentials and dedicated CDP API credentials. CDP documents an explicit Export scope. Keep ordinary trading/worker credentials without that scope; do not turn the generic signer into an export proxy. A separate key stored in the same general website process is not meaningful process isolation.

The export service must verify fresh provider proof itself or use a narrowly scoped, purpose-bound authorization authority. An arbitrary owner ID plus the shared `WEB_AUTH_SECRET` or `WALLET_SIGNER_TOKEN` must not authorize export. Separate CDP bearer/wallet authorization from the public endpoint. All public requests are strict schemas with bounded bodies; provider errors are converted into fixed codes without logging request/response objects.

CDP's account-policy documentation reviewed here does not establish account-specific export restrictions. Before rollout, verify whether the dedicated export credential can be restricted to customer accounts. If not, application exclusions do not protect escrow keys from compromise of that credential. Stronger separation may require different CDP projects for protected accounts; do not migrate existing accounts or funds as part of this planning task.

The main website can link to the export origin but must not receive key bytes through postMessage or an API. Use host-only secure cookies, exact Origin validation, CSRF tokens and purpose-specific grants. Separate-origin handoff credentials are short-lived and proof-bound, never a bearer URL that grants export. Recheck revocation at final authorization and before relaying a recovered response. Main-site logout/account changes invalidate pending grants linked to that session generation; TG selection changes invalidate the TG export challenge. None of these actions can revoke a key already disclosed or a CDP request already accepted.

The isolated route needs its own enforced CSP, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, no analytics, no ordinary wallet polling, no external token content, no service worker and no error capture containing data. Current global `X-Frame-Options: DENY`/`frame-ancestors 'none'` and script/connect policies need tested, narrowly scoped exceptions for Telegram Web embedding and the Telegram bridge. Never relax them across the main wallet or market. Supported client checks must fail closed rather than sending a key in chat.

### Grant lifecycle and signing coordination

Proposed states: `awaiting_auth -> authenticated -> key_bound -> approved -> exporting -> response_relayed -> acknowledged`. Alternative terminal states: `expired`, `revoked`, `denied`; use `outcome_unknown` for a timed-out CDP call instead of claiming export failed or never occurred. Each transition is enforced atomically in Convex and cannot skip the fresh-authentication, key-binding or approval stages.

Metadata includes account/owner IDs, binding revision, session-generation hash or TG challenge reference, public-key digest, proof timestamp, approval timestamp, expiry, attempt ID, lease revision, CDP idempotency UUID and sanitized outcome. Audit entries are append-only to ordinary application roles; they are not claimed tamper-proof against database administrators. No key bytes, OAuth tokens, raw initData, decryption keys or complete CDP payloads go to Convex, logs, analytics or bot-result tables.

Candidate timing: five minutes for a fresh identity proof/challenge, 60 seconds for a final approval, 30 seconds of visible key, three initiation attempts per owner per hour plus browser/source/global throttles. A challenge-ID lookup must itself be proof-bound and rate-limited; knowledge of the ID never grants access. These are proposed product defaults, not provider guarantees. A timeout retry retains the identical wallet, encryption key and CDP idempotency intent. A new browser key requires new authentication/approval. Dropped browser memory never justifies localStorage, sessionStorage or a server-side plaintext fallback.

At approval, atomically acquire a fence keyed by account/address across both Arc and Base. Check both chain transaction records and operator leases, and reject export while signing may already have started or a transaction outcome is ambiguous. Do not create a fence by overwriting `activeTx` or releasing financial holds. Every new-signature path must read the same fence in its atomic begin-signing transaction; preparation, approval signing, fee replacement, OTC customer deposits and customer gas top-ups must participate. Existing direct-CDP operator/legacy paths must be fenced or expressly prohibited from signing export-eligible accounts. A check immediately before CDP outside this mutation is not sufficient.

Mark `externalControlPossibleAt` before calling CDP, even if the response later times out. Release the coordination fence through a bounded recovery path without clearing this permanent risk marker. A stale worker must not initiate a new export after losing its lease; replaying an already-started result remains tied to the same approved client. Once an account may be externally controlled, quiescence can never be guaranteed by a bot fence. Normal trading must continue using the outside-spending safeguards regardless of the marker.

### Interaction with OTC and existing wallets

| Situation | Required behavior |
| --- | --- |
| Verified open listing held in dedicated escrow | Does not alone block the customer's key export; escrow key remains excluded |
| Customer deposit/top-up signing underway or uncertain | Finish/reconcile it before beginning export |
| Seller Base payment / buyer Arc payout from escrow | Keep the order's accepted destination immutable; customer key export never changes it |
| Customer externally drains funds before bot signing | Reject/cancel unsigned work safely; never create an extra debit to compensate |
| Outside same-nonce replacement after signing | Verify actual receipt/nonce and preserve unrelated holds; no new payment on a guess |
| Contract call may have funded escrow | Keep linkage and protected inventory for reconciliation; do not label unfunded |
| Incoming payout immediately spent externally | Use the established transaction delivery evidence; do not require funds to remain unspent |
| Existing allowance or signed transaction | Export does not revoke it or eliminate its risks |
| Ordinary public wallet page | Never grants export rights, even when viewing one's address while logged into another identity |
| Customer account already exported | Repeat export still requires fresh proof and approval; changing the key requires a new wallet |

### Release order and hard gates

1. Deploy and verify the previous financial-recovery fixes on both Convex and Vercel. Do not infer deployment from passing local tests.
2. Implement/audit the canonical registry and deny ambiguous or protected addresses. Use fresh social verification as requested, without a passkey requirement.
3. Add the cross-chain signing fence and audit every direct CDP signing entry point. Test approval/fee-replacement/top-up races and operator interactions.
4. Build the isolated encrypted export adapter and prove CDP interoperability with an explicitly designated disposable account. Do not export an existing customer/operator/escrow key for testing.
5. Implement purpose-specific fresh X authorization and TG Mini App verification, then the isolated reveal interface and retry lifecycle.
6. Run wrong-owner and replay attack tests, capture traffic/storage/logs during disposable-account tests, and complete mobile/device testing. Independently review the final authorization and credential boundaries before enabling a customer cohort.

Required adversarial cases include X user A requesting B's address/name/record ID, TG-to-X escalation, numeric ID namespace collision, case-variant addresses, duplicate registry ownership, browser/account switch mid-flow, session revocation before/after approval, stale provider proof, stolen or replayed initData, forged bot-token HMAC without Telegram's signature, CSRF, forwarded challenge links, RSA-key substitution, competing redemption, lost response, unexpected CDP account, exclusion of escrow/operator accounts, CSP/frame bypass, cached reveal on navigation/back, leaked telemetry, and simultaneous Arc/Base signing.

The acceptance target is deterministic rejection of unauthorized combinations with zero CDP export calls and no secret delivery. Tests and a review support that target; they do not provide a mathematical guarantee against compromised endpoints, administrators, dependencies or social accounts.

## References reviewed (updated)

- CDP encrypted response and idempotency contract: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/evm-accounts/export-an-evm-account
- Telegram public-key signature verification: https://core.telegram.org/bots/webapps#validating-data-for-third-party-use
- X OAuth 2.0 PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- OWASP transaction authorization: https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html

- CDP import/export documentation: https://docs.cdp.coinbase.com/wallets/using-wallets/import-and-export
- Telegram Mini Apps and initData validation: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
- Installed SDK: node_modules/@coinbase/cdp-sdk/src/client/evm/evm.ts (exportAccount), src/utils/export.ts (RSA-4096/OAEP-SHA256).
- Existing ownership/session logic: lib/otc/http.ts, convex/telegramWallets.ts, app/api/wallet-signer/[...path]/route.ts.
- Existing transaction/escrow guards: lib/otc/unsigned-recovery.ts, lib/otc/transactions.ts, lib/otc/escrow-model.ts.
