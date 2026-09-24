# Arc / Base bridge

`/bridge` offers Connected Wallet (injected EIP-6963 wallets or WalletConnect) and authenticated Argos Bot Wallet modes. Connected-wallet requests remain browser-signed; bot-wallet confirmations use the existing durable server signing runtime. Setup and transfers require separate explicit confirmations. No live transaction is part of implementation testing.

## Configuration

- `BRIDGE_ARC_RPC_URL`, `BRIDGE_BASE_RPC_URL`: HTTPS RPC endpoints. Use dedicated production endpoints; public endpoints are rate limited. Chain ID, head freshness and canonical blocks are checked.
- `BRIDGE_QUOTE_SECRET`: random server-only secret of at least 32 characters. Falls back to the existing `WEB_AUTH_SECRET`. Used to bind reviews to calldata, recipient, route, nonce, fees and expiry.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Reown project with the deployed site origin allowed. Without it, injected wallets still work; WalletConnect is disabled.
- `BRIDGE_REVIEWED_ORIGINALS`: optional JSON array of `{chain,token,hash}` entries. Only add an original after reviewing deposit AND withdrawal behavior, proxy upgrades, transfer taxes, rebasing, restrictions and token-admin risks. A runtime hash alone does not prove a proxy implementation. Do not admit mutable proxies under this policy.

Initial admitted original: Arc ARGUS, exact address and code hash in `lib/bridge/policy.ts`. Other ERC20 addresses can be discovered, but setup and transfers remain disabled until reviewed. Both directions of an admitted route are supported. Contract wallets, delegated EOAs, custom recipients and arbitrary hooks are intentionally unavailable in this version.

## Operations and recovery

Circle service, delegates, manager and wrapper code are pinned. An upgrade or ownership change blocks new preparations. Re-review pins rather than bypassing the check. The ownerless sentinel is not the zero address. Original token controls and Circle governance remain relevant.

Reviews simulate the exact call, use exact manager allowances (zero reset when required), check pending nonce, quote expiry, token funds and gas reserve. Registration, remote wrapper deployment, approval and transfer are separate transactions. Paid Circle forwarding is requested for deployment and transfer. Arc gas is 18-decimal native USDC; Base gas is ETH. Approval review precedes the forwarding quote and is not a promise of a later fee.

Browser history is schema-validated and stored immediately before opening a wallet prompt, after local identity and expiry checks. Preflight failures never leave a false pending request. Cross-tab history mutations share the signing lock; imports are deduplicated and retain concurrently created entries. An interrupted or uncertain submission blocks resubmission. Recover using the source hash; recovery must match the saved calldata, sender, nonce and value. If a wallet request never broadcast and no rejection was returned, inspect the wallet and chain before resolving local history; do not casually clear storage. Cross-tab signing requires Web Locks. Browser history is not an account-wide distributed nonce lock.

Source and destination RPC chain IDs are verified. Source receipt finality and canonicality precede forwarding checks. Approvals require an exact allowance event; registration requires the ownerless token-ID event. Circle's message is bound to the source `MessageSent` payload; destination `MessageReceived` and CTS execution events prove completion. Current wallet balances are not delivery evidence. Status checks are read-only and user-triggered. Delayed forwarding must never lead to a repeated source transfer. Manual destination redemption is not exposed yet; preserve the source hash for support if Circle forwarding fails.

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
