# Standalone CTS Bridge API: Circle launch handoff

Status: locally built and tested; proposed domain is not deployed by this work.
This is a separate service from the CRA lookup API on www.argosbot.io.

## What Circle reviews

Circle's [listing instructions](https://developers.circle.com/agent-stack/agent-marketplace/get-listed)
currently require manual approval. Publish a working payable API and its OpenAPI
spec, then submit the endpoint, payout address and description through the
[intake form](https://forms.gle/7YFzvdmMcn1JH5tF6). Circle screens the payout wallet
and checks endpoint availability. Approved services enter the catalog and Discovery API.

The [API readiness score](https://agents.circle.com/sell) is a preparation tool.
Neither a score nor a marketplace listing should be described as certification
of our bridge implementation or of arbitrary tokens. Do not claim Circle approval
until an actual listing has been approved.

## Prepared listing text

Name: **Argos Bot CTS Bridge API**

Description: Discover and use ownerless Arc and Base token connections through
Circle's Crosschain Token Standard (CTS), CrossChainTokenService and CCTP.
Look up original and wrapped addresses, supply and verification evidence; create
missing ownerless connections and coordinate transfers in either direction.
External wallets sign every blockchain transaction. Resumable jobs track approvals,
confirmation, delivery and finality.

Proposed OpenAPI: `https://bridge-api.argosbot.io/openapi.json`

Documentation: `https://bridge-api.argosbot.io/llms.txt`

Discovery: `https://bridge-api.argosbot.io/.well-known/x402`

Paid operations:

- `GET /v1/lookup`: 0.005 USDC; token is a required query input and chain is optional.
- `POST /v1/jobs`: 0.01 USDC; requires the fixed intent and external-wallet
  authorization obtained through `/v1/authorization`. Subsequent job calls are included.

Payment rail: Circle Gateway, USDC on Arc. Bridging supports Arc and Base; these
are distinct from the payment network. Network gas and forwarding fees are separate.

Payout: `0x60E4834783dA4D4D7ad1C81fc48221840192152C`

Category: Infrastructure. Tags: bridge, cross-chain, arc, base, circle, cts, external-wallet.

Examples are schema illustrations, not executable authorizations. Agents must
obtain fresh typed data and sign using their own wallet. No operator wallet keys
are required by this service.

## Remaining launch work

1. Select a long-running Node/container host, or adapt the service and polling
   worker for a separate Vercel/Convex deployment. The existing interval worker
   cannot simply be copied into a serverless route.
2. Provision the dedicated secrets and Convex functions described in
   `services/cts-bridge/README.md`. Preserve existing website and CRA configuration.
3. Configure HTTPS and the proposed subdomain; test public OpenAPI, discovery,
   unpaid 402 responses and configuration health. Health alone does not prove RPC
   or settlement readiness.
4. Run explicitly authorized paid and external-wallet integration tests. Include
   missing connection, existing connection, both directions, and recovery after
   interrupted payment or transaction responses. Mocked tests do not replace these.
5. Run Circle's readiness score against the public OpenAPI URL. Address its actual
   findings, then submit the intake form with the seller's real contact details.

No marketplace submission or paid/on-chain test has been performed in this work.

After deployment, run the read-only public check:

```powershell
node --use-system-ca scripts/check-agent-bridge-public.mjs https://bridge-api.argosbot.io
```

This checks metadata, configuration and the unpaid challenge. It never pays or signs.
