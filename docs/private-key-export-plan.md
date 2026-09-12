# Wallet private-key export plan

Planning only. No wallet keys were exported or export endpoints enabled.

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
2. Start a separate, short-lived export challenge bound to browser family, session generation, immutable X ID, resolved wallet address, and the browser's export-encryption public key.
3. Complete a fresh X OAuth authorization specifically for this challenge. Reusing the normal 30-minute transaction-authentication window is insufficient. Bind mobile completion to the initiating browser. Fresh OAuth may reuse an existing X login; do not claim it forces an X password or MFA prompt.
4. Show the wallet being exported and require explicit confirmation: Anyone with this key can take all funds on Arc, Base, and other EVM chains. Never share it. Exporting does not disconnect Argos Bot.
5. Reveal only after confirmation. Offer an explicit Copy action, hide after 30 seconds, and clear display on close, logout, wallet switch, navigation, or backgrounding. Hide is not revocation or guaranteed memory erasure. Do not promise clipboard clearing.

## Telegram experience

1. Add Export TG wallet key to the private-chat wallet settings for users with a permanent TG wallet. If an X wallet is selected, require switching to TG first and clearly identify the selected wallet.
2. An inline web_app button opens the HTTPS export Mini App inside Telegram. No key is sent through sendMessage, sendData, callback payloads, bot message persistence, or downloadable Telegram attachments.
3. Validate Telegram's signed initData on the server, including numeric user ID and a short auth_date window. Reject missing, forged, stale, or replayed data. Never authorize from initDataUnsafe or username.
4. A dedicated challenge binds that Telegram user, permanent wallet record, Mini App browser key, and initiating private-chat action. Require a fresh confirmation tied to the same challenge; a forwarded link or a stolen ordinary website cookie is insufficient.
5. Use the same isolated reveal interface as X. It must not sign the user into the main website or replace an existing X website session.

Telegram cannot supply the user's Telegram password or guarantee a fresh account MFA check for this action. Someone controlling their Telegram account/device could authorize an export. A pre-enrolled independent passkey is an optional stronger control; enrolling one during a compromised session is not meaningful protection. No raw-key chat fallback on unsupported clients.

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

Use a dedicated persistent challenge state machine: pending_auth -> confirmed -> exporting -> delivered/expired/failed. Proposed defaults: five-minute challenge, 60-second confirmation grant, and three initiations per owner per hour. These limits are implementation choices, not provider requirements.

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

## References reviewed

- CDP import/export documentation: https://docs.cdp.coinbase.com/wallets/using-wallets/import-and-export
- Telegram Mini Apps and initData validation: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
- Installed SDK: node_modules/@coinbase/cdp-sdk/src/client/evm/evm.ts (exportAccount), src/utils/export.ts (RSA-4096/OAEP-SHA256).
- Existing ownership/session logic: lib/otc/http.ts, convex/telegramWallets.ts, app/api/wallet-signer/[...path]/route.ts.
- Existing transaction/escrow guards: lib/otc/unsigned-recovery.ts, lib/otc/transactions.ts, lib/otc/escrow-model.ts.
