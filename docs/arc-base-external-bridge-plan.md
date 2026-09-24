# Arc ↔ Base external-wallet bridge plan

Status: proposed design, 24 September 2026. Planning only; no wallet transactions or application implementation.

## Scope and decisions

Build `/bridge` for external wallets, using Circle CrossChainTokenService (CTS/CCTPx). Support eligible existing ERC-20 originals on Arc or Base and their verified Circle ownerless counterparts on the other chain. No Argos bot wallet, custody, backend signing, new Argos bridge contract, swap, or liquidity provision. Token-address lookup works without connecting. Connect only when signing is needed.

Treat the entered address as a token contract. A hexadecimal address contains no chain identity. Probe both configured mainnets; select automatically only when one valid candidate is established and neither lookup is uncertain. If both match, show both and require a choice. If one RPC fails, report uncertainty rather than infer the other chain. Distinguish a token from an EOA, manager, service, or unsupported contract.

Ownerless describes the Circle connection/manager, not the original token's administration. Accept verified protocol-default ownerless connections, with no pending ownership assignment. Recognize the protocol's assignable-owner sentinel rather than assuming zero owner. Permanently renounced states need their own verified classification. Display that Circle infrastructure retains governance/upgrade/pause controls and that original-token restrictions still apply. Unknown or assigned-owner routes are outside the initial product scope.

Default destination to the same external EOA address. A different recipient can be an explicit advanced option with a separate review. Do not assume a smart-account address on one chain is controlled by the same user on the other; initially block unverified smart-account flows until independently tested.

## Existing foundation

The app uses Next.js/React, viem, and Convex. `components/WalletSessionProvider.tsx` authenticates X/Telegram bot wallets; it is not an external-wallet connector. The package manifest has no wagmi/WalletConnect stack. Build a separate external-wallet provider and keep bot authentication distinct.

Previous operator scripts demonstrate ownerless ARGUS registration, remote deployment and transfers, but are not reusable production services. Extract only reviewed ABI/encoding/verification logic. Do not import operator scripts, private manifests, CDP signers, or bot transaction execution into the bridge.

## Page flow

1. Enter a token address; inspect both chains and select an unambiguous source.
2. Show chain, token name/symbol/decimals, full address and explorer link. Metadata is untrusted display text, never identity proof.
3. Resolve the Circle connection and show one state:
   - Verified counterpart ready: amount/recipient/fee form.
   - Source registered but destination absent: continue wrapper setup.
   - Neither registered nor deployed: offer the setup section after compatibility screening.
   - Deployment already pending: resume its status.
   - Known unsupported/owned connection: explain why it is unavailable.
   - Lookup failure/unknown: retry; never offer creation based on a failed read.
4. Connect external wallet, check source-chain account and balance, and request a network switch if needed.
5. Review exact token amount, source/destination contracts, destination address, network gas, Circle forwarding charge, fee currency, quote expiry and expected destination amount.
6. Request token approval only if required, then a separate bridge signature. Recheck after approval and refresh expired fees before asking for the bridge signature.
7. Track source confirmation, attestation, forwarding and verified destination delivery. Provide explorer links and a recoverable operation ID.

No liquidity is required for lock/mint and burn/unlock bridging. The page must explain that obtaining a wrapped token does not create a trading market.

## External-wallet foundation

Use a maintained React connector layer compatible with existing viem: injected EIP-6963 discovery plus WalletConnect for mobile, subject to version and Arc-chain compatibility verification. Allow wallet selection, explicit connection/disconnection, account changes, network switching/addition and mobile return-to-page recovery.

Keep the external account visible at all times. Connecting is not transaction authorization and does not create a bot wallet. Do not require a social login or an unrelated signature. Never store wallet keys or raw signatures. The browser wallet submits every user transaction directly; backend services only discover, quote, verify and monitor.

Capture account, chain, token ID, token addresses, amount, recipient and operation revision in each review. Any change invalidates unsigned steps. Prevent duplicate clicks and simultaneous prompts across tabs. Handle rejection, disconnect, replacement, cancellation and an unknown outcome without silently resubmitting. Never reuse the bot-wallet lease model as authority over an external wallet's nonce.

## Identity and compatibility resolver

Use `(chainId, tokenAddress)` for input identity and Circle `tokenId` for the cross-chain identity. A Circle registry entry is a discovery hint; verify it on chain. Names/symbols are never lookup keys for authorization.

For an original, derive `getOwnerlessTokenId(original)` on its origin chain. For a claimed wrapper, resolve and verify its existing ID and manager through the official service before trusting `tokenId()`. Do not derive a fresh original ID from a wrapped address or register a wrapper again. Reject third-chain origins from this initial two-chain setup flow.

Verify both services, implementations, manager bindings, manager types, original asset, wrapper code/implementation, decimals, ownership and pending ownership, connection permissions, pause/denylist status, transfer limits and route readiness. Keep chain IDs separate from Circle domains. Maintain a reviewed deployment manifest; unexpected upgrades disable new submissions pending review while monitoring already-submitted operations continues.

For newly registered assets, screen original-token behavior. ERC-20 method presence alone is insufficient. Initial support requires reviewed transfer semantics; taxed transfers, rebasing, transfer hooks, blacklist behavior and upgradeable originals require explicit compatibility handling or an unsupported result. Simulation is evidence for the current call, not proof of permanent token safety.

## Wrapper setup section

Explain that the user pays to enable a shared Circle connection, does not become its owner, and does not acquire control over the original token.

The staged flow is:

1. Compatibility and fee review for the origin token.
2. `registerOwnerlessToken(original)` on the origin chain, only if absent.
3. Verify the registration receipt, derived token ID, manager binding/type and ownerless state.
4. Obtain a fresh Circle signed quote for remote deployment.
5. `deployRemoteOwnerlessToken(original, destinationDomain, forwardingParams)` on the origin chain.
6. Track the deployment message through attestation/forwarding, then verify destination code, token/manager bindings and ownership.
7. Show the new counterpart and return to a fresh bridge review. Never automatically move the user's tokens after setup.

Resume each step independently. Recheck for another user's registration/deployment before every submission, and adopt a verified matching deployment if someone else finishes first. A deterministic predicted address is not evidence that a wrapper exists. Registry indexing lag is distinct from deployment failure and route/quote availability.

## Transfer adapter and fees

Use Circle's official CCTPx contracts and signed quote service. Evaluate the current official Bridge Kit CCTPx provider and browser viem adapter before deciding whether to wrap the SDK or implement a small explicit viem adapter. Gate SDK selection on arbitrary token-ID support, new registration/indexing behavior, deployment support, receipt visibility and resumable recovery. Do not assume examples for USDC cover arbitrary ownerless tokens.

The existing flow uses approval to the resolved source TokenManager and `crossChainTransfer(...)` on the service. Verify the spender from the exact reviewed manager mode; do not grant blanket allowance to an arbitrary API-provided address. Default to exact-amount allowance; handle reset-to-zero requirements. Use no arbitrary destination hook calldata in the initial version.

Prefer Circle paid forwarding where a valid quote supports the route. Display its actual fee currency and amount separately from gas. Arc native gas/fee amounts and the ERC-20 USDC interface have different decimal scales; use typed integer units throughout. Base source transactions require ETH. Do not promise destination gas is unnecessary when forwarding is unavailable or manual completion is required.

Validate quote token ID, domains, amount, fee asset, recipient binding where applicable, fee cap and expiry. Locally encode allowlisted calls and simulate them with the actual connected sender; never execute opaque calldata from a discovery response. Repeat balances, allowance, route policy and fee checks immediately before each signature.

## Recovery and completion

Persist a versioned public-operation record before the wallet prompt: operation ID, immutable reviewed intent and pending step. Add returned transaction hashes immediately. Store no keys. Resume locally after refresh and permit recovery by source transaction hash. Optional cross-device history requires address-ownership authentication, but public transaction status does not.

Transfer states: reviewing → approval needed/submitted/confirmed → bridge awaiting signature/submitted → source confirmed → attestation pending → forwarding pending → destination confirmed. Distinguish source revert, user rejection, dropped/replaced transaction, provider outage and destination execution failure.

Never restart the source transfer because attestation or forwarding is slow. For an uncertain wallet response, reconcile sender/nonce/events before enabling another send. Identify messages by source chain, source hash and message index/nonce; a transaction can contain more than one message.

Verify message source/destination domains, service endpoints, token ID, amount and recipient against the reviewed intent. Completion requires the matching canonical destination receipt, protocol consumption and correct mint/unlock delivery evidence, with defined chain-specific finality. Do not require a current recipient balance to equal an old balance plus the transfer: users can spend or receive other funds while bridging.

Offer retry-forwarding/manual receive only after verifying current Circle support, destination caller restrictions and replay protection. Reconcile whether the same message was already consumed first. Preserve monitoring for existing operations even when a policy change disables new bridges. No automatic refund or cancellation promise after a successful source lock/burn.

## Suggested boundaries

- `lib/external-wallet/`: connector/provider, account/network lifecycle and signing adapter.
- `lib/bridge/circle/`: reviewed deployments/ABIs, identity resolver, policy, quote validation, call encoding and receipt/message verification.
- `lib/bridge/operations/`: versioned intent and recovery state machine.
- `app/bridge/` and bridge components: lookup, setup steps, transfer review and status.
- Read-only server endpoints: lookup, Circle quote proxy and status. Fixed allowlisted upstreams, strict input validation, rate limits and no client-supplied RPC URLs.

Avoid importing `lib/otc/runtime.ts` into the browser bridge, since it contains signing and bot-wallet orchestration. Reuse pure utilities only. Serve policy decisions with evidence/block timestamps and refresh them before submission.

## Delivery sequence and acceptance gates

1. Verify official SDK/contracts and generalize read-only ARGUS checks to both original-chain directions. Document exact ownership, quote and retry semantics.
2. Complete external-wallet infrastructure and test connection, mobile, network/account changes and prompt rejection.
3. Build lookup and existing-route bridging with resumable status.
4. Add ownerless registration and remote-deployment setup with race recovery.
5. Adversarial review and mocked/fork tests; then separately authorized small live round trips. Do not infer authorization to transact from this plan.
6. Release existing-route support before opening arbitrary-token creation; enable creation after its separate acceptance gate.

Required tests include an address on both chains; RPC outage versus absence; fake wrapper tokenId; matching-symbol impostors; owner assignment before signing; source registered/destination absent; concurrent creation; stale quote; taxed/rebasing tokens; decimals precision; wrong spender; changed account/network; rejection after approval; unknown submission result; nonce replacement; source/destination reorg; duplicate message delivery; expired attestation; forwarder outage; refresh/cross-tab recovery; spending destination funds before verification; and both Arc-original and Base-original round trips. ARGUS is an existing-route fixture, not evidence that every token is compatible.

## References and remaining verification

- Arc official deployment directory: https://docs.arc.io/arc/references/contract-addresses
- Arc interop overview: https://www.arc.io/blog/introducing-interop-on-arc-crosschain-liquidity-without-the-complexity
- Circle CCTPx provider: https://www.npmjs.com/package/@circle-fin/provider-cctpx
- Circle browser-wallet examples: https://github.com/circlefin/docs-examples
- Prior local registry audit: `reports/circle-cts-registry-20260924.md`.
- Prior verified source snapshot: `.deployment-private/bridge-review-sources/` (research evidence, not a production dependency).

Before implementation, verify pinned SDK versions, browser/mobile Arc support, registration-to-registry timing, fee quoting for newly registered arbitrary IDs, remote deployment in both directions, ownership/permission reads for every accepted manager type, and exact forwarding recovery APIs. Current research supports the design; it is not a live compatibility certification for arbitrary entered tokens.
