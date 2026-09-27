# Argos Bot CTS Bridge Lookup deployment

Public settings are hardcoded in lib/bridge-api/config.ts: payments enabled, Circle Gateway, 0.005 USDC per lookup, https://www.argosbot.io and revenue recipient 0x60E4834783dA4D4D7ad1C81fc48221840192152C. No public BRIDGE_API environment settings are required or consulted.

Keep BRIDGE_API_SERVICE_SECRET private and identical in Vercel Production and its Convex backend. Preserve the existing NEXT_PUBLIC_CONVEX_URL and optional RPC credentials. Never commit secrets. Do not provision previews with the production API secret.

Deploy the reviewed website without promoting domains, deploy matching Convex functions, then promote the website. Verify the backend URL against Vercel Production before deploying Convex; deployment labels alone do not identify which backend the live website uses.

Check health (configured/enabled), discovery, OpenAPI, and unpaid lookup (402 with 5000 atomic Arc USDC units to the recipient above). Paid settlement/recovery requires an authorized test; a challenge alone does not prove successful payment. CRA marketplace submission is separate from deploying this endpoint.

To disable new purchases, change LOOKUP_PAYMENTS_ENABLED to false and redeploy. Keep the secret and persistence for existing paid recovery. Never rerun revenue wallet creation or old operator jobs during deployment.

## Direct-payment option (live and tested)

Gateway remains the default at 0.005 USDC. The new route
`/api/v1/bridge/lookup/direct` is priced at 0.007 USDC and uses CRA's direct
EIP-3009 facilitator. Public settings stay in source. `DIRECT_LOOKUP_ENABLED`
is true following registration and release validation. Do not
replace the Gateway route or change its recovery keys.

Registration completed with explicit user authorization at **2026-09-27
00:55:50 UTC**: CRA independently reported the existing revenue wallet as
`registered: true`, and submission returned `active: true`. Allowance was 200/day
with 0 used. Only the CRA ownership message was signed; no blockchain transaction,
transfer or approval was submitted. The signature and evidence are retained in
the private registration journal. Step 1 below is complete; do not sign again
unless fresh status shows registration is missing.

Step 2 completed on 2026-09-27: production commit `50a8b101067b3b0f1ea12dac7ba188e1a2afc865`
is live through the GitHub/Vercel integration. An additional isolated production
build succeeded but was not promoted because the identical commit was already
live. No Convex deployment or secret changes were needed. All 60 targeted tests
and typechecking passed. Live challenges advertise 0.005 USDC Gateway and 0.007
USDC direct with the expected Arc USDC domain and recipient.

One authorized direct lookup from Odysseus returned HTTP 200 with the verified
ARGUS Arc-to-Base pair. Replaying the same signed proof returned HTTP 200,
`recovered: true`, the same request ID and the same settlement receipt. Finalized
Arc transaction `0x8cc1f46d10b0093d4d9b03e24e661dc58e882488caa2fc3269034bc490590e8a`
contains exactly one matching 7000-atomic-USDC transfer and authorization-used
event. Odysseus's balance decreased by exactly 0.007 USDC across both requests;
the facilitator paid gas. No arguswallet action was performed. Signed evidence
is retained privately. CRA marketplace submission completed on 2026-09-27; both payment routes are listed and searchable.

Read-only checks on 2026-09-26 found:
- CRA facilitator available on Arc, paying settlement gas.
- Allowance: 200 settlements per seller/day, 400 shared/day; gas-reserve limits
  can reduce availability further. These are capacity limits, not guarantees.
- Revenue wallet `0x60E4834783dA4D4D7ad1C81fc48221840192152C` is not registered.
- CRA's direct USDC signing domain is **USDC**, version **2**. The Gateway domain
  is different; signatures cannot be substituted between payment methods.
- CRA's comparable FX lookup charges 0.001 via Gateway and 0.003 direct. Our
  proposed 0.002 premium is service margin, not a published CRA facilitator fee.
  No separate fee schedule was found. Actual seller charges/SLA need confirmation
  before relying on subsidies at scale.

Release checklist (all steps complete):
1. With explicit authorization, sign CRA's registration message using the
   existing CDP revenue account `argos-bridge-api-revenue` (not arguswallet or
   Odysseus). It is a personal-message signature, not a transfer or approval.
   POST `{payTo, issuedAt, signature}` to
   `https://api.cra-agent.tech/v1/facilitator/sellers`. Verify the returned account
   and the subsequent read-only seller-status endpoint. Never print the signature.
2. Review deployment changes, enable `DIRECT_LOOKUP_ENABLED`, deploy, and check
   the direct 402 challenge: 7000 atomic Arc USDC, the revenue recipient, domain
   USDC/version 2. Runtime checks still fail closed if registration, capacity or
   facilitator status is unavailable.
3. With authorized test spending, complete one direct payment and a same-proof
   retry. Confirm exactly one onchain settlement, correct payout and response
   recovery. Recheck existing Gateway behavior. Direct uncertain settlements
   remain blocked for reconciliation; they are not retried automatically, and
   Gateway must not be used as an automatic paid fallback.
4. Submit the concrete Gateway lookup URL to CRA Market, and the direct URL once
   validated. CRA reads listing details from the live 402/discovery responses.
   Verify visibility with `https://api.cra-agent.tech/v1/market/search?q=argos`.
   Both Argos listings were verified online and returned by the `argos` search on 2026-09-27 at 01:07 UTC.

Registration message, with a fresh ISO timestamp:

```text
CRA AGENT facilitator

Register this wallet as a seller. Payments to it may be settled by the CRA facilitator on Arc, within its daily allowance. No funds move by signing this.

Wallet: 0x60E4834783dA4D4D7ad1C81fc48221840192152C
Issued: <fresh ISO timestamp>
```

References: https://cra-agent.tech/register,
https://api.cra-agent.tech/v1/facilitator,
https://cra-agent.tech/market.

Marketplace validation: CRA accepted both concrete lookup URLs, with name Argos Bot CTS Bridge Lookup, the expected revenue recipient, Gateway price 0.005 USDC and direct price 0.007 USDC. Both listings report online: true and advertise both priced routes. CRA currently truncates the description and returns an empty params array for these listings; the complete input schema remains available in our OpenAPI and developer documentation. Submission required no wallet signatures or payments. Evidence is stored privately in cra-market-submission.json and cra-market-verification.json.

## Parameterized CRA listing update (ready for deployment)

Publish the current website changes before refreshing CRA. Canonical listing URLs:
- GET https://www.argosbot.io/api/v1/bridge/lookup
- GET https://www.argosbot.io/api/v1/bridge/lookup/direct

Bare unpaid GET requests return a rate-limited 402 discovery challenge with required
`token` and optional `chain`/`finality` query parameters. They never default to ARGUS.
Signed requests missing token, malformed values and partial queries still return 400
before payment verification or settlement. Existing paid recovery keys are unchanged.
The standard x402 Bazaar extension carries the input schema and a separate example.
OpenAPI and /.well-known/x402 publish the same inputs, canonical URLs and examples.
Category: Blockchain data. Keywords: blockchain, bridge, cross-chain, tokens, arc,
base, circle, cts. These describe lookup data, not paid bridge execution.

CRA integration limitation confirmed from its public source on 2026-09-27:
https://github.com/giupy997/arcagentx402/blob/main/packages/api/src/market.ts
`listedItems` hardcodes `params: []`, `category: null` and `label: null` for Market
submissions. `probe` only preserves name, description, payment information and route
pattern/price/description; it ignores inputSchema, OpenAPI, Bazaar extensions and tags.
The POST accepts only a URL, so sending extra tag/input fields cannot fix the UI.
The badges for GET, CRA Market, payment method and payment chain are automatic.
CRA must add metadata ingestion (or ingest this service via another catalogue) to
show our input controls and category. No claim is made that adding metadata locally
changes CRA's tags. No public delete/edit route exists in the inspected source;
replacing the old ARGUS-example URLs needs CRA maintainer cleanup to avoid duplicate
listings. Do not submit duplicate canonical listings silently and call it a replacement.
User is handling Vercel publishing; no additional deployment or wallet action was
performed for this update. After deployment, verify both bare 402s before listing them.


## Base USDC payments

Both existing lookup endpoints also accept exact x402 USDC payments on Base
(eip155:8453), using Coinbase CDP's authenticated facilitator. Standard lookup
costs 0.005 USDC on either network; /direct costs 0.007 USDC on either network.
Base payments use native USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,
EIP-712 domain USD Coin/version 2, and the existing revenue recipient
0x60E4834783dA4D4D7ad1C81fc48221840192152C. No Gateway deposit is needed on Base.
CDP_API_KEY_ID and CDP_API_KEY_SECRET are server-only credentials already present
in Vercel. No new public settings or Convex schema changes are required.

Clients select eip155:8453 from accepts. The chain query parameter still refers
only to the token being researched; either payment network can buy either lookup.
Payment nonce identities include network; existing Arc recovery keys are unchanged.
A signed Base request initializes only its Base facilitator, never CRA or Gateway.
An uncertain Base settlement is preserved and not automatically retried or switched
to another network. Completed requests recover with the original proof.

Mocked verification: 52 tests passed across Base payments, Arc payments, service
lifecycle, recovery and persistence; typechecking passed. Production deployment
and live challenge results are recorded separately after release. Odysseus had
zero Base USDC at preflight, so no paid Base test was performed at this stage.

References:
- https://github.com/giupy997/arcagentx402/blob/main/packages/api/src/paid.ts
- https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/verify-payment
- https://github.com/coinbase/cdp-sdk/blob/main/typescript/packages/cdp-sdk/src/x402/facilitator.ts

Base release outcome, 2026-09-27: production deployment
https://arcbot-qhcuzxx43-clawhammer.vercel.app is live. Both canonical endpoints
returned 402 with Arc and Base requirements: 5000 and 7000 atomic USDC respectively,
correct assets, domains and revenue address. Both existing CRA listings were
refreshed and independently verified online with networks [eip155:5042,eip155:8453].
No wallet transactions or secret changes were made. The production CDP secret is
sensitive and cannot be read back; live Base requirements verified its usable
facilitator authentication. Paid Base settlement/replay remains untested until
Odysseus is funded with Base USDC. Mocked settlement/replay tests pass.
