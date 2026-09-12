# Review: user wallets that can spend outside Argos Bot

Implementation follow-up: see [external-spending-implementation.md](external-spending-implementation.md). The findings below describe the pre-change review; they are retained as the original audit record.

Read-only code review; no production changes or live transactions. Scope: exported keys for ordinary X/TG wallets, not escrow or operator keys.

## Conclusion

The escrow design can support exported customer wallets, but normal transaction recovery must stop treating our database as exclusive authority over their funds and nonce. Existing safety checks usually prevent an unfunded request from signing; they do not consistently resolve the resulting operation or release related reservations. Do not enable export before resolving the high-priority cases below.

## Existing protections to preserve

- prepareCall reads balance and nonce, simulates, estimates gas and checks coverage (lib/otc/runtime.ts).
- advanceTransaction repeats nonce, funds, owner and call checks before the durable signing fence. An ambiguous CDP signature is retrieved using its original intent before fresh simulation.
- All signed fee attempts are retained and checked for receipts before another broadcast. No unverified replacement payment should be sent at a new nonce.
- Native Base receipt verification already tolerates the recipient spending in the same block. Ordinary token verification reconciles block-wide transfers; Arc USDC also reconciles gas across sender transactions. These checks must remain receipt/delivery-based, not based on whether proceeds still remain in the recipient wallet.
- Dedicated OTC wallets hold verified listing deposits; payouts have immutable recipients. Exporting the customer's separate address need not expose escrow inventory.
- Standalone unsigned transactions have an atomic cancellation path. Unpaid version-2 OTC purchases also have an unsigned-only cancellation/expiry path.

## Findings and required changes

### High: unsigned balance/nonce failures can strand requests

advanceTransaction throws when the nonce changes or reservations are no longer covered. The worker records a note and retries. Ordinary unsigned sends/approvals eventually expire after fifteen minutes; swaps can expire with their deadline. This is slow and incomplete as a response to a definite external conflict.

Add explicit typed outcomes for outside nonce use, reduced spend balance, reduced gas balance, and changed allowance. Atomically cancel/release a never-signed ordinary request immediately when it cannot proceed under its accepted terms. Preserve already completed approvals as separate facts. Do not silently reduce an exact send or reuse an old quote; the user submits new terms. Treat RPC unavailability as uncertainty, not proof of missing money.

Files: lib/otc/runtime.ts, unsigned-recovery.ts, transactions.ts, settlement-error.ts.

### High: seller funding has no equivalent dependable unsigned cancellation

cancelListing rejects a funding listing when seller.activeTx exists or any funding transaction exists unless it is verified reverted. cancelUnsignedTrade excludes escrowRef requests. If a seller drains funds after funding preparation, a never-signed funding record can therefore keep the listing and wallet blocked. retryEscrowStep can replace unsigned work, but does not provide a terminal cancelled listing when funding is no longer possible.

Add an atomic abort-unfunded-listing operation, serialized with begin_signing. Prove every funding attempt never entered signing and no escrow deposit was delivered, then cancel the funding request and listing and release only their holds. If signing started, use signature/nonce reconciliation instead. Never assume lack of an RPC receipt proves lack of a payment.

Files: lib/otc/model.ts cancelListing; unsigned-recovery.ts; escrow-model.ts retryEscrowStep.

### High: outside replacement requires automatic discovery and terminal order cleanup

reconcileTransactionNonce exists, but it needs an operator-supplied mined hash and only accepts EIP-1559 replacement transactions. drainWork does not discover external replacements. advanceTransaction stops when the nonce is consumed without a known receipt.

Add bounded, resumable lookup by chain, sender and nonce. Use canonical chain receipts as evidence; an indexer can supply candidates but is not final proof. Distinguish a matching call from a different call, and handle valid external transaction types without weakening the exact signed-intent checks for transactions Argos Bot signs. Include reorg handling. Non-execution proof may warrant a stronger finality threshold than ordinary Base receipt-based delivery; the UI must distinguish the two rather than promising every conflict resolves in 30 seconds.

An external fee replacement of the same action can still succeed: adopt its evidence and run normal delivery checks. A different finalized transaction consumes the original nonce even when that different transaction reverted; do not infer that its payment succeeded.

For an OTC buyer deposit, reconcileMinedNonce currently cancels the transaction and restores its source hold, but cancelUnpaidPurchase rejects its signed history. The order/listing can remain locked; retryEscrowStep can create a new deposit attempt instead. Add a terminal atomic abort path based on proof that every signed original attempt can no longer execute, no recognized payment funded the order, and no payout started. Release the buyer/order/listing reservations together. Require fresh buyer authorization before any new payment after an external cancellation or unrelated replacement.

Files: lib/otc/recovery-runtime.ts, signed-recovery.ts, cancel-purchase.ts, escrow-model.ts, runtime.ts drainWork.

### High: an underfunded signed transaction is still potentially executable

Current recovery retains its signature and stops when coverage is missing. That is safer than pretending it is cancelled, but the request can later become executable after new deposits. A token allowance spender can also remove input tokens without consuming the owner's own transaction nonce. Expiry alone does not cancel ordinary signed native/token sends or approvals.

Expose a distinct unresolved-signed state and stop suggesting that merely waiting or retrying a new payment is safe. Recover all signing outcomes first. For cancellation, prove consumption of the same nonce by another transaction, or submit an explicitly authorized same-nonce cancellation if funds and policy permit it and verify the result. Never automatically refill from platform funds or unrelated escrows. Never release signed obligations solely because balance is low, a timeout elapsed, or a node does not see the hash. Handle a later rebroadcast or restored balance without double payment.

### Medium: approval verification assumes no later use in the same block

For normal allowance transactions, advanceTransaction requires end-of-block allowance to equal the approved amount/expiration. An outside transferFrom, swap, revoke or newer approval in the same block may change that value after our approval succeeded.

Separate approval execution verification from current spend authority. Verify the exact transaction and the appropriate receipt events/transaction-scoped evidence; then re-read current allowance before preparing the swap. If the user revoked or used it externally, fail/reconfirm the trade rather than hanging the approval or repeatedly overwriting the user's change. Preserve strict handling for nonstandard tokens rather than accepting an arbitrary success flag.

Files: lib/otc/runtime.ts allowance branches, lib/arc/trading.ts allowance checks.

### Medium: display and history need to represent outside activity

WalletDashboard polls native balances every ten seconds; external transfers should eventually change them. Cached last-good balances deliberately survive failed reads and must remain display-only, with freshness/unavailable information when relevant. A balance below database holds currently renders zero available, masking why a request is blocked. Token refresh/history are primarily tied to known bot activity; current transaction history is not a complete external account history.

Add observed-balance timestamps, active-page/focus refresh for token balances and allowances, and a clear external-activity classification. A chain data source may discover external transfers but should not create a bot request or change OTC accounting. Keep transaction/fee/gas holds distinct from actual deposited escrow. Do not promise all arbitrary token balances or external actions will be indexed without implementing coverage.

### Medium: status text misidentifies missing principal as gas trouble

settlementFailure maps reservation coverage failures to insufficient gas and nonce conflicts to a generic support message claiming funds remain protected. For an exportable customer wallet, the missing funds may be principal already spent elsewhere; a database hold does not protect them.

Use typed user-facing reasons: balance changed before signing, another transaction used this nonce, allowance changed, signed transaction requires reconciliation, or RPC verification unavailable. Messages must state known outcomes rather than assert that external funds are still locked or that an unverified payment failed.

## OTC behavior by stage

| Stage | Outside spending effect | Required behavior |
| --- | --- | --- |
| Seller has not funded escrow | Can remove planned inventory/gas | Abort safely if never signed; reconcile if signing started |
| Listing deposit verified | Customer's remaining wallet balance can change | Listing inventory stays backed by escrow; continue normally |
| Buyer only obtained a quote | Can remove payment ETH | Recheck at confirmation; quote is not a reservation |
| Buyer confirmed; deposit unsigned | Can remove ETH or use nonce | Cancel unpaid purchase atomically and release listing |
| Buyer deposit signed, uncertain | May conflict, be replaced, or become underfunded | Keep reconciliation; no second payment until resolved |
| Buyer deposit verified in escrow | Customer can empty their own wallet | Use escrow's funded budget for settlement; do not re-require original payment balance |
| Seller receives Base, spends it immediately | Does not undo delivery | Continue Arc payout using recorded receipt evidence |
| Buyer receives Arc, moves it immediately | Does not undo delivery | Complete from verified transfer evidence, not current balance |

Gas recovery may still need extra funds if escrow's budget is insufficient. Track the obligated payer and available escrow credit explicitly; exporting must not authorize unbounded extra debits or change exact purchase amounts. Preserve existing rules for tiny refundable dust.

## Rollout order

1. Typed failure classification and fast never-signed cancellation for normal requests and listing funding.
2. Automatic nonce-conflict discovery, safe reconciliation and atomic OTC terminal cleanup.
3. Signed underfunding/cancellation policy and approval evidence improvements.
4. External-control wallet metadata and safe export synchronization across both Arc and Base. Treat current exclusive signing as an assumption even before export: imported private keys may already have another holder.
5. Balance freshness/history updates and accurate user messages.
6. Export feature only after adversarial concurrency/recovery tests pass.

No change can prevent an external holder from racing a prepared bot transaction. Our guarantee must be correct execution or an accurate, recoverable outcome, not exclusive control over an exported account.

## Validation performed

109 existing tests passed across tests/signedRecovery.test.ts, tests/otcSettlement.test.ts and tests/recoverySafety.test.ts. These establish existing guards, not complete exported-wallet compatibility. Findings above are code-path analysis; no funded user wallet was deliberately raced or drained.

Required new cases: drain before signing; external same-nonce replacement (matching/different/reverted); external allowance spend without owner nonce change; approval then outside spend in the same block; CDP response loss plus external activity; signed underfunding followed by later deposit; reorg of replacement evidence; seller funding abort; signed buyer-deposit replacement cleanup; immediate spending of verified payouts; and concurrent exports/requests across Arc and Base.
