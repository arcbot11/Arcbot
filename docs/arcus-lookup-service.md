# Argos Bot CTS Bridge Lookup on Arcus

Separate lookup-only service live at `https://arcus-api.argosbot.io` as of 2026-09-27.
Production deployment: `https://arcbot-ev98fsnp6-clawhammer.vercel.app`.
Hostname ownership and DNS verified. Public OpenAPI/discovery returned 200,
browser preflight 204, unpaid lookup 402 with 7000 atomic Arc USDC, and jobs 404.
No payment was signed or settled during these release checks.
It reuses the CRA lookup engine, response schema and verified-pair cache.
No registration, wrapper creation, bridge jobs or operator wallets are exposed.

## Merchant listing

Name: Argos Bot CTS Bridge Lookup

By: Argos Bot

Description: Look up any Arc or Base token’s ownerless bridge using Circle’s Crosschain Token Standard (CTS), CrossChainTokenService and CCTP. Get original and wrapped token addresses, wrapped supply, contracts and verification status.

Website and documentation: `https://arcus-api.argosbot.io/llms.txt`

Endpoint: `GET https://arcus-api.argosbot.io/v1/lookup`

Price: 0.007 USDC (7000 atomic units), fixed per lookup. This matches the existing direct lookup price.

Parameters:
- `token`: required EVM token address; no default token.
- `chain`: optional `arc` or `base`; selects the token chain, not payment chain.
- `finality`: optional `latest` or `finalized`.

Payout: `0x60E4834783dA4D4D7ad1C81fc48221840192152C`

Payment network: Arc mainnet, `eip155:5042`.

Payment asset: `0x3600000000000000000000000000000000000000`, USDC, 6 decimals.

Facilitator: `https://facilitator.arcusnetwork.co`.

OpenAPI: `https://arcus-api.argosbot.io/openapi.json`

Discovery: `https://arcus-api.argosbot.io/.well-known/x402`

## Deployment

Add `arcus-api.argosbot.io` to the existing arcbot Vercel project and configure
the DNS record Vercel specifies. Deploy the source changes. No Convex schema or
function changes are needed: existing bridgeApi functions and secrets are reused.
Required server configuration: `BRIDGE_API_SERVICE_SECRET` and
`NEXT_PUBLIC_CONVEX_URL`. Public commercial settings are versioned in code.

The hostname only exposes lookup, documentation, discovery and configuration
health. Internal adapter routes are blocked on the main website and preview hosts.
Cross-origin GET/OPTIONS and x402 headers support the Arcus merchant playground.
Health reports configuration only, not facilitator, settlement or RPC readiness.

The listing must be created separately at the Arcus merchant dashboard. That
requires a wallet-signed message; it has not been submitted by this implementation.
Arcus listings are self-serve, not certification or endorsement.

## Payments and recovery

Only direct Arc USDC is offered here. CRA settlement, Gateway and Base payment
choices remain on the existing services. Both token lookup chains are supported.
Input validation happens before payment verification. Failed/unavailable lookups
are not submitted for settlement. A genuine missing bridge is a paid result.

The shared durable journal binds payment nonces to an Arcus-specific input scope.
It prevents an authorization being used for a second lookup or replayed across
the CRA and Arcus services. Signed authorizations are never persisted.
Successful identical retries return the stored result and receipt without paying
again. Settling/uncertain attempts never resubmit settlement automatically; retain
the proof and request ID for operator reconciliation. Automated direct receipt
reconciliation is not included in this lookup service.

No paid end-to-end Arcus validation or wallet activity was performed during the build.
# ERC-8004 identity

The lookup service is registered as agent **304** on Arc mainnet (chain 5042),
registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
The identity owner is the CDP revenue wallet
`0x60E4834783dA4D4D7ad1C81fc48221840192152C`.
Registration transaction:
`0xf36676aa290c57496fed34f223f0b94f2796ab3807080a635b43841a4ababd44`.

Public metadata and domain verification:
`https://arcus-api.argosbot.io/.well-known/agent-registration.json`.
The registry tokenURI points to this document. It advertises the lookup API,
documentation, Argos logo and x402 support, without claiming independent certification.
The Arc registry implementation matched the canonical Base registry implementation
at registration time; the registry remains upgradeable by its administrator.

Arcus merchant badge linking is separate from registration. Its current self-service
merchant editor exposes no identity-link field; Arcus must confirm/link the ID.
