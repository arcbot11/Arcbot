# Argos Bot configuration

Public configuration lives in `lib/project-config.ts`. The eight legacy execution/fee/self-buyback flags have been removed from local/example environment files. `lib/retired-features.ts` permanently disables their runtime gates; stale deployed values cannot re-enable them. Internal legacy configuration field names remain for compatibility, but do not read these environment variables. Legacy fee enable/test commands are blocked before their execution logic.

| Requested variable | Current handling |
|---|---|
| `X_OAUTH_CLIENT_ID` | Keep in environment. Nonsecret but not configured locally; must match the actual X application. Can move to public configuration after that app is established. |
| `X_OAUTH_CLIENT_SECRET` | Environment only; secret. |
| `WEB_AUTH_SECRET` | Environment only; shared signing/authentication secret. |
| `X_BOT_USERNAME` | Removed. Fixed to `ArctosBot`, including the authorization script. |
| `NEXT_PUBLIC_ARCBOT_X_URL` | Removed. Fixed to `https://x.com/ArctosBot`. |
| `NEXT_PUBLIC_ARCBOT_TELEGRAM_URL` | Environment for now; Argos Bot Telegram identity has not been provided. |
| `TELEGRAM_BOT_USERNAME` | Removed; no current application reader. The public Telegram URL is the remaining display setting. |
| `ARC_MAINNET_RPC_URL` | Environment; owned provider endpoint not configured, and endpoint URLs may contain API credentials. |
| `ARC_CHECKPOINT_NUMBER` | Environment; trusted mainnet checkpoint not configured. Can become a public constant after verification. |
| `ARC_CHECKPOINT_HASH` | Environment; same verified checkpoint required. |
| `ARC_MAX_GAS` | Removed. Fixed at 1,000,000 gas units. |
| `ARC_MAX_FEE_PER_GAS` | Removed. Fixed at 1,000,000,000,000 native atomic units per gas. |
| `BASE_MAINNET_RPC_URL` | Environment; owned provider endpoint not configured. |
| `BASE_CHECKPOINT_NUMBER` | Environment; trusted Base checkpoint not configured. |
| `BASE_CHECKPOINT_HASH` | Environment; same verified checkpoint required. |
| `BASE_MAX_GAS` | Removed. Fixed at 1,000,000 gas units. |
| `BASE_MAX_FEE_PER_GAS` | Removed. Fixed at 1,000,000,000,000 wei per gas. |
| `BASE_MAX_TOTAL_FEE_WEI` | Removed. Fixed at 1,000,000,000,000,000 wei (0.001 ETH) per transaction. |
| `OTC_SERVICE_SECRET` | Environment only; shared private service secret. |
| `OTC_WORKER_URL` | Removed. Fixed production site plus `/api/otc/worker`: `https://www.arcchainbot.io/api/otc/worker`. Website-origin/old worker environment values cannot redirect it. |
| `OTC_BASE_PAYMENT_ROUTER` | Legacy positions only; deployed Base payment contract address. New CDP escrow positions do not use it. |
| `OTC_BASE_ROUTER_CODE_HASH` | Legacy positions only; must match their payment contract runtime bytecode. |
| `OTC_FEE_WALLET` | Legacy payment contracts only. New escrow positions use the pinned @arctos_arc address in lib/project-config.ts and a 1.5% service fee. |

The production worker URL is shared by website transfer validation and Convex scheduler calls. Change the public configuration for an isolated staging deployment; it no longer has an environment override. `NEXT_PUBLIC_SITE_URL` remains the website/OAuth/CSRF origin setting and should match the actual deployed website.

Gas limits are the previous code defaults, now pinned in the production environment loaders. Explicit low-level configuration objects remain available for tests and simulations. Environment overrides no longer change these limits. New escrow purchases reserve five Base transaction gas allowances: two in the buyer wallet and three deposited into escrow. Spendable excess returns to the buyer; residual gas credits remain attributed to their owner. See ../otc/IMPLEMENTATION.md.

Launches remain blocked. Ordinary Arc burns and ETH/USDC OTC settlement retain their verification and reservation behavior. No backend settings were deployed or credentials revoked.
