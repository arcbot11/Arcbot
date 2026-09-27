# Argos Bot CTS Bridge API

Standalone agent-facing service for external wallets, separate from the existing
CRA lookup endpoint and Argos Bot wallet worker. Proposed production origin:
`https://bridge-api.argosbot.io`. This origin has not been deployed or listed by
this change.

## What it does

| Operation | Result | API charge |
| --- | --- | --- |
| Lookup | Arc/Base original and wrapped addresses, ownerless verification, outstanding wrapper supply, contracts and block evidence | 0.005 USDC |
| Setup job | Register an original token's ownerless connection and request its wrapper on the other chain | 0.01 USDC |
| Transfer job | Optional missing setup, exact token approval, then lock/mint or burn/unlock | 0.01 USDC |
| Continue/recover job | Prepare, revalidate, record transactions, reconcile replacements, track source and destination finality | Included |

The new job price is an initial implementation setting, not a claim that long-term
RPC/storage costs have been measured. Public prices, payout address and canonical
origin are versioned in `lib/agent-bridge/config.ts`. Existing CRA pricing is unchanged.
Circle Gateway handles API payments in USDC on Arc. The caller needs a funded
Gateway balance; API payment does not fund chain gas or Circle forwarding fees.
Gas and forwarding caps are per transaction, in 18-decimal source native units:
Arc USDC or Base ETH. Tokens retain their own decimals.

This uses Circle's Crosschain Token Standard (CTS), CrossChainTokenService and CCTP
infrastructure. Circle Marketplace is a discovery/payment distribution channel;
it does not create or certify the bridge. Original tokens are locked and released
by the verified contracts; wrapped tokens are minted and burned. Argos Bot does
not take custody of tokens or hold users' signing keys.

## External-wallet flow

1. `GET /v1/lookup?token=0x...&chain=arc` (or `base`). Omit the chain only for
   discovery; select explicitly if both chains have a candidate. Known token
   pairs reuse the existing persistent lookup table. Live preparation always
   checks current contracts and state again.
2. Build a fixed intent, shown below. `POST /v1/authorization` returns EIP-712
   typed data. Sign it with the token holder's external EOA. This authorizes an
   API job, not an ERC-20 approval or a transfer.
3. `POST /v1/jobs` with `{intent, expiresAt, signature}`. Handle the x402 402
   challenge, preserving the exact request body and signed payment proof for
   retries. A successful paid response contains `result.job` and
   `result.accessToken`. Store both securely. If payment is uncertain, recover
   the SAME request rather than authorizing another payment.
4. Use `Authorization: Bearer <accessToken>` for this job's endpoints. Call
   `POST /v1/jobs/{id}/next` to prepare the next required step. Review its route,
   chain, action and fees. Call `/arm` with `{stepId}` immediately before signing.
   Only this revalidated response returns the exact transaction to sign.
5. The external wallet signs and broadcasts. Preserve the wallet's signed
   transaction/hash locally before broadcasting. Send `{stepId, hash}` to
   `/transactions`. The service verifies sender, nonce, destination, calldata,
   value, receipt and finality; an arbitrary hash cannot advance the job.
6. Call `/resume` or `GET /v1/jobs/{id}` to follow progress. The background worker
   also polls submitted jobs. After a finalized registration, wrapper deployment
   or approval, the job returns to `ready`; repeat `/next` and sign the next step.
   A completed transfer ends the job. `delivered` means destination receipt
   observed, while `complete` also requires destination finality. Base finality
   can take roughly 20 minutes.
7. Return tokens with a new job using the wrapped address and its source chain.
   Original tokens on either Arc or Base are supported. Destination recipient
   is currently the same EOA address. Base-origin transactions require Base ETH.

Example intent (replace account/token; caps are examples, not fee estimates):

```json
{
  "clientRequestId": "c48ec391-32de-4f97-9b98-b37ef87bd032",
  "chain": 5042,
  "token": "0xece5ca8bf9220718e5727754026757512212cb3c",
  "account": "0x1111111111111111111111111111111111111111",
  "mode": "transfer",
  "amount": "50",
  "allowSetup": true,
  "riskAcknowledged": true,
  "maxForwardingFeeAtomic": "1000000000000000000",
  "maxGasBudgetAtomic": "1000000000000000000"
}
```

Use a fresh clientRequestId for each intended operation, retain it on retries,
and use decimal strings rather than floating-point token amounts. For setup
without a transfer, use `mode: "setup"`, `amount: "0"`, `allowSetup: true`.
Setting `allowSetup: false` prevents incidental registration/deployment.

### Recovery rules

- An unarmed quote can be replaced by `/next`. Do not sign an expired quote.
- An armed quote with no recorded hash can use `/renew` with `{stepId}`. This
  preserves the SAME nonce and remembers older variants. Reconcile anything
  already broadcast first. Renewal never broadcasts a transaction.
- An interrupted wallet response leaves the reservation intact. Submit the
  original hash, or a finalized same-nonce replacement to close the job. There
  is no unsafe time-based unlock or automatic resubmission.
- A second job can use the same source wallet once the first source transaction
  is finalized, even while its destination delivery is pending.
- Concurrent requests are fenced by database revisions and atomic wallet
  reservations. External wallet activity outside this API still requires nonce
  reconciliation.
- Paid-response recovery lasts 24 hours. Save job credentials immediately;
  settled jobs remain accessible beyond that window. Rotating the dedicated
  service secret changes job capabilities, so preserve the secret and coordinate
  rotation while jobs are active.

## Limits and verification

Only external EOAs without contract code on either chain are enabled. Smart
accounts, arbitrary recipients, arbitrary chains and automatic execution by
server-held keys are outside this version. Registration is open subject to
ownerless/official contract checks; known incompatible tokens remain blocked.
Transfer behavior risks require explicit acknowledgement. Simulations, balances,
exact allowances, fee budgets, pause checks, contract identity pins and finality
checks are reused from the existing bridge. Successful simulation or creation of
a wrapper is not certification of arbitrary token behavior or liquidity.

## Build and hosting

```powershell
npm ci
npm run typecheck
npm run agent-bridge:build
node scripts/smoke-agent-bridge.mjs
npm run agent-bridge:start
```

Build produces `.agent-bridge/server.mjs`; default port is 3102. Run on a dedicated
long-lived Node process/container with HTTPS in front, not as a Next.js route.
The polling worker lives in that process. Multiple replicas use shared Convex
CAS/reservation state. Duplicate read-only polling is safe.

Provision only:

| Setting | Where / purpose |
| --- | --- |
| NEXT_PUBLIC_CONVEX_URL | Service: existing Convex deployment URL |
| BRIDGE_API_SERVICE_SECRET | Service + Convex: existing lookup/payment store secret |
| BRIDGE_AGENT_SERVICE_SECRET | Service + Convex: new random secret, at least 32 characters; job store/capabilities |
| BRIDGE_QUOTE_SECRET | Service only: independent random secret, at least 32 characters; transaction plan integrity |
| BRIDGE_ARC_RPC_URL / BRIDGE_BASE_RPC_URL | Optional dedicated HTTPS RPC endpoints, recommended for production |
| PORT | Optional hosting port |

Do not copy `.env.local`, CDP keys, operator wallet manifests, wallet journals,
WEB_AUTH_SECRET or bot credentials into this service. No wallet signing keys are
required. Public commercial settings are constants; secrets stay out of source.

Docker scaffold: `docker build -f services/cts-bridge/Dockerfile .`. Its specific
ignore file allows only build sources and manifests; no private files enter the
build context. Inject the small service-specific secret set at runtime.

Deployment order:

1. Deploy Convex schema/functions, including `agentBridge`, and configure its
   dedicated service secret. Keep existing lookup payment settings intact.
2. Deploy the separate process/container with matching secrets and HTTPS/DNS for
   the chosen origin. If the origin changes, update the versioned constant before
   authorizing jobs. Old signatures are bound to the old origin.
3. Check `/health` (configuration only), `/openapi.json`, `/llms.txt` and
   `/.well-known/x402`. Check a live unpaid lookup returns a valid 402 challenge.
4. Run a small explicitly authorized external-wallet test covering missing setup,
   approval, forward transfer, return transfer and interrupted-response recovery.
   Unit tests are mocked and are not a substitute for this deployment test.
5. Submit the independent API's OpenAPI URL and payout wallet for Circle's review.
   Supply a real operator contact email in OpenAPI before submission; the current
   contact is the public Telegram community URL. Do not claim listing approval
   before Circle approves it.

The server discards client-provided forwarding headers. Behind a reverse proxy,
requests currently share the proxy's conservative rate bucket; configure edge
rate limiting and revisit trusted proxy IP handling before high-volume launch.
Do not log Authorization, Payment-Signature, job capability bodies or signed
wallet payloads. Monitor 503s, uncertain payments, stalled jobs and RPC capacity.

## Marketplace text

**Name:** Argos Bot CTS Bridge API

**Description:** Discover and use ownerless token bridges between Arc and Base
through Circle's Crosschain Token Standard (CTS), CrossChainTokenService and CCTP
infrastructure. Identify original and wrapped tokens, inspect outstanding wrapped
supply, create missing ownerless connections, and coordinate transfers in either
direction. Your external wallet signs every blockchain transaction. Resumable
jobs track approvals, source confirmation, destination delivery and finality.

**OpenAPI:** https://bridge-api.argosbot.io/openapi.json (proposed, not live yet)

**Payment:** Circle Gateway x402, USDC on Arc. Lookup 0.005 USDC; one setup/transfer
job 0.01 USDC. Gas and forwarding charges are separate.

**Payout address:** `0x60E4834783dA4D4D7ad1C81fc48221840192152C`

Official references:
- https://developers.circle.com/agent-stack/agent-marketplace/get-listed
- https://developers.circle.com/agent-stack/agent-marketplace/become-a-seller
- https://docs.arc.io/arc/references/contract-addresses
- https://developers.circle.com/gateway
