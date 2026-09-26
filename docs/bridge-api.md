# Argos Bot CTS Bridge Lookup

Implementation status: local build, paid access disabled. No marketplace registration,
wallet signature, payment, deployment, bridge transaction or onchain identity registration
is performed by setup. The dedicated CDP account is `argos-bridge-api-revenue`, address
`0x60E4834783dA4D4D7ad1C81fc48221840192152C`. The API never imports CDP or reads wallet keys.

Deployment handoff: [bridge-api-deployment.md](bridge-api-deployment.md), including
the exact production environment, deployment order and latest release validation.

## Routes

- `GET /api/v1/bridge/lookup?token=0x...&chain=arc|base&finality=latest|finalized`
- `GET /api/v1/bridge/openapi` (free)
- `GET /.well-known/x402` (free; no purchasable route advertised while disabled)
- `GET /api/v1/bridge/health` (configuration only, not a dependency health claim)
- `/developers/bridge-api` (website documentation)

Chain is optional. If omitted, both chains are inspected independently; a same-address
collision returns multiple candidates. Specify the chain for faster, cheaper checks.
Accepts originals and wrappers in either direction. Original/wrapped roles are relative
to this Circle connection, not the asset's entire history (Base WETH, for example,
can be the original token for a new Circle connection). `source` always describes the input;
`original` always describes the origin asset, even on a return trip. A Base original has
an Arc wrapper. `wrappedSupply` always identifies the wrapper's actual chain.
`isBridgedRepresentation` is true for a wrapper; it is not a claim about individual units
of fungible original tokens having previously traveled through a bridge.

Outstanding supply is wrapper totalSupply, not cumulative volume, liquidity, escrow
backing ratio or pending transfers. All integers are strings. Metadata is sanitized.
Connection verification is not transfer-behavior certification or a wallet-specific
transfer simulation. Original blocklist status is distinct from ownerless identity.

## Persistence and freshness

Convex `bridgeTokenPairs` holds tokenId, Arc address, Base address, original chain,
verified route, policy fingerprint and last verification time. Both addresses are indexed.
Only fully verified deployed pairs enter the table. There are no manually trusted seeds.
The pair table is visible in the Convex dashboard; it is not a public dump of paid data.

The table supplies discovery hints on subsequent calls. Every fresh lookup still checks
the Circle deployment, token-manager bindings, ownership, implementations and metadata.
No permanent cached claim of operational readiness is made. A previously stored pair
does not override a failed fresh check. Changing pins or the original blocklist changes
the cache key and disables old hints. Snapshot results are shared for 30 seconds; the
response discloses cache age and per-chain block evidence. Latest/finalized caches are
separate. Unknown network failures are not cached as absence.

`bridgeLookupCache`, `bridgeApiLimits`, `bridgeApiRequests` provide shared caching,
global/per-client rate limits, payment claims, settlement intent, receipts and result
recovery. A cleanup cron removes expired snapshots and limits and strips expired
completed result bodies. Payment nonce tombstones remain to block replay. Uncertain
attempts retain their prepared result for operator investigation.

## Configuration

Set on the website runtime:

```dotenv
BRIDGE_API_PAYMENTS_ENABLED=false
BRIDGE_API_PAYMENT_RAIL=gateway
BRIDGE_API_PAY_TO=0x60E4834783dA4D4D7ad1C81fc48221840192152C
BRIDGE_API_PRICE_USDC=0.005
BRIDGE_API_PUBLIC_ORIGIN=https://YOUR-CANONICAL-DOMAIN
BRIDGE_API_SERVICE_SECRET=<dedicated random secret>
NEXT_PUBLIC_CONVEX_URL=<existing deployment>
BRIDGE_ARC_RPC_URL=<HTTPS Arc mainnet RPC>
BRIDGE_BASE_RPC_URL=<HTTPS Base mainnet RPC>
```

Set the same `BRIDGE_API_SERVICE_SECRET` on Convex. Do not expose it as NEXT_PUBLIC.
Local setup has saved the new address, proposed price and a new secret in .env.local;
the secret must be propagated securely at deployment. Never print the environment.
No runtime CDP credentials are needed by this service. Optional idempotent revenue
account setup: `node --use-system-ca --env-file=.env.local scripts/setup-bridge-api-revenue.mjs`.
This command creates/retrieves only that account and stores public account metadata in
the ignored private directory; it never exports a key or signs a transaction.

Gateway uses Circle's official x402 batching SDK/facilitator. Direct mode uses CRA's
facilitator and requires seller-wallet registration first. These are explicit modes,
not automatic fallbacks. This version does not offer Base or Solana payment options.
Data about Base tokens can still be bought using Arc payments.

Read-only live Gateway capability check passed on 2026-09-26: it produced an Arc
USDC offer for 5,000 atomic units to the dedicated revenue address. Circle enriched
the challenge with GatewayWalletBatched v1 and a seven-day minimum authorization
validity (604,800 seconds). The SDK overrides the requested short timeout for this
rail; never describe Gateway authorizations as lasting only two minutes. This quote
check did not sign or settle anything and does not replace a paid end-to-end test.

The API trusts the hosting platform to overwrite `x-vercel-forwarded-for`. Another
reverse proxy must provide equivalent trusted handling, or requests share the safe
unknown-client bucket. A global shared cap also applies. Exempt these endpoints from
CDN response caching; private/no-store applies even to successful paid responses.

## Payment, retries and reconciliation

1. Validate input and apply shared limits before expensive reads.
2. Unpaid valid request receives a v2 x402 challenge without reading token contracts.
3. Verify a supplied payment using the facilitator. Invalid proof never creates a claim.
4. Claim the payer/network/nonce atomically in Convex and bind it to normalized inputs.
5. Perform the lookup, store its result, then persist `settling` before settlement.
6. Await settlement and durable receipt recording before returning the result.

Retries must retain the identical query and Payment-Signature. The signed proof is the
recovery credential; the server stores only hashes, never the raw authorization/signature.
Results can be recovered for 24 hours. Reusing one authorization for another input is
rejected. A duplicate concurrent request never runs a second settlement.

Recovery remains available when new purchases are disabled, provided persistence and
its service secret remain configured. Processing/prepared attempts have a fixed
three-minute lease from creation. An authenticated retry after that deadline marks
them not_charged; the customer may use a new authorization. Database transitions
fence expired workers before settlement. Settling/uncertain attempts are never
expired as uncharged and remain subject to receipt reconciliation.

Only admitted requests consume the global and per-client allowances. Requests
rejected by either allowance do not consume the other allowance.
Deploy the website adapter and Convex functions together: recovery now uses a mutation
so expiration and settlement transitions cannot race.

Valid negative findings (no registration, incomplete setup, failed identity checks) are
paid results. RPC/snapshot failures before settlement are not submitted for settlement.
If settlement times out or its receipt cannot be recorded, state stays `settling` or
`uncertain`: do not resubmit or tell the customer they were not charged. Identical retries
return pending status. Identical retries perform a read-only Gateway transfer search by payer, recipient, network
and nonce. Only a unique confirmed/completed record with matching amount can resolve
the attempt. Missing, failed, received, batched or mismatching records remain unresolved.
Direct-mode uncertainty requires operator investigation; no automatic resubmission occurs.
Do not mark a request settled based on a customer assertion or a callback alone.
Gateway settlement acknowledgement is not itself proof of final onchain payout.

## Launch gates

- Deploy Convex schema/functions together with website routes; configure the shared secret.
- Confirm production RPC freshness, canonical chain checks and cache write/read behavior.
- Test Gateway capabilities and seller revenue collection before enabling purchases.
- Verify the Gateway read-only reconciliation procedure against real facilitator evidence.
- Perform an explicitly authorized minimal paid call and interrupted-response recovery test.
- Confirm payment received/collectible; a mocked success is not revenue proof.
- Confirm no arbitrary query can bypass paid protection on this API. Existing free website
  bridge lookup remains separate; this product sells documented structured access, not exclusivity.
- Resolve applicable existing runtime dependency advisories before public deployment.
- Enable payments only after these gates; submit a concrete HTTPS example URL at
  https://cra-agent.tech/market. Listing is a separate external publication step.
- Test discovery of a different token than the listing example. CRA's current external
  market search emits params:[]; OpenAPI is published but its ingestion must be verified.
- No ERC-8004 identity or custom MCP server is required to finish this local implementation.
  Buyer identity policies and broader catalogue support need separate launch decisions.

## Pricing research (2026-09-26)

Read-only sources: https://api.cra-agent.tech/v1/market and
https://api.cra-agent.tech/v1/market/search?q=token. CRA's own Gateway routes quote:
token metadata $0.002, wallet data $0.002, transaction details $0.003, web extraction
$0.005, RPC health $0.0005. Its direct execution-price route is $0.003 versus $0.001
on its Gateway route. These are advertised prices, not evidence of sales or demand.

Proposed pilot price: **0.005 USDC per successful lookup**, both directions, including
valid negative findings. Disabled until the launch gates above pass. Consider a cheaper
mapping-only tier later, but do not silently substitute stale supply to cut costs.

A read-only ARGUS cold lookup measured 73 RPC method calls and ~9.2 seconds before
adding two separate counterpart metadata reads (about 75 calls afterward). HTTP batching
does not necessarily reduce billable RPC work. Base-wrapper inputs can involve additional
discovery checks. Auto-chain inspection can cost more than an explicitly selected chain.
Thirty-second cache hits avoid all chain reads. Durable database and payment operations
still occur for each paid request.

Illustrative marginal RPC cost for 75 methods, **not our provider's verified bill**:

| Assumed effective cost per million methods | Cold lookup | With 90% snapshot hits |
| --- | ---: | ---: |
| $5 | $0.000375 | $0.0000375 |
| $25 | $0.001875 | $0.0001875 |
| $50 | $0.003750 | $0.0003750 |

At $0.005, 1,000 successful calls gross $5 before RPC, database, hosting, settlement,
withdrawal and support costs. Provider compute-unit weights, plan minimums, invoice
allowances and Gateway fees are not yet measured. Do not claim a profit margin until
they are. Track cold/cache ratio, method counts, latency and settlement outcomes in a
pilot. Fresh-address abuse reduces the cache benefit; global limits bound exposure.

CRA direct facilitator reported 200 settlements/seller/day and 400 shared on inspection:
https://api.cra-agent.tech/v1/facilitator. Do not choose it assuming unlimited capacity.

## Local verification completed

- 134 mocked bridge/payment regression tests passed across 11 test files.
- TypeScript typecheck passed.
- Live read-only ARGUS discovery succeeded from both its Arc original and Base wrapper.
- Base WETH returned a Base-original, not-registered result with null wrapper/supply.
- Gateway generated a valid 0.005-USDC challenge; no authorization was signed.
- Final production build passed. Existing lint/viem bundler warnings and nonfatal TLS
  fetch warnings appeared during unrelated page generation; live RPC/quote checks used
  Node system CA support and passed.
- No paid end-to-end test, Convex deployment, public deployment or marketplace listing has occurred.
