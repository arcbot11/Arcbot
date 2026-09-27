# Standalone CTS Bridge API: Circle launch handoff

Status: deployed to production; submission prepared for user review on 2026-09-27.
No further testing requested. No Circle intake submission has been sent.
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

OpenAPI: `https://bridge-api.argosbot.io/openapi.json`

Documentation: `https://bridge-api.argosbot.io/llms.txt`

Discovery: `https://bridge-api.argosbot.io/.well-known/x402`

Paid operations:

- `GET /v1/lookup`: 0.005 USDC; token is a required query input and chain is optional.
- `POST /v1/jobs`: 0.01 USDC; requires the fixed intent and external-wallet
  authorization obtained through `/v1/authorization`. Subsequent job calls are included.

Payment choices: standard endpoints accept Arc Gateway or Base direct USDC; `/direct` endpoints accept Arc or Base direct USDC at 0.007 per lookup and 0.012 per job. Bridging supports Arc and Base; these
are distinct from the payment network. Network gas and forwarding fees are separate.

Payout: `0x60E4834783dA4D4D7ad1C81fc48221840192152C`

Category: Infrastructure. Tags: bridge, cross-chain, arc, base, circle, cts, external-wallet.

Examples are schema illustrations, not executable authorizations. Agents must
obtain fresh typed data and sign using their own wallet. No operator wallet keys
are required by this service.

## Submission handoff

Service URL: `https://bridge-api.argosbot.io`

Payable lookup endpoint: `https://bridge-api.argosbot.io/v1/lookup`

Website: `https://www.argosbot.io`

Use clean endpoint URLs. Token addresses belong in query inputs, not the service
identity; the service is not ARGUS-only. Use the OpenAPI document to describe all
four priced operations and their inputs.

The official intake form could not be inspected without Google sign-in in this
environment. Exact additional form fields and seller contact details still need
to be supplied in the signed-in form. Do not invent contact information.

Circle documents manual review, payout-wallet sanctions screening, catalog and
Discovery API inclusion after approval, and ongoing endpoint health checks. No
review turnaround or certification is promised here.

## Existing validation record (not a request for further tests)

Production public metadata and unpaid payment challenges were checked previously.
Four Arc direct-payment lookups and one paid setup-only job settled successfully
(0.040 USDC total); scenarios included original and wrapped ARGUS and absent
connections. Existing-connection setup completed without a bridge transaction.
Base-to-Arc approval preparation passed five consecutive live calls after the RPC
retry and batching fix. No bridge transactions were submitted in those API tests.
Base payment settlement and a complete transfer through this new API were not
tested. Do not describe those as validated in a submission.
