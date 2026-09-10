# Arc mainnet RPC selection

Verified September 10, 2026 from the local host and Convex. The supplied Infura endpoint is stored only in server environment variables; report URLs omit its project key.

| Operation | Primary | Backup order | Observations |
| --- | --- | --- | --- |
| Balances, nonce, code, blocks, fees, logs, receipts | Arcscan | Infura, Argus | Infura passed local reads and fresh mainnet/checkpoint checks. Convex checks also passed for blocks, balances, nonce and fees. |
| Contract reads, approvals and transfer simulations (`eth_call`), trading quotes | Arcscan | Argus, Infura | Infura consistently returned `project ID exceeded quota`, including when tested sequentially from Convex. Argus serves these calls. |
| Gas estimation | Arcscan | Infura, Argus | Native and ERC-20 estimates worked on Infura. |
| Signed transaction submission | Arcscan | Infura only if Arcscan fails validation **before** submission | Arcscan completed our prior $1 transfer. Infura recognized the method and rejected malformed bytes; no valid transaction was sent through Infura. |
| Debug traces | No verified provider | None currently usable | Both Infura trace methods were unavailable; Arcscan refuses the namespace, and Argus does not support it. Existing trace-dependent native-output V4 paths still fail closed. |

Arcexplorer RPC is excluded: its head is about ten days old and misses the funded wallets. A provider recognizing chain ID 5042 alone is insufficient.

## Implemented behavior

`lib/arc/transport.ts` is shared by the Arc operator RPC adapter and the website/social/OTC transaction runtime's Arc client. Base transport is unchanged. Unrelated catalog/indexer integrations retain their existing endpoints.

Each selected provider must independently pass chain ID, trusted checkpoint hash/number, and fresh-head validation. Valid results are cached for at most five seconds per transport and never beyond the allowed head age. Reads fail over on transport failures, HTTP capacity/auth/server failures, quota errors, and unsupported methods. Contract reverts and other request rejections are not treated as outages. Missing receipts remain missing; they are not proof a transaction is safe to replace. Existing canonical block and finality checks remain active.

Automatic transport retry is disabled. Once a broadcast has been attempted, no second endpoint is tried in that request, even after timeout or quota rejection. The runtime retains its existing signed bytes/hash and reservation. A subsequent reconciliation checks receipts and nonce before any rebroadcast of the **same** signed transaction; no new transfer or nonce is created by failover. Read-only Argus is excluded from every broadcast candidate list.

## Configuration and deployment

- `ARC_MAINNET_RPC_URL`: Arcscan, configured locally and in Convex.
- `ARC_INFURA_RPC_URL`: supplied private Infura endpoint, configured locally and in Convex.
- Argus read-only fallback is explicit in Arc configuration; no testnet or inherited legacy endpoints are used.
- Convex code is deployed. Website code still requires a Vercel deployment and the same two server-only variables there; Vercel connectivity has not been verified.
- Provider changes do not alter wallet addresses, custody, or balances. No new funds were moved during these tests.

## Evidence

- `rpc-infura-2026-09-10.json`: local capability matrix with redacted endpoint.
- `rpc-provider-comparison-convex-2026-09-10.json`: sequential checks from Convex.
- Eight offline failover tests cover quota, wrong chain/checkpoint, stale head, deterministic revert, ambiguous broadcast, pre-submission backup, and read-only exclusion.
- Sixty Arc transaction tests and 36 OTC settlement tests passed.
- Opt-in live test read chain 5042, canonical USDC decimals, the previous finalized transfer receipt, and recipient balance through the new transport. Vitest workers on this Windows host require `NODE_USE_SYSTEM_CA=1`; the initial live attempt failed until that certificate setting was propagated.

Resolve the Infura project's `eth_call` quota before promoting it to primary. This investigation cannot determine the project's plan or quota settings, or establish that these public surfaces have independent upstream infrastructure.
