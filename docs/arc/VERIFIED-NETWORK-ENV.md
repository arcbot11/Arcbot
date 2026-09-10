# Network environment verification — 2026-09-10

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

Alchemy's [public chain list](https://www.alchemy.com/docs/reference/node-supported-chains) lists Arc Testnet only. Its [November 6, 2025 changelog](https://www.alchemy.com/docs/changelog/2025/11/6) mentions Arc Mainnet node upgrades, so absence from the public list is not proof that Alchemy has no mainnet infrastructure. An account-provided mainnet endpoint is needed to resolve availability for Arc Bot.

Arcscan's [detailed RPC documentation](https://docs.arc-scan.org/docs/rpc) explicitly advertises mainnet 5042 and `eth_sendRawTransaction` forwarding. Connection resets in our probes do not establish a global outage or a read-only endpoint. It refuses `debug_*`, which means the current V4 native-output verification path needs another provider or a separately reviewed verification implementation even if ordinary RPC calls work. Argus's integration JSON and frontend default chain configuration both advertise this Arcscan endpoint.

## OTC deployment requirements

No Arc Bot OTC deployment record was found locally. `OTC_BASE_PAYMENT_ROUTER` must be the deployed Base address of the updated `contracts/src/ArcBotOtcPayments.sol`, supporting ETH and USDC. `OTC_BASE_ROUTER_CODE_HASH` must be Keccak-256 of its deployed runtime bytecode fetched through `eth_getCode`, including its immutable fee recipient. A compiled artifact alone cannot provide the final configured pair.

Deployment still requires the dedicated fee recipient and a funded deployment account. No deployment was performed. Local `.env.local` was not modified by this verification.

Sources: [Base RPC reference](https://docs.base.org/base-chain/api-reference/rpc-overview), [Argus integration JSON](https://arguspad.io/argus-v4.json), and direct RPC observations above.
