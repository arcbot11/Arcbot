# Argos Bot CTS Bridge Lookup deployment

Public settings are hardcoded in lib/bridge-api/config.ts: payments enabled, Circle Gateway, 0.005 USDC per lookup, https://www.argosbot.io and revenue recipient 0x60E4834783dA4D4D7ad1C81fc48221840192152C. No public BRIDGE_API environment settings are required or consulted.

Keep BRIDGE_API_SERVICE_SECRET private and identical in Vercel Production and its Convex backend. Preserve the existing NEXT_PUBLIC_CONVEX_URL and optional RPC credentials. Never commit secrets. Do not provision previews with the production API secret.

Deploy the reviewed website without promoting domains, deploy matching Convex functions, then promote the website. Verify the backend URL against Vercel Production before deploying Convex; deployment labels alone do not identify which backend the live website uses.

Check health (configured/enabled), discovery, OpenAPI, and unpaid lookup (402 with 5000 atomic Arc USDC units to the recipient above). Paid settlement/recovery requires an authorized test; a challenge alone does not prove successful payment. CRA marketplace submission is separate from deploying this endpoint.

To disable new purchases, change LOOKUP_PAYMENTS_ENABLED to false and redeploy. Keep the secret and persistence for existing paid recovery. Never rerun revenue wallet creation or old operator jobs during deployment.

## Direct-payment option (prepared locally; disabled)

Gateway remains the default at 0.005 USDC. The new route
`/api/v1/bridge/lookup/direct` is priced at 0.007 USDC and uses CRA's direct
EIP-3009 facilitator. Public settings stay in source. `DIRECT_LOOKUP_ENABLED`
is intentionally false pending registration and release validation. Do not
replace the Gateway route or change its recovery keys.

Registration completed with explicit user authorization at **2026-09-27
00:55:50 UTC**: CRA independently reported the existing revenue wallet as
`registered: true`, and submission returned `active: true`. Allowance was 200/day
with 0 used. Only the CRA ownership message was signed; no blockchain transaction,
transfer or approval was submitted. The signature and evidence are retained in
the private registration journal. Step 1 below is complete; do not sign again
unless fresh status shows registration is missing. Direct purchases remain
disabled pending the deployment and paid-test steps.

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

Remaining release steps:
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
   No Argos listing was found during the read-only check.

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
