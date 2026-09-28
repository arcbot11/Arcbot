# x402scan listing readiness

Two independent services are prepared for x402scan. Registration URLs contain no example token; tokens and chains are caller inputs. No listing submission or deployment is performed by these changes.

| Service | Origin / OpenAPI | Paid endpoints |
| --- | --- | --- |
| Argos Bot CTS Bridge Lookup | https://www.argosbot.io/openapi.json | GET /api/v1/bridge/lookup (0.005 USDC), GET /api/v1/bridge/lookup/direct (0.007 USDC) |
| Argos Bot CTS Bridge API | https://bridge-api.argosbot.io/openapi.json | GET /v1/lookup (0.005 USDC), GET /v1/lookup/direct (0.007 USDC), POST /v1/jobs (0.01 USDC), POST /v1/jobs/direct (0.012 USDC) |

Both origins expose `/.well-known/x402` with `version: 1` and clean absolute `resources`, alongside existing metadata for other consumers. The website's existing `/api/v1/bridge/openapi` remains available. Pricing metadata uses ISO currency `USD`; settlement still uses USDC under the runtime 402 challenge. The payment network does not select the token's source chain.

The standard routes offer Arc Circle Gateway and direct Base USDC when configured. The direct alternatives offer Arc and Base direct USDC when configured. x402scan's currently published supported-chain list includes Base and Solana, not Arc, so its usable payment option for these services is Base. Do not advertise Arc support by x402scan merely because our services accept Arc payments.

## Full bridge discovery and authorization

An unsigned, unpaid POST to either job creation endpoint returns a rate-limited 402 challenge and the POST body schema. It creates no job, requests no wallet signature, and settles no payment. A request carrying Payment-Signature still passes bounded JSON and strict input validation. Job creation verifies the wallet's intent signature before settlement. Existing payment recovery and per-job Bearer capabilities remain mandatory. Registration, wrapper creation and bridging require the external wallet to sign each blockchain transaction separately.

The authorization endpoint is explicitly public in OpenAPI. Job management correctly uses an HTTP Bearer security scheme. `@agentcash/discovery` 1.7.5 does not classify that scheme and emits auth-mode warnings for these six non-purchase endpoints; they must not be changed to public to silence the validator.

## Validation and rollout

Local validation uses mocked requests only. `tests/bridgeMarketplace.test.ts` verifies clean discovery URLs, pricing, GET/POST metadata, unpaid POST challenges and rejection of malformed paid bodies before settlement or job creation. The pinned `@agentcash/discovery` 1.7.5 parser recognized all six paid operations and their input schemas; its PaymentInfoSchema accepted their pricing/protocol metadata.

1. Deploy the website changes to Vercel, including the dedicated bridge API hostname. These discovery changes require no Convex schema update. Unrelated pending changes may have their own deployment requirements.
2. Recheck public discovery after deployment with:

   ```powershell
   $env:NODE_OPTIONS = '--use-system-ca'
   npx --yes @agentcash/discovery@1.7.5 https://www.argosbot.io -v
   npx --yes @agentcash/discovery@1.7.5 https://bridge-api.argosbot.io -v
   ```

3. Verify unpaid GET lookup and POST job requests return 402 with Base USDC in `accepts`, correct method/body metadata, and no example query in resource URLs.
4. At https://www.x402scan.com/resources/register use Add Server for each origin. Inspect the registration result: lookup should advertise two GET purchase routes; full bridge should advertise two GET and two POST purchase routes. Authorization and job management are supporting endpoints, not separate paid products. Use endpoint-only registration if necessary.
5. Confirm the resulting listings actually exist before reporting acceptance. Deployment, discovery compliance and marketplace registration are separate steps.

Reference: https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md
