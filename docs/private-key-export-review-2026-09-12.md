# Private-key export readiness review — 2026-09-12

Implementation update: this is the historical pre-implementation review. The user subsequently requested implementation without an independent passkey. See [the implementation and deployment notes](private-key-export-implementation.md) for current status. No production export has been enabled.

Scope: local source and SDK inspection, provider documentation, and mocked authentication/recovery tests. No production data audit, deployment, key export, CDP permission mutation, live transaction, real sign-in or Telegram message was performed. The previous five financial/social/operator fixes remain uncommitted local changes; this review adds planning documents only.

## Assessment

The current CDP server-account model can support customer key export. Customer export is not implemented and should remain disabled until the dedicated authorization, credential isolation, delivery and cross-chain coordination layers exist. The earlier outside-spending changes are necessary foundations, not a completed export feature.

We can require an exact match between verified provider identity and a single registered wallet and prove rejection of wrong-owner cases in tests. We cannot honestly promise 100% certainty that the person controlling an authenticated account is its rightful human owner, or protection after compromise of the client, export service, database authority or CDP credential. Export is irreversible disclosure, unlike a short-lived website login. A pre-enrolled independent passkey is the recommended additional factor; it too needs a secure enrollment/recovery policy.

## Current foundations verified

- X sessions contain an immutable numeric X ID. TG sessions use a distinct `tg:<id>` owner namespace. Ordinary write requests check session revocation/browser binding, origin, CSRF, recent authentication and repository wallet ownership (`lib/otc/http.ts`, `lib/web-session-authority.ts`).
- X provisioning validates its canonical customer wallet and rejects an address already bound to another X user. TG native binding is immutable per TG user; switching the bot's selected wallet does not change that ownership (`convex/wallets.ts:655`, `convex/telegramWallets.ts:67`).
- Dedicated OTC escrow wallets separate funded listing inventory from ordinary customer wallets. The reviewed recovery fixes preserve uncertain funding and prevent the counterparty from retrying a cancelled customer gas payment (`lib/otc/signed-recovery.ts`, `lib/otc/escrow-model.ts`).
- Signed underfunding retains signatures and reservations, and receipt/nonce recovery remains available. A database change does not revoke an already-issued signature.
- No customer-export endpoint, grant schema, Mini App export validator or passkey implementation was found in the inspected app/lib/convex source. This is not a claim that the SDK lacks export support; it supports it.

## Export blockers and design changes

| Priority | Finding | Required change |
| --- | --- | --- |
| High | Existing X login deliberately reuses a session authenticated within 30 minutes. Sending users through that normal URL does not prove fresh export authorization (`app/api/auth/x/start/route.ts:44`). | Dedicated purpose-bound OAuth flow, exact immutable-ID comparison and final explicit export approval. Do not alter normal sign-in convenience. |
| High | TG website login and TG-to-X linkage authorize their existing functions; neither is a key-export grant. A bot-token-only Mini App verifier would let a stolen bot token forge identity. | TG-native-only export inside the private-chat Mini App, Telegram Ed25519 proof, replay prevention and an independent factor. X-selected TG wallets must use the X export flow. |
| High | There is no unified cross-table registry that classifies every customer/escrow/operator address. X checks uniqueness within its table; TG binding checks a user's permanence but not global account classification. This is an export-design gap, not evidence of a current customer exploit. | Canonical normalized address registry with immutable owner/provider/class, reviewed backfill, cross-table uniqueness, protected-account exclusions and fail-closed resolution. |
| High | Current locks are per chain/transaction; `beginSigning` has no global export fence (`lib/otc/unsigned-recovery.ts:14`). Direct CDP signing also exists in signer/operator code. | Atomic per-address coordination across Arc/Base and every customer signing entry point. Do not rely on a preflight read outside the signing mutation. |
| High | SDK `exportAccount` generates its encryption key on the Node server and decrypts there. Reusing it in a website route would put plaintext wallet keys inside the application process (`node_modules/@coinbase/cdp-sdk/src/client/evm/evm.ts:276`). | Relay CDP ciphertext encrypted to the approved browser key. Prefer isolated export credentials/process/origin; never add raw-key export to generic signer or bot dispatch. |
| High | Existing CDP signing privileges do not prove the Export scope is enabled or limited to customer accounts. A broad export credential can bypass application account exclusions if stolen. | Verify disposable-account permissions. Use dedicated minimum-scope credentials outside ordinary workers. Confirm account/project export isolation before claiming escrow keys are protected from credential compromise. |
| Medium | The earlier proposal generated a browser decryption key before OAuth. A full-page/mobile redirect can destroy that in-memory key. | Finish fresh authentication/handoff first, then generate and bind the key before approval. Never persist the decryption key as a workaround. |
| Medium | Existing layout/CSP is for normal wallets and denies framing globally (`middleware.ts`, `next.config.ts`). Telegram Web embedding, bridge scripts and isolated reveal behavior need a distinct policy. | Minimal export UI, exact scoped headers, no analytics/error payloads, no general layout scripts or wallet polling. Test Telegram native and web clients; do not weaken main-site policies. |

## Ownership and threat boundary

The key selector is a trusted database lookup from fresh verified identity, never the public wallet URL, submitted address, display name, ticker, Telegram selection or caller-supplied CDP name. CDP authenticates our project credentials; it does not independently know which X/TG customer owns each server account. That binding is our responsibility.

The export authority must recheck owner, account class, wallet binding revision, session/identity proof, approved browser key and grant lease immediately before the CDP request and before a recovered response is relayed. A cryptographic consistency check derives the expected address after client decryption, but cannot repair disclosure of the wrong key; correct authorization must occur before export.

Provider-only login cannot resist an attacker who controls the provider account. Prior passkey enrollment with verified user presence, a proposed activation delay, and protected recovery adds another boundary. A new passkey created during a compromised session does not retroactively establish rightful ownership. Account recovery must not silently downgrade to username checks, ordinary Telegram links or support sending raw keys.

Ed25519 validation reduces the risk from a leaked TG bot token. It does not prevent malicious Telegram UI, stolen fresh initData, session takeover, or a compromised export origin. Challenge binding, a second factor and secure client rendering remain necessary.

The proposed isolated export origin is not magic: if it trusts owner assertions signed by the already-compromised general web server, or if it shares that server's credentials/deployment access, the intended boundary does not exist. The final design must document what each service can independently authorize and what remains trusted.

## Effect on trading and OTC

Export reveals the same EVM key used on Arc and Base, grants control of all assets/approvals at that address, and does not remove CDP's ability to sign. Neither X unlink nor logout revokes it. Existing signed transactions can still execute, including after export.

Ordinary wallet funds can be moved externally at any time. Fresh balance/nonce checks reduce failures but cannot reserve those funds on chain. All users must remain protected by outside-spending recovery whether or not an export marker exists. A missing export marker is not evidence that no one else knows the key.

Verified escrow listings need not block customer export: the customer does not receive the escrow key. Buyer/seller payout destinations stay fixed to the accepted order even if the customer changes social links or exports. Deposits/top-ups still in flight must be resolved before starting the coordinated export. Customer wallet drains after a verified deposit do not invalidate funds already held in escrow. A payout subsequently spent by its recipient remains a delivered payout.

Uncertain external contract-mediated funding stays protected for manual reconciliation. Export cannot make arbitrary external activity automatically understandable, remove cross-chain non-atomicity or make a signed payment revocable. Operator recovery remains necessary for unsupported cases.

## Implementation package

The detailed plan is in `private-key-export-plan.md`. Build the canonical ownership resolver and registry first, then the signing fence, dedicated fresh provider authorization and passkey policy, encrypted export adapter, and isolated UI. Expected new modules: `convex/walletExports.ts`, a registry/ownership resolver, a small export-only CDP adapter, a Telegram initData verifier and a reveal application. Names/routes remain proposals until the isolated-origin deployment decision is made.

The normal UI can offer Export private key in wallet settings. X-linked users complete the export-specific X authentication; TG-native users open the bot's export Mini App. No public X command, Telegram chat reply, URL query, download attachment, automatic clipboard copy or ordinary wallet API returns plaintext. Reveal/copy is an explicit local action. Hiding removes the visible display but is not key revocation, guaranteed memory erasure or clipboard clearing.

## Validation and release gates

299 tests passed across 15 selected authentication, TG ownership, social API and financial-recovery suites in this review. They cover existing foundations and the previous fixes; they do not validate an export endpoint that has not been built. No current ownership regression was reproduced in that selection.

Before enabling export: deploy the financial fixes; audit real customer-to-CDP address mappings without exporting; resolve ambiguous/protected-account classifications; prove browser/CDP RSA interoperability on a designated disposable account; test races and forged grants; inspect all logs/storage/network destinations; test X mobile handoff and Telegram iOS/Android/Desktop/Web; independently review the completed export authorization and credential boundary.

The negative test matrix must assert zero export calls for wrong-owner or excluded targets, including A/B account swapping, TG-to-X escalation, name/address substitution, duplicate ownership, stale or revoked proof, changed browser/public key, forged signatures, replay/concurrent redemption and expired leases. Test dropped responses without rebinding the request, and never infer successful human receipt from an HTTP 200 or acknowledgment alone.

## Primary references

- [CDP encrypted export API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/evm-accounts/export-an-evm-account): ciphertext response, recipient RSA public key and idempotency support.
- [CDP import/export](https://docs.cdp.coinbase.com/wallets/using-wallets/import-and-export): server-account support and explicit Export API-key scope. Its user-wallet iframe is a different authentication model and is not assumed to be a drop-in solution for our existing server accounts.
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-for-third-party-use): production-key signature and timestamp validation.
- [X OAuth 2.0 PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code): fresh code flow; do not assume OAuth 1.0 `force_login` guarantees apply to this flow.
- [OWASP transaction authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html): server-enforced, purpose-bound approval and protected authorization state.
