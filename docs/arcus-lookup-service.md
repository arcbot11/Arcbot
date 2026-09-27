# Argos Bot CTS Bridge Lookup on Arcus

Separate lookup-only service prepared for `https://arcus-api.argosbot.io`.
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
