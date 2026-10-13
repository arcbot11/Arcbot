# Direct Argos Bot A2A support

The first adapter is pinned to A2A 0.3.0 JSON-RPC. It is independent of Arcus.
After deployment, discovery is at `https://bridge-api.argosbot.io/.well-known/agent-card.json`,
the JSON-RPC endpoint is `/a2a`, and request examples are at `/a2a/docs`.

## Supported operations

- `message/send`: a single structured `DataPart` with `skill: bridge_lookup`,
  `input: {token, chain?, finality?}`, and `rail: gateway | direct` (default gateway).
  Returns an A2A Message containing the existing paid lookup response.
- `tasks/get`: `params.id` is an existing REST bridge job ID. The caller must
  provide that job's Bearer access token in the HTTP Authorization header.
  Returns the current job as an artifact, with its lifecycle mapped to an A2A Task.
- `tasks/cancel`: authenticates the existing job, then returns TaskNotCancelable.
  Cancellation cannot reverse a submitted blockchain transaction.

Ready/awaiting-wallet states map to input-required. Pending, forwarding and
delivered map to working; delivered does not mean finalized. Complete maps to
completed, and failed maps to failed. Retrieval is a snapshot, not a refresh;
the existing worker and authenticated REST resume endpoint continue to update jobs.

## Payments and compatibility

This version uses HTTP x402 challenges and does **not** advertise the A2A x402
task-payment extension. Generic A2A clients need HTTP x402 support or a payment
adapter. A 402 identifies the existing lookup resource, which is what the client
must authorize. Retry the identical A2A request with the same Payment-Signature.
Recovery responses (including unresolved-payment 409) are preserved unchanged.
Successful responses retain PAYMENT-RESPONSE and the original request/receipt data.
Changing a message ID is not permission to create another payment.

Discovery is free. Job tracking requires the existing per-job credential and
does not accept credentials inside message data. No new persistence, signing,
transaction broadcasting, job creation, streaming or push callbacks are added.
Existing REST and MCP interfaces retain their behavior.

## Validation

Tests cover challenge/receipt preservation, stable message identity, payment
recovery without retries, authorization, job lifecycle including delivered versus
finalized, unsupported operations, request validation and hostname isolation.
Run `npx vitest run tests/agentBridgeA2A.test.ts tests/agentBridgeHosting.test.ts
tests/agentBridgePayment.test.ts tests/agentBridgePaymentRecovery.test.ts`,
`npm run typecheck`, and `npm run agent-bridge:build`.

Next phase: independent SDK interoperability checks and an explicitly versioned
A2A x402 task-payment extension before enabling job creation and wallet-input
continuations. Do not claim support for those capabilities in directory listings.

## Release handoff

Commit the A2A adapter, routing, documentation, regression tests and updated public readiness checker. Push to the GitHub branch used by Vercel; deploy Vercel normally. No Convex schema/functions or new environment variables are required by this change; the existing Convex deployment and worker remain in use. If deploying Convex as part of your normal release, deploy its current functions before the Vercel release.

After deployment run:
```powershell
node --use-system-ca scripts/check-agent-bridge-public.mjs
```
This checker never signs a payment or blockchain transaction. Announce A2A lookup and existing-job tracking only after it passes. Full job creation and the A2A payment extension are outside this release.
