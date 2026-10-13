# Direct Argos Bot A2A bridge workflow

Independent of Arcus; pinned to A2A 0.3.0 JSON-RPC. Public paths after deployment:
- /.well-known/agent-card.json
- POST /a2a
- /a2a/docs (full schemas and usage instructions)

## Commands

Use message/send with a user Message and one DataPart containing:
- bridge_lookup: input {token, chain?, finality?}; rail gateway/direct.
- bridge_authorization: input is the REST JobIntent; returns typed data for the external wallet.
- bridge_create: input {intent, expiresAt, signature}; rail gateway/direct; returns a durable Task. Save metadata.accessToken privately.
- bridge_continue: message.taskId is the job ID; optional contextId must match it. input is {operation:next|resume}, {operation:arm|renew,stepId}, or {operation:transactions,stepId,hash}. Supply Authorization: Bearer jobAccessToken in the HTTP header, never in message data.

Only bridge_continue accepts a taskId. tasks/get accepts params.id with the same per-job Bearer token and returns a saved snapshot. No history, streaming or push callbacks are advertised. tasks/cancel authenticates and returns TaskNotCancelable; submitted blockchain transactions cannot be undone.

## Setup and transfer

1. Get authorization for the full JobIntent: clientRequestId (UUID), chain (5042/8453), token, account, mode (setup/transfer), amount, allowSetup, riskAcknowledged=true, maxForwardingFeeAtomic and maxGasBudgetAtomic.
2. External wallet signs the returned typed data. This authorizes the API job, not token movement. Preserve the returned intent and expiresAt.
3. Create using signed input and HTTP x402 payment. Save the task/job ID and access token.
4. Continue with next. Review route, fees and transaction details. Arm the exact step immediately before signing. Only arm returns the signable transaction and deadline.
5. External wallet signs and broadcasts, persisting signed transaction/hash before broadcast. Record that same hash through transactions.
6. Resume reconciles receipts and finality. Next prepares the following step when appropriate. Renew uses the existing same-nonce recovery safeguards after reconciliation.

All existing signed-intent, identity, simulation, fee caps, leases, nonce, persistence and finality guards are reused. Raw signed transactions, private keys and arbitrary operation names are rejected. The API never signs or broadcasts wallet actions. Setup connects tokens without transferring; transfers use an existing or explicitly authorized new connection.

Ready/awaiting-wallet states map to input-required. Pending, forwarding and delivered map to working; delivered is not finalized. Complete maps to completed, failed to failed. Task artifacts include the public job and current prepared step. Only creation returns its access token and paid receipt in metadata; tracking does not reissue credentials.

## Payments

HTTP x402 is used, not the A2A task-payment extension. Generic A2A clients need an HTTP x402 adapter. Follow the exact REST resource in the original 402 challenge, then retry the identical A2A message with the SAME Payment-Signature. Explicit gateway/direct selection must not change while payment is unresolved. Payment-Transaction is forwarded for direct recovery; uncertain recovery responses remain unchanged, and PAYMENT-RESPONSE is preserved on success.

Changing messageId never authorizes another payment. Durable identity and conflicting-intent checks use the existing signed clientRequestId/account. One job fee includes continuation; gas and Circle forwarding fees are separate. External wallet actions remain subject to the existing documented restrictions.

## Release

No new secrets or Convex schema/functions required. Existing storage and background polling remain in use. Push the scoped release commit to the branch Vercel deploys; deploy current Convex only as required by the normal release process.

Run TypeScript, bridge tests, Next production build and standalone API build. After deployment:

    node --use-system-ca scripts/check-agent-bridge-public.mjs

This checker never sends payment proofs, wallet signatures or transactions. Paid live interoperability and on-chain execution require separately authorized external-wallet tests. Do not advertise server-wallet execution or the A2A task-payment extension.
