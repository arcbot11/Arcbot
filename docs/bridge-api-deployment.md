# Argos Bot CTS Bridge Lookup deployment

Public settings are hardcoded in lib/bridge-api/config.ts: payments enabled, Circle Gateway, 0.005 USDC per lookup, https://www.argosbot.io and revenue recipient 0x60E4834783dA4D4D7ad1C81fc48221840192152C. No public BRIDGE_API environment settings are required or consulted.

Keep BRIDGE_API_SERVICE_SECRET private and identical in Vercel Production and its Convex backend. Preserve the existing NEXT_PUBLIC_CONVEX_URL and optional RPC credentials. Never commit secrets. Do not provision previews with the production API secret.

Deploy the reviewed website without promoting domains, deploy matching Convex functions, then promote the website. Verify the backend URL against Vercel Production before deploying Convex; deployment labels alone do not identify which backend the live website uses.

Check health (configured/enabled), discovery, OpenAPI, and unpaid lookup (402 with 5000 atomic Arc USDC units to the recipient above). Paid settlement/recovery requires an authorized test; a challenge alone does not prove successful payment. CRA marketplace submission is separate from deploying this endpoint.

To disable new purchases, change LOOKUP_PAYMENTS_ENABLED to false and redeploy. Keep the secret and persistence for existing paid recovery. Never rerun revenue wallet creation or old operator jobs during deployment.
