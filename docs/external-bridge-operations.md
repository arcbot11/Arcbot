# Arc / Base bridge

`/bridge` offers Connected Wallet (injected EIP-6963 wallets or WalletConnect) and authenticated Argos Bot Wallet modes. Connected-wallet requests remain browser-signed; bot-wallet confirmations use the existing durable server signing runtime. Setup and transfers require separate explicit confirmations. No live transaction is part of implementation testing.

## Configuration

- `BRIDGE_ARC_RPC_URL`, `BRIDGE_BASE_RPC_URL`: HTTPS RPC endpoints. Use dedicated production endpoints; public endpoints are rate limited. Chain ID, head freshness and canonical blocks are checked.
- `BRIDGE_QUOTE_SECRET`: random server-only secret of at least 32 characters. Falls back to the existing `WEB_AUTH_SECRET`. Used to bind reviews to calldata, recipient, route, nonce, fees and expiry.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Reown project with the deployed site origin allowed. Without it, injected wallets still work; WalletConnect is disabled.
- `BRIDGE_BLOCKED_ORIGINALS`: optional JSON array of `{chain,token}` entries for known incompatible original tokens. These block setup and transfers in both directions by original identity. Malformed configuration blocks route discovery. An empty or unset list blocks no tokens; it is not automatic detection of incompatible behavior. `BRIDGE_REVIEWED_ORIGINALS` is no longer used.

Original tokens do not require manual admission. Both directions of an existing ownerless route are supported, subject to the blocked-token policy and transaction checks. Contract wallets, delegated EOAs, custom recipients and arbitrary hooks are intentionally unavailable in this version.

## Operations and recovery

Circle service, delegates, manager and wrapper code are pinned. An upgrade or ownership change blocks new preparations. Re-review pins rather than bypassing the check. The ownerless sentinel is not the zero address. Original token controls and Circle governance remain relevant.

Reviews simulate the exact call, use exact manager allowances (zero reset when required), check pending nonce, quote expiry, token funds and gas reserve. Registration, remote wrapper deployment, approval and transfer are separate transactions. Paid Circle forwarding is requested for deployment and transfer. Arc gas is 18-decimal native USDC; Base gas is ETH. Approval review precedes the forwarding quote and is not a promise of a later fee.

Browser history is schema-validated and stored immediately before opening a wallet prompt, after local identity and expiry checks. Preflight failures never leave a false pending request. Cross-tab history mutations share the signing lock; imports are deduplicated and retain concurrently created entries. An interrupted or uncertain submission blocks resubmission. Recover using the source hash; recovery must match the saved calldata, sender, nonce and value. If a wallet request never broadcast and no rejection was returned, inspect the wallet and chain before resolving local history; do not casually clear storage. Cross-tab signing requires Web Locks. Browser history is not an account-wide distributed nonce lock.

Source and destination RPC chain IDs are verified. Source receipt finality and canonicality precede forwarding checks. Approvals require an exact allowance event; registration requires the ownerless token-ID event. Circle's message is bound to the source `MessageSent` payload; destination `MessageReceived` and CTS execution events prove completion. Current wallet balances are not delivery evidence. Status checks are read-only and refresh every 15 seconds while the page is visible. Delayed forwarding must never lead to a repeated source transfer. Manual destination redemption is not exposed yet; preserve the source hash for support if Circle forwarding fails.

Completed setup or approval entries provide a read-only continuation that reloads the route. A fresh review is always required before the next wallet request. Expired reviews are removed from the UI. Revalidation simulates with the reviewed gas and fee caps. The API uses bounded streaming JSON reads and returns HTTP 429 on per-instance request limits; configure shared edge rate limiting for multi-instance production deployments.

## Release checks

Destination eligibility is checked against the destination service denylist and, for wrapped tokens, its separately configured token denylist during preparation and revalidation. An unavailable check blocks signing. These checks cannot prevent a later governance change while a message is in flight.

Recover/import accepts a finalized speed-up or cancellation hash. Matching sender and nonce reconcile the original pending/unknown operation. Different calldata or value leaves the original marked replaced and creates a separate record for the replacement's actual status. A replacement that is still forwarding remains unresolved and blocks another submission until delivery is reconciled. Prior hashes remain in the record. No automatic replacement search or resubmission is performed.

Route verification reads each trusted domain's actual service address from the reviewed ERC-7201 storage mapping, after implementation pins pass. A nonzero mapping alone is insufficient; both directions must point to the pinned Circle service.

Production CSP permits exact WalletConnect relay, verification, modal API and configured public-chain RPC origins. These permissions also apply to entry pages because client navigation to the bridge retains the current document's CSP. No wildcard network permission is added.

Shared wrapper setup may finish through another user's deployment. Recovery verifies the exact ownerless route at finalized canonical blocks and marks setup satisfied without asserting that the original forwarding request succeeded or its fee was refunded.

Local history retains up to 200 entries, pruning only the oldest terminal entries as new records are written. Every unresolved record is retained. Save older transaction hashes externally when long-term history is needed; source-hash import remains available.

Run TypeScript, bridge tests and production build. Verify reverse route and source-hash recovery with read-only historical receipts. Configure production RPCs and WalletConnect origin. Perform an independently reviewed tiny live round trip only under separate authorization. No deployment or production wallet transactions have been performed by this change.

## Argos Bot Wallet mode

The two wallet buttons select connected EIP-1193 signing or the authenticated Argos Bot Wallet. Bot requests derive their sender from the recent website session, enforce CSRF/origin and identity checks, and use the same Circle route reviews. Each step requires separate confirmation. No operator wallet is used.

Bot confirmations use a deterministic ID bound to owner and sealed review, the existing atomic wallet reservation and signing fence, and the durable worker. The exact reviewed envelope is revalidated before signing. Expired unsigned requests cancel and release their reservation; uncertain signatures are reconciled using their original idempotency key. Failed pre-admission confirmations create an atomic cancellation fence so a delayed duplicate cannot start later. Browser history keeps the bot request ID for status checks and explicit retry of that same confirmed request. Source settlement does not imply destination delivery.

Deploy the updated Convex OTC mutations and website/worker runtime together before enabling this version publicly. Existing CDP/session/RPC configuration is reused; WalletConnect project configuration is only required for the connected-wallet QR option. Validation for this change must use mocks or read-only checks, never live wallet transactions without separate authorization.

## Open token admission

Registration and wrapper creation no longer require a manual original-token allowlist. Every transfer intent (including its approval steps) must carry `riskAcknowledged: true`, selected explicitly by the user. The acknowledgement is bound into the signed review and checked again before signing in both wallet modes. The UI uses the same warning for every token, with no verified/unverified labels. Simulations cannot certify redemption or future token behavior. Existing Circle implementation, ownerless binding, denylist, funds, gas, nonce, journal and finality checks remain mandatory. Never use the blocked-token list as a substitute for those checks.

## Contextual recovery

The current transaction panel exposes hash recovery for unresolved requests, including speed-ups and cancellations. It verifies finalized sender/nonce binding before merging evidence. Bot requests without a hash can retry only their existing sealed request; expired reviews can be reconciled or atomically cancelled, never newly signed. The historical Activity & recovery section remains removed.

Candidate discovery uses independent read snapshots and canonical checks. A failed candidate does not discard another verified candidate; each candidate still requires all of its own Circle service and route checks. Base ETH is required for gas when returning wrapped tokens from Base to Arc.

Historical envelope validation checks the stored call identity without applying new-signing expiry or acknowledgement requirements. It is used only for existing-request comparison and cancellation; preparation and signing still enforce acknowledgement and expiry. Unsupported destination domains are detected from finalized source calldata before any forwarding lookup. The `unsupported` status ends local tracking, preserves the source hash, and explicitly does not claim destination delivery or a refund. A matching replacement can then resolve the superseded request without blocking this page indefinitely.
