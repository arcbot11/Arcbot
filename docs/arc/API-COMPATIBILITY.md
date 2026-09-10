# API compatibility and implementation choices

Checked September 9, 2026. Live results are in `api-compatibility-2026-09-09.json`. Repeat the bounded read-only audit with `npm run arc:apis`. It does not create wallets, sign, broadcast, change webhooks, deploy or post messages. It stores only selected status fields, not credentials or raw account details.

| API | Observed result | Arc implementation rule |
| --- | --- | --- |
| ArgusPad `/api/rpc` | Chain 5042, fresh blocks; prior calls also returned code, logs, receipts and V3/V4 quotes | Usable research/read endpoint. No JSON-RPC batching. Signing/submission still requires explicit RPC/checkpoint configuration; no automatic shared-provider fallback. |
| Arc Explorer REST | Chain 5042, current indexed head and pool records; reported nodeHead remains stale | Use bounded index queries as candidate discovery. Verify pools and quote state on RPC. Never trust nodeHead or incomplete explorer log arrays as authoritative execution evidence. |
| CoinGecko paid API | Credentials work; asset platform `arc` reports chain 5042002 | This platform is testnet, not 5042. Do not use it for Arc-mainnet token resolution or prices. |
| CoinGecko onchain / GeckoTerminal | All 227 network entries inspected, no Arc entry | Do not depend on these services for Arc-mainnet pool discovery or token prices. General reference prices for supported assets are a separate use case. |
| Alchemy | Account API works; inherited configured RPC reports chain 4663. Public supported-chain docs list Arc testnet 5042002 | No verified owned 5042 endpoint. Never use the inherited URL or testnet as an Arc fallback. Historical mainnet changelog mentions do not establish account entitlement or current endpoint access. |
| Coinbase CDP | Account list authentication works | EOA signing for custom EVM chains is documented. Use a sign-only adapter plus the Arc executor if integrated later; Arc signing was not performed in this audit. Do not assume Arc support in managed send, balances, swap or smart-account APIs. |
| OpenRouter | Key endpoint HTTP 200 | Chain independent. Useful for parsing/help, not an authoritative token, price or transaction source. Inference was not invoked. |
| Telegram | `getMe` succeeds; webhook configured | Chain independent transport. Does not establish correct Arc routing or wallet authorization. No messages sent. |
| X | Authenticated user lookup HTTP 200; local replies disabled | Chain independent transport. Keep disabled until enabled intentionally and integrated. Does not validate web OAuth configuration. |
| Convex | Existing public launch query succeeds | Chain independent database/backend. Data and existing functions are not proven Arc-native merely because the query succeeds. |
| Vercel | Project-list endpoint HTTP 200; user endpoint HTTP 404 | Hosting API works for project listing. User endpoint is unavailable to this request. No deployment or hosted Arc runtime was tested. |

## Changes based on these results

- `arc:quote` accepts an optional pool list. When omitted, it requests bounded V3 candidates from the working Arc Explorer API, using exact token addresses. Unsupported factories, malformed or unrelated records, stale data and conflicting pool identities are rejected. All candidates still pass the on-chain factory/liquidity checks in the quote layer. Native/V4 routes can still be supplied explicitly; discovery is not complete V4 or all-market coverage.
- New Arc reads, sends and burns use explicit chain-5042 checks and no legacy RPC fallback. RPC batching is explicitly disabled. The code does not derive a CoinGecko Arc-mainnet network ID from the testnet entry.
- Dead-address burns use the existing recoverable Arc transfer executor, avoiding DEX and market-data dependencies entirely.
- The old resource checker no longer labels legacy-chain wallet balances as Arc. Its broad resource/billing checks are distinct from this Arc compatibility audit.

The retained application wallet/market/launch engine still needs migration. This update aligns the independent Arc engine and its discovery path; it does not make those legacy app features Arc-compatible or enable them. Website-only Base/OTC implementation is now in progress; deployment details and limits are in `docs/otc/IMPLEMENTATION.md`.

References: [Alchemy supported chains](https://www.alchemy.com/docs/reference/node-supported-chains), [Alchemy Arc testnet](https://www.alchemy.com/rpc/arc-testnet), [CDP signing](https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/eip-712-signing), [CoinGecko networks](https://docs.coingecko.com/reference/networks-list), [Arc Explorer](https://www.arcexplorer.org/), [Argus ABI bundle](https://arguspad.io/argus-v4.json).
