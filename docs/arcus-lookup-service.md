# Argos Bot CTS Bridge Lookup on Arcus

Separate lookup-only service live at `https://arcus-api.argosbot.io` as of 2026-09-27.
Initial production deployment: `https://arcbot-ev98fsnp6-clawhammer.vercel.app`.
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

The existing Arcus merchant listing is separate from this deployment. Editing it
can require a wallet-signed message. Metadata updates here do not edit that listing.
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

## MCP and metadata improvements

`POST https://arcus-api.argosbot.io/mcp` provides stateless Streamable HTTP MCP
(2025-06-18; also accepts 2025-03-26). Send `Content-Type: application/json`,
`Accept: application/json, text/event-stream`, and the negotiated
`MCP-Protocol-Version` on subsequent calls. No session ID or SSE stream is needed.
GET returns 405. Browser origins are restricted to the API and Argos website;
server clients without an Origin header are supported.

Initialize, ping, tools/list, resources/list and resources/read are free.
Tool `lookup_ownerless_bridge` accepts the same strict token/chain/finality inputs
as REST. No default token is installed. Lookups cost 0.007 Arc USDC, including a
valid result that no bridge exists. No A2A service is implemented or advertised.

Example unpaid request (replace the placeholder token):

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lookup_ownerless_bridge","arguments":{"token":"0x...","chain":"base"}}}
```

An x402-capable MCP client receives the payment challenge in the tool result's
`structuredContent` and JSON text content, with `isError: true`. The client then
repeats the request with its payment object in `params._meta["x402/payment"]`.
The response carries settlement evidence in `result._meta["x402/payment-response"]`.
Do not put an MCP payment in an HTTP Payment-Signature header. Tool errors retain
the underlying HTTP status in `result._meta["argos/http-status"]`.

The adapter invokes the canonical REST handler and the same `arcus-lookup-v1`
purchase scope, durable journal, input binding and uncertain-settlement rules.
Retry identical arguments with the SAME payment after interruption; do not sign a
fresh payment while an earlier one is uncertain. Generic MCP clients can discover
the service but need x402 support to purchase results.

The registration now advertises MCP and OASF v0.8.0 data quality/transformation
skills with smart-contract and DeFi domains. `supportedTrust` remains empty:
there is no claimed validator, reputation guarantee or safety certification.
The existing logo, registry ID and payment wallet are retained. Browser visitors
get a readable landing page; `/llms.txt` stays plain text for agents.

After deployment, check free initialize/tools/list/resources calls and an unpaid
challenge. Request an 8004scan metadata refresh and endpoint health check using
its current UI/authentication requirements. A hosted update does not guarantee
immediate reindexing; confirm the public agent record has the new MCP service and
registration entry before calling it refreshed. Scores and badges are controlled
by the indexer. No new on-chain registration is required.

On 2026-09-27, the public UI's `POST /api/v1/agents/5042/304/health-check`
returned 401 (`Authentication required`) without an authenticated session.
Complete that check through the signed-in 8004scan UI; do not interpret a hosted
metadata update as a completed indexer health check.

MCP/metadata release deployed on 2026-09-27 to
`https://arcbot-hxv765z3v-clawhammer.vercel.app` and the existing production domains.
Validation: 12 targeted tests, TypeScript and production build passed; 13 public
unpaid checks passed. No wallet actions or paid calls were performed. The public
8004scan record still showed only Web and an empty cached registrations list
after release, while the hosted metadata correctly exposed MCP/OASF and agent 304.
