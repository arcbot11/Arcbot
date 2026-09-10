# Arc Bot

Product copy follows the [Arc Bot voice guide](docs/VOICE.md): curt, direct, result first.

Arc Bot is a trading and wallet project for Arc mainnet, with Argus market discovery and support planned for other Arc venues.

## Current scope

- Buy and sell tokens against USDC.
- Swap tokens through validated v3/v4 routes and additional supported venues.
- Send native USDC and ERC-20 tokens independently of market liquidity.
- Integrate Argus token creation later.

## Status

The application has been rebranded as Arc Bot. Mainnet research and the implementation plan are in [docs/arc/IMPLEMENTATION.md](docs/arc/IMPLEMENTATION.md). The retained transaction engine and contracts are legacy infrastructure awaiting migration; renamed symbols do not establish Arc deployment compatibility. Existing addresses and chain-4663 transaction semantics have not been converted into verified Argus deployments.

Do not enable inherited workers or deploy contract changes as an Arc service until the network, signing account, deployment registry, and transaction flows pass the implementation plan's acceptance gates. Renamed contract names and typed-data domains require matching new deployments and signatures; they are not upgrades to any existing deployment.

## Website OTC

The new `/otc` market supports Arc USDC listings priced in Base ETH, partial fills, gas reservations, and a 1% buyer fee after the premium. `/wallet` uses Buy, Sell, and Send forms with order history; `/terminal` redirects there. Base actions are website-only. This implementation is not deployed or enabled for real trades. See [OTC setup, settlement, and recovery limits](docs/otc/IMPLEMENTATION.md).

## Local development

Arc-native USDC and ERC-20 send infrastructure now lives in `lib/arc`, with read-only `npm run arc:preflight` and an explicit operator execution command. See [transaction setup and remaining acceptance gates](docs/arc/TRANSACTIONS.md). This path is independent of the inherited application engine; buy/sell/swap routing and UI integration remain in progress.

Arc ERC-20 [dead-address burns](docs/arc/BURNING.md) share the transfer engine. The [API compatibility audit](docs/arc/API-COMPATIBILITY.md) records which providers actually support chain 5042. [Quotes and bounded explorer discovery](docs/arc/ROUTING.md) use RPC validation; they do not enable full swap execution.

Install dependencies with npm install, then use npm run dev. Run npm run typecheck, npm test, and npm run build for validation.

Configure an independent Arc Bot environment using .env.example. Set NEXT_PUBLIC_SITE_URL to the actual published site. Optional NEXT_PUBLIC_ARCBOT_X_URL and NEXT_PUBLIC_ARCBOT_TELEGRAM_URL control social links; empty values hide them. Placeholder .invalid hosts are intentionally non-production defaults.

The Arc Bot logo and social banner are generated from the vector mark in public/arcbot.svg. Regenerate the PNGs and app icons with node scripts/generate-brand-icons.mjs.
