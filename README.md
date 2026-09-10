# Arc Bot

Product copy follows the [Arc Bot voice guide](docs/VOICE.md): curt, direct, result first.

Arc Bot is a trading and wallet project for Arc mainnet, with Argus market discovery and support planned for other Arc venues.

## Current scope

- Buy and sell tokens against USDC.
- Swap tokens through validated v3/v4 routes and additional supported venues.
- Send native USDC and ERC-20 tokens independently of market liquidity.
- X commands and Telegram buttons and slash commands. Token creation is disabled.

## Status

The application has been rebranded as Arc Bot. Mainnet research and the implementation plan are in [docs/arc/IMPLEMENTATION.md](docs/arc/IMPLEMENTATION.md). The retained transaction engine and contracts are legacy infrastructure awaiting migration; renamed symbols do not establish Arc deployment compatibility. Existing addresses and chain-4663 transaction semantics have not been converted into verified Argus deployments.

Do not enable inherited workers or deploy contract changes as an Arc service until the network, signing account, deployment registry, and transaction flows pass the implementation plan's acceptance gates. Renamed contract names and typed-data domains require matching new deployments and signatures; they are not upgrades to any existing deployment.

## Website OTC

The `/otc` market supports Arc USDC listings priced in Base ETH or Base USDC, partial fills, dedicated CDP position escrow, and a 1.5% buyer fee after the premium. Buyers and sellers pay their gas. `/wallet` provides Buy, Sell, Swap, and Send controls with transaction history. Base actions are website-only. See [OTC setup and settlement](docs/otc/IMPLEMENTATION.md).

## Local development

Arc-native USDC and ERC-20 send infrastructure now lives in `lib/arc`, with read-only `npm run arc:preflight` and an explicit operator execution command. See [transaction setup and remaining acceptance gates](docs/arc/TRANSACTIONS.md). This path is independent of the inherited application engine; buy/sell/swap use the Arc route and settlement modules.

Arc ERC-20 [dead-address burns](docs/arc/BURNING.md) share the transfer engine. The [API compatibility audit](docs/arc/API-COMPATIBILITY.md) records which providers actually support chain 5042. [Quotes and bounded explorer discovery](docs/arc/ROUTING.md) use RPC validation; execution uses the Arc trading and transaction modules.

Install dependencies with npm install, then use npm run dev. Run npm run typecheck, npm test, and npm run build for validation.

Configure an independent Arc Bot environment using .env.example. NEXT_PUBLIC_SITE_URL is the OAuth and webhook origin. Public website and X links use the Arc Bot identity in lib/project-config.ts. Telegram links and the default command username use the verified TheArcChainBot identity in lib/project-config.ts. Legacy .invalid endpoints remain in retained modules; they are not Arc RPC fallbacks. See docs/arc/BRANDING-LINK-REVIEW-2026-09-10.md.

The supplied Arc Bot logo and social banner are stored in public/brand. Browser icons are stored in public and app. Preserve the supplied assets; the older vector-generation script is not the source of the current branding.
