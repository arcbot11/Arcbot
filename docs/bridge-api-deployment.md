# Argos Bot CTS Bridge Lookup — deployment handoff

Deploy with purchases disabled. This publishes documentation and installs the
API/database infrastructure. Paid activation and CRA submission follow production
verification. No operator wallet transaction is required for deployment.

## GitHub contents

Include new untracked files as well as modified files: app/api/v1, app/.well-known,
app/developers, lib/bridge-api, Convex schema/functions/crons, bridge reader changes,
documentation, tests, scripts and package.json/package-lock.json. Review git status
and commit the lockfile. Keep .env.local, .deployment-private, wallets and keys out
of Git. They are ignored. The revenue account already exists; do not run its setup
script as a deployment step.

## Production configuration

Set these in Vercel Production before building:

| Variable | Value |
| --- | --- |
| BRIDGE_API_PAYMENTS_ENABLED | false |
| BRIDGE_API_PAYMENT_RAIL | gateway |
| BRIDGE_API_PRICE_USDC | 0.005 |
| BRIDGE_API_PUBLIC_ORIGIN | https://www.argosbot.io |
| BRIDGE_API_PAY_TO | 0x60E4834783dA4D4D7ad1C81fc48221840192152C |
| BRIDGE_API_SERVICE_SECRET | Existing dedicated local .env.local value; copy securely |
| NEXT_PUBLIC_CONVEX_URL | Existing production Convex URL |
| BRIDGE_ARC_RPC_URL | Optional dedicated HTTPS Arc reader |
| BRIDGE_BASE_RPC_URL | Optional dedicated HTTPS Base reader |

Set the same BRIDGE_API_SERVICE_SECRET in production Convex. Preserve existing
variables. Use separate secrets/deployments for previews and keep their purchases
disabled. No new CDP private key is needed in the API runtime.

## Deploy in this order

1. Configure Vercel and Convex as above.
2. Commit and push the reviewed revision to GitHub. If this triggers Vercel
   automatically, purchases must already be disabled.
3. Run `npx convex deploy` from this revision, confirming the intended production
   target shown by the CLI. This installs tables, indexes, functions and cleanup.
4. Deploy/redeploy the same revision to Vercel with `npm run build`. The project
   directory is Arcbot, containing package.json and vercel.json.
5. Keep payments disabled during the free production checks below.

Do not use the old frontend-only deployment helper. The website and Convex must
match: bridgeApi:recover is now a mutation, so the new website cannot use the old
recovery query. Vercel alone does not deploy the Convex changes.

The local dry-run selected a deployment labeled Development. Do not assume the
local credentials target production: a CONVEX_DEPLOY_KEY can override deployment
selection. Confirm the target in the CLI/dashboard and use the intended production
credentials before the real deploy. Do not replace existing production variables
with local development values.

## Free production checks

- /developers/bridge-api: new title, official references and disabled price text.
- /.well-known/x402: new name, status not_enabled, routes empty and references.
- /api/v1/bridge/openapi: valid JSON, new title and canonical production origin.
- /api/v1/bridge/health: configured true, enabled false. HTTP 503 is expected while
  disabled; this endpoint is not a dependency-health check.
- A valid unpaid lookup returns 503 while disabled.
- Convex contains bridgeTokenPairs, bridgeLookupCache, bridgeApiRequests and
  bridgeApiLimits; inspect cleanup cron executions and function errors.
- Smoke-test the existing /bridge page without signatures or transactions.

Optional free CLI probe (503 is expected while disabled):

```powershell
node --use-system-ca scripts/bridge-api-quote.mjs https://www.argosbot.io 0xece5ca8bf9220718e5727754026757512212cb3c arc
```

## Separate paid launch gate

Verify real Gateway settlement, collectible revenue and interrupted-response
recovery using an explicitly authorized minimal payment before public paid launch.
Confirm production RPC and Convex behavior. Enable purchases only for controlled
validation first, then public launch after it passes. Marketplace submission is a
separate publication step; CRA should not be listed against the disabled endpoint.

To disable sales later, set BRIDGE_API_PAYMENTS_ENABLED=false and redeploy. Retain
the database, shared secret and compatible functions for existing paid recovery.

Public text: [bridge-api-public-copy.md](bridge-api-public-copy.md).
Implementation details: [bridge-api.md](bridge-api.md).

## Local release validation

- Production `npm run build` passed on Next.js 15.5.26, including type checks and
  page generation. Existing lint and viem/ox bundler warnings remain nonfatal.
- 134 mocked bridge/payment regression tests passed across 11 files.
- Convex deploy --dry-run --codegen disable passed, including TypeScript and
  bundling; no index deletions reported. This was a dry-run against the locally
  selected Development deployment, not a production deployment.
- Compatible security updates are locked: Next.js 15.5.26, sharp 0.35.4,
  js-yaml 4.3.2 and nanoid 3.3.19. The post-update audit reported only two moderate
  development-tool findings for Vitest/@vitest/mocker (GHSA-82fw-gwwq-j7x9).
  No critical/high findings remain in that audit. Do not expose a Vitest development
  server; resolving that advisory requires a separately tested major upgrade.
- Local public origin is https://www.argosbot.io; purchases remain disabled.
- Environment and private wallet/deployment files are ignored by Git.
