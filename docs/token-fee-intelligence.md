# Argos Token Fee Intelligence

## Build status

The local implementation includes current and historical reports, paid API handlers,
shared-wallet job execution, X command routing, and Telegram Check Fees / Claim Fees
prompts. It is staged for review, **not live**. Both FEE_PUBLIC_API_ENABLED and
FEE_SOCIAL_ENABLED remain false. The private fee:control record independently gates execution.
No configuration, funding, wallet signatures, transactions or deployment were performed
while implementing these changes.

Release steps (not authorized by the current local-only task):
- Coordinate website/Convex deployment, privately configure the numbered-wallet exclusions,
  and verify operator funding before activating sponsored claims.
- Run a controlled live acceptance check only with explicit wallet-transaction authorization.
  Mocked tests do not establish live gas costs or external RPC/explorer availability.
- Validate provisional pricing against actual gas and settlement costs before enabling
  paid requests. Marketplace publication is separate; do not advertise a CRA POST claim
  listing without confirmed support from CRA.

Coverage boundaries: only the explicitly supported Argus launch contract families are
eligible. ARGUS itself is not covered by the shared launch reader; unsupported is not zero
fees. Unrecognized historical event implementations leave lifetime totals unavailable,
even when current balances can be read safely. This is not universal ERC-20 support.

## Report and social fields

GET /api/v1/fees/report accepts token (contract address) and optional chain=arc.
X/TG additionally resolve indexed tickers and ask for a contract address if ambiguous.

The full JSON includes token/chain, contract family, fee contracts and assets, recipient
addresses and splits, allocation percentages, balances, unallocated funds, creator debt,
reserved liquidity, holder reward accounting, status, warnings and block evidence.
Historical reporting is lifetime fees earned only. There is no public simulation section.

The compact X/TG report contains:
- Token and Arc chain.
- Lifetime fees earned: completed event-index totals with explicit accounting scope.
  The first request queues a historical backfill; totals remain unavailable until complete.
- Awaiting crank: unallocated fees at legacy splitters; excludes creator debt and reserved
  liquidity. Portal 8 instead says automatic allocation; no crank needed.
- Creator fees ready to claim: existing creator debt, which does not require another crank.
- Holder funds awaiting distribution: funded tracker balance minus held funds when supported.
  Portal 8 instead reports holder obligations in quote units, including rounding carry;
  these are not a promise that the same amount of payout tokens can be pushed immediately.

Amounts use each asset's own decimals and units, not USD. Overlapping buckets must not be
added. Unknown data remains unavailable, never zero. Compact reports omit block/time fields.
Internal execution simulations remain mandatory and separate from report content.

## Historical accounting

The private fee-history records bind a token to its discovered hook, locker, quote asset
and contract family. A separate read-only worker indexes contiguous block ranges from
genesis (skipping the provably empty pre-deployment interval), stores totals and a canonical block hash, and resumes at the next unprocessed
block. Revision checks prevent concurrent/replayed commits from adding fees twice.
Changed checkpoint hashes reset the index; incomplete, unsupported, or failed reads never
become a zero lifetime total. No wallet provider or signer is used by the indexer.
Log reads try each configured, chain-validated provider before reducing the block range,
since providers have different history limits. Backfills continue while making progress;
only consecutive failed attempts exhaust the bounded retry policy.

Legacy totals sum TaxTaken on the bound hook and FeesCollected on the bound locker, using
the pool's sorted token currencies. Unharvested LP fees are explicitly excluded, so legacy
reports retain partial status even after their event index catches up. Portal 8
totals sum QuoteFeeTaken.bucketFee and exclude its separate protocol surcharge. Claims,
holder payouts, ordinary transfers and escrow totalReceived() are never added. The latter
is balance-derived and includes donations, so it cannot establish lifetime fees earned.
The response gives fromBlock, throughBlock, source and scope for historical amounts.
Current balances are independently pinned to the report observation block.

Portal 8 current reports also expose creator/burn/holder/liquidity/lock allocation BPS,
off-the-top treasury BPS, burn/liquidity/lock/treasury budgets, holder liability and quote
units consumed by past holder claims. These budgets overlap the escrow balance; do not sum.

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
Holder cursor preparation and transaction journaling are atomic. A successful legacy
batch advances to the next page; a Portal 8 push advances past only that one holder.
Pending retries reuse the transaction and cursor, while reverted/cancelled payouts do
not skip unpaid holders. A definite holdings exclusion skips the crank and still permits
already-owed creator claims; an unavailable holdings check blocks execution.

Fresh contract, recipient, asset, entitlement, simulation, gas, nonce, journal and finality
checks apply. The shared numbered-Personal-wallet crank exclusion helper is reused with
privately stored addresses/exclusions; those manifests never appear in public responses.
If recipients, assets or entitlements change before signing, an atomically confirmed
unsigned transaction is cancelled to release the shared wallet. RPC failures remain
retryable; any transaction that crossed the signing fence retains normal recovery.

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

Local validation includes payment-settlement fencing, gas budgets, receipt recovery,
holder cursor ownership, changed recipients/assets/entitlements before signing, history
range replay/reorgs, report-only behavior, rate limits, ticker ambiguity and release gates.
No current task testing signs or broadcasts transactions or changes live control records.

### Validation on 2026-09-28

- 265 focused mocked tests passed across fee reporting/history, execution, payment
  recovery, social routing, Telegram workflows and holder cursors.
- TypeScript checking and the local production build passed. The build retains unrelated
  dependency/lint warnings; no deployment was run.
- Live read-only ARGOS and ARCDD reports verified both supported contract families.
  Public bytecode confirmed the historical event signatures on their hooks/locker.
  Small log samples confirmed provider range differences; these were not lifetime totals.
- The broader existing `xWalletIntent.test.ts` suite still has 22 failures involving older
  launch/reassignment/upgrade expectations. Those files were not changed by this task;
  fee-specific X command tests pass. This is not a claim that the repository-wide suite is green.
- No live backfill, paid request, claim, crank, signature, wallet funding or activation was run.
