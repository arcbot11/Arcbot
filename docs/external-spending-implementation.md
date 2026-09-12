# Customer wallets with outside signing access

Implemented 2026-09-12. Applies to shared website/X/TG transaction infrastructure on Arc and Base. All customer wallets are treated as potentially externally spendable, including imported wallets; safety does not depend on an export flag. Customer private-key export remains a separate, disabled feature.

## Recovery rules

- Never-signed requests cancel atomically after a verified balance/nonce conflict or definite swap simulation revert. RPC failures retain the request for recovery. Prior signed attempts exclude a request from unsigned cancellation.
- Unfunded OTC listings and version-2 purchases inspect every recorded funding attempt before releasing only their own reservations. A signing fence, successful funding, missing earlier attempt, or started payout blocks cancellation. Listing/order/wallet updates share one Convex mutation.
- Consumed nonces are discovered using bounded historical nonce reads, with eight binary-search reads per worker pass. The cursor is anchored to a finalized block hash and restarts after an anchor change. Canonical block, receipt, sender, nonce, raw transaction hash and recovered signer are checked before reconciliation.
- A matching external replacement is adopted and must pass normal receipt and delivery verification. A different finalized transaction proves the original cannot execute. Unfunded listing/purchase cleanup occurs in that same mutation; another deposit requires a new request.
- A successful replacement paying the same escrow with different terms requires operator reconciliation. A reverted replacement cannot fund the escrow and can release the original request. Never treat an ambiguous changed deposit as permission to charge again.
- Underfunded signed customer requests pause bot rebroadcasts durably. Receipt and nonce checks continue. Restoring funds does not automatically resume our broadcasts. Already broadcast/copied signatures may still execute, so reservations remain until receipt or finalized nonce proof resolves them.
- The operator recovery CLI supports `resume-broadcast --id ID --owner OWNER --hash ORIGINAL_HASH --apply`. It retries the exact existing signature and rechecks funding. Expired swaps are rejected. Existing explicit fee replacement remains bounded and uses the same nonce. No automatic platform-funded refill or new-nonce cancellation is introduced.
- Approval receipts use exact ERC-20/Permit2 Approval events instead of requiring the end-of-block allowance to stay unchanged. Nonstandard approvals without matching events retain the existing strict allowance fallback. Trading checks current authority again; completed approval stages are not automatically repeated after an external revocation, on either web or social execution.

## Display

Native balance responses carry their read time and a reservation deficit. Failed reads retain only the last display balance, never stale spendable funds. Token balances refresh periodically while visible and on returning to the tab. History identifies reconciled outside replacements and states that it is bot request history, not a complete external account ledger. Signed underfunding and outside nonce reconciliation have explicit messages instead of misleading gas-only errors.

## Boundaries

- Ordinary Base delivery keeps its current confirmation policy. Proving an original transaction permanently invalid uses finalized nonce evidence and can take longer.
- Providers must support historical account nonce reads and the relevant transaction envelope. Missing history, unsupported envelopes or delegation-related nonce changes without a discoverable sender transaction remain unresolved; no funds are released on a guess.
- A transaction already signed cannot be revoked off chain. Explicit resume is an operator action; a user can independently replace/cancel at the same nonce, after which discovery verifies it. There is no new automatic cancellation transaction.
- Customer wallet control never grants access to dedicated OTC escrow keys. Deposited inventory remains in those separate wallets. Cross-chain transfers remain non-atomic, with verified seller Base payment before buyer Arc delivery.
- Key-export authentication, encrypted delivery, immutable audit metadata and the cross-chain export fence from `private-key-export-plan.md` are not enabled by this change. No private keys were exported and no funded wallets were deliberately raced or drained.

## Rollout

Convex deployed successfully to the project's configured `aware-okapi-12` backend on 2026-09-12. Website/worker deployment to Vercel remains pending; this session did not publish the website.

Deploy the Convex mutations before deploying the website/worker build. The new website uses those mutations. The existing website can run against the additive Convex changes, but automatic nonce discovery and signed-broadcast pausing require the new website worker build.

Validation covers unsigned drains, signing/cancellation order, previous signatures, replaced/reverted deposits, approval changes, legacy and typed envelopes, resumable nonce discovery, finalized evidence, reorgs, signed underfunding followed by deposits, delivery after a pause, and preservation of unrelated holds. Tests use mocked chain state and locally generated disposable signing keys, never customer keys.

Validation results: 539 tests passed across 34 financial/API suites; the final unsigned-call refactor passed its 97 affected tests again. Application and Convex TypeScript checks passed. The production Next.js build passed. Lint passed with existing unused-variable warnings. The operator CLI help path was checked without running a recovery mutation.
