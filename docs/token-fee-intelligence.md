# Argos Token Fee Intelligence

## Build status

The local implementation includes the report reader, paid API handlers, shared-wallet
job execution, X command routing, and Telegram Check Fees / Claim Fees prompts.
This is **not a production-ready release**. Public paid access is explicitly disabled
by FEE_PUBLIC_API_ENABLED. The private fee:control record independently gates execution.
No configuration, funding, wallet signatures, transactions or deployment were performed
while implementing these changes.

Remaining release blockers:
- Verified lifetime accounting: lifetimeFeesEarned currently returns null. Never infer it
  from current balances, creator claims, holder payouts or donations. Reports are partial.
- ARGUS itself is not covered by the shared launch reader; unsupported is not zero fees.
- Expanded Portal 8 coverage is deferred. Allocation is automatic, so no legacy crank
  is attempted; creator debt and supported permissionless claims remain covered.
- Complete execution/recovery integration review, coordinated website/Convex deployment,
  private policy configuration and operator funding before activating sponsored claims.
- Validate provisional pricing against actual gas and settlement costs before enabling
  paid requests. Marketplace publication is separate; do not advertise a CRA POST claim
  listing without confirmed support from CRA.

## Report and social fields

GET /api/v1/fees/report accepts token (contract address) and optional chain=arc.
X/TG additionally resolve indexed tickers and ask for a contract address if ambiguous.

The full JSON includes token/chain, contract family, fee contracts and assets, recipient
addresses and splits, allocation percentages, balances, unallocated funds, creator debt,
reserved liquidity, holder reward accounting, status, warnings and block evidence.
Historical reporting is lifetime fees earned only. There is no public simulation section.

The compact X/TG report contains:
- Token and Arc chain.
- Lifetime fees earned: currently unavailable pending verified historical coverage.
- Awaiting crank: unallocated fees at legacy splitters; excludes creator debt and reserved
  liquidity. Portal 8 instead says automatic allocation; no crank needed.
- Creator fees ready to claim: existing creator debt, which does not require another crank.
- Holder funds awaiting distribution: funded tracker balance minus held funds when supported.

Amounts use each asset's own decimals and units, not USD. Overlapping buckets must not be
added. Unknown data remains unavailable, never zero. Compact reports omit block/time fields.
Internal execution simulations remain mandatory and separate from report content.

## Claim workflow and wallet

POST /api/v1/fees/claim accepts a JSON token address and optional chain=arc.
A paid report never authorizes a claim. Claims use a separate payment/request scope.
X recognizes requests such as “check fees for ARGOS” and “claim fees for ARGOS”.
Telegram has Check Fees and Claim Fees buttons with a ten-minute address/ticker prompt;
/fees ARGOS and /claim ARGOS also work. Other commands cancel the saved prompt.

All workflows use the existing CDP x402 revenue wallet:
0x60E4834783dA4D4D7ad1C81fc48221840192152C.
The requesting user's wallet does not pay gas. Contract-registered beneficiaries and
eligible holders receive payouts; the service does not substitute itself as recipient.

Each job has at most three transactions: one appropriate legacy crank, one creator claim,
and one holder distribution. Legacy holder batches have at most 50 addresses. Portal 8
skips crank and its permissionless push pays one holder per call. Holder discovery is
bounded; a completed scan does not promise every holder has been paid.

Fresh contract, recipient, asset, entitlement, simulation, gas, nonce, journal and finality
checks apply. The shared numbered-Personal-wallet crank exclusion helper is reused with
privately stored addresses/exclusions; those manifests never appear in public responses.

## Payments, budgets and recovery

Provisional prices: 0.007 USDC/report and 0.05 USDC/claim workflow. Direct Arc/Base x402
payment handling is reused. Recovery is scoped separately from existing bridge services.
The service remains disabled until ready; unrelated website deployment must not enable it.

Maximum gas: 0.01 USDC/call and 0.03 USDC/job. Preserve a five-call reserve of 0.05 USDC.
Arc native gas uses 18 decimals; ERC-20 payment USDC uses 6. Receipts provide actual gas.
X/TG: ten checks per authenticated user/minute and three claims per rolling hour.
All channels share a ten-minute token cooldown. Free gas is capped at 1 USDC per rolling
24 hours; total paid/free gas is capped at 5 USDC. Linked X/TG accounts share a principal.

Admission, cooldowns and reservations are atomic Convex mutations before settlement.
Paid jobs wait for confirmed settlement; a durable worker starts at admission so an HTTP
disconnect cannot strand an admitted job. A stale pre-settlement lease is atomically
marked not_charged before releasing its reservation. Settling/uncertain payments are
never presumed unpaid or automatically settled twice.

One-hour job expiry stops new work. Unsigned transactions can be safely cancelled;
signed or uncertain transactions retain their locks/budgets until finality reconciliation.
Gas-budget checks also apply to replacement bytes. Repeated requests reuse stable job
and transaction IDs. Never replace an uncertain payment with a new authorization.

## Deployment preparation

Deploy website handlers and Convex schema/functions together. Required existing private
configuration: OTC_SERVICE_SECRET, BRIDGE_API_SERVICE_SECRET and NEXT_PUBLIC_CONVEX_URL,
plus the existing CDP signer configuration. The worker uses the canonical website origin.

scripts/configure-fee-service.mjs validates the private numbered-wallet manifest and
sticky exclusions. It is dry-run by default. --apply saves the policy with execution
disabled; --apply --enable activates it and must only be used after release approval.
It does not create/fund a wallet or sign transactions. Do not log private manifests.

The x402 website page correctly labels this service In development. Public OpenAPI,
agent discovery and marketplace publication should follow release readiness, not precede it.
