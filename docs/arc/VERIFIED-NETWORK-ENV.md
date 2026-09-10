# Network environment verification — 2026-09-10

## Confirmed live transfer — 14:32 UTC

With explicit user authorization, the fixed admin-only `arcTransferTest:run` action sent exactly 1 native Arc USDC from @ArctosBot to @Arctos_Arc through Arcscan using the existing shared transaction runtime. The runtime persisted the reservation and signed bytes before broadcasting, verified the canonical finalized receipt, recorded completion, and released the wallet lock. The action has a fixed durable request ID so repeating it reconciles the same transfer instead of sending another dollar.

Transaction: `0xbff636d8c59287db979d2e2cd32966d81a54e2259822e9fb22abd172247ac791`, block 20153076, success. Gas: 21,000 units; actual fee: 0.00084 USDC. Resulting balances: sender 44.99916 USDC, recipient 1 USDC. Argus independently returned the successful receipt and transaction details; its provider independence from Arcscan is unknown. The Convex wallet reservation has no active transaction and no remaining holds. Evidence: `one-usdc-transfer-2026-09-10.json`.

This establishes live CDP signing, Arcscan broadcast, and finalized native-USDC settlement from Convex's Node runtime. It does not establish Vercel connectivity or successful token swaps. The RPC override is scoped to the fixed test action; production environment configuration was not changed.

## Follow-up: Arcscan reachable from Convex

The funded-wallet probe at 14:25 UTC supersedes the local-only connectivity conclusion below. From the deployed Convex internal action, `https://rpc.arc-scan.org` returned chain 5042, fresh latest/finalized blocks (0–1 seconds old), the expected historical checkpoint hash, and the wallet's 46 USDC. A simulated $1 transfer to the second Arctos Bot wallet succeeded through both native and ERC-20 interfaces; approval simulation, nonce, fee history, fee pricing and gas estimation also worked. Native transfer estimated 21,000 gas; ERC-20 transfer estimated 74,826 gas. These are simulations, not completed transfers.

The empty `eth_sendRawTransaction` probe returned -32602 (transaction decoding error), demonstrating that the method is recognized, rather than rejected as unsupported. No valid signed transaction was submitted, so successful broadcast and settlement remain unverified. Local Node connections still reset; public DNS agrees with local DNS. The precise local connectivity cause is unknown.

Argus continues to support reads/simulations but refuses broadcasts. Arcexplorer's RPC remains about ten days behind and incorrectly reports the newly funded wallet as empty. Arcscan rejects `debug_traceCall` by namespace policy; the existing V4 native-output trace requirement remains a separate limitation.

Arcscan is now a viable candidate for the server RPC setting. Website transaction execution currently runs in Vercel, so Vercel connectivity still needs verification; Convex success does not establish Vercel success. No environment settings were changed. Evidence: `rpc-convex-2026-09-10.json` and `rpc-funded-wallet-2026-09-10.json`. The repeatable Convex diagnostic is internal/admin-only and has fixed endpoints, fixed calls, and no signing code.

Read-only RPC checks used Node with `--use-system-ca`. TLS verification remained enabled. Broadcast-method probes supplied only invalid empty bytes (`0x`); no signed transaction was supplied or funds moved.

## Resolved values

```dotenv
ARC_CHECKPOINT_NUMBER=18456078
ARC_CHECKPOINT_HASH=0xdd5a48032af8571d6a262f39e5cde7e6b91625aaa4330289f03e5a346dd3c358
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BASE_CHECKPOINT_NUMBER=51125152
BASE_CHECKPOINT_HASH=0x98869df4d2f4c78f2f712985f700c2a4192e9befe6d6fd67624c2d89a62b0b66
```

Base chain ID 8453 and the same finalized block/hash were returned by both `https://mainnet.base.org` and `https://base-rpc.publicnode.com`. A subsequent numbered-block request on mainnet.base.org matched. Publicnode subsequently required a personal token for the historical lookup; it is not an automatic fallback. The public Base RPC is suitable for initial validation; production capacity still needs checking with an owned provider.

Arc chain ID 5042 and block 18456078/hash matched between `https://arcexplorer.org/rpc` and `https://arguspad.io/api/rpc`. These are two agreeing public surfaces, not proof that their upstream operators are independent. The historical checkpoint does not need to be current; the configured RPC must separately pass fresh-head validation.

## Unresolved Arc transaction endpoint

| Endpoint | Observed result |
| --- | --- |
| `https://arguspad.io/api/rpc` | Fresh latest block 20133347 with age 0 seconds at the probe. Rejects `eth_sendRawTransaction` with -32601, method not supported. Read-only candidate, not a transaction endpoint. |
| `https://arcexplorer.org/rpc` | Latest/finalized remained at block 18456078, approximately 9.9 days old. Recognizes the broadcast method but fails application head-freshness requirements. |
| `https://rpc.arc-scan.org` | Connection reset. This endpoint is advertised in Argus's current integration JSON. |
| `https://arc.argus.vip/api/arc-rpc` | Latest-block query reports Arc RPC temporarily unavailable. |
| `https://5042.rpc.thirdweb.com/` | Block and broadcast-method probes return provider internal errors. |

Leave `ARC_MAINNET_RPC_URL` unresolved until a fresh, broadcast-capable mainnet endpoint is available. Do not substitute a testnet endpoint or relax freshness checks.

## Alchemy account check — September 10 follow-up

Actual authenticated requests using the current local `ALCHEMY_ADMIN_API_ACCESS_KEY` returned:

- `GET /v1/usage/summary`: HTTP 200. The credential works for usage reads.
- `GET /v1/chains`: HTTP 403, `Insufficient permissions`.
- `GET /v1/apps`: HTTP 403, `Insufficient permissions`.

No Alchemy app RPC URL or separate Alchemy app API key is configured in the local environment. Consequently, this check cannot establish this account's Arc mainnet entitlement or test an authenticated Arc mainnet RPC. The admin access key is not an app RPC key. No app, permissions, or environment settings were changed.

Alchemy's [public chain list](https://www.alchemy.com/docs/reference/node-supported-chains) lists Arc Testnet only. Its [November 6, 2025 changelog](https://www.alchemy.com/docs/changelog/2025/11/6) mentions Arc Mainnet node upgrades, so absence from the public list is not proof that Alchemy has no mainnet infrastructure. An account-provided mainnet endpoint is needed to resolve availability for Arctos Bot.

Arcscan's [detailed RPC documentation](https://docs.arc-scan.org/docs/rpc) explicitly advertises mainnet 5042 and `eth_sendRawTransaction` forwarding. Connection resets in our probes do not establish a global outage or a read-only endpoint. It refuses `debug_*`, which means the current V4 native-output verification path needs another provider or a separately reviewed verification implementation even if ordinary RPC calls work. Argus's integration JSON and frontend default chain configuration both advertise this Arcscan endpoint.

## OTC deployment requirements

No Arctos Bot OTC deployment record was found locally. `OTC_BASE_PAYMENT_ROUTER` must be the deployed Base address of the updated `contracts/src/ArcBotOtcPayments.sol`, supporting ETH and USDC. `OTC_BASE_ROUTER_CODE_HASH` must be Keccak-256 of its deployed runtime bytecode fetched through `eth_getCode`, including its immutable fee recipient. A compiled artifact alone cannot provide the final configured pair.

Deployment still requires the dedicated fee recipient and a funded deployment account. No deployment was performed. Local `.env.local` was not modified by this verification.

Sources: [Base RPC reference](https://docs.base.org/base-chain/api-reference/rpc-overview), [Argus integration JSON](https://arguspad.io/argus-v4.json), and direct RPC observations above.
