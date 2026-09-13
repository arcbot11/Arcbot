# System review — 2026-09-12

Follow-up: findings 1–5 below have since been addressed locally. See `external-spending-implementation.md` for the corrected behavior and deployment status. This report preserves the evidence from the original review.

Review of the current committed application, with particular attention to the newly implemented safeguards for customer wallets that can spend outside the bot. Application code was not changed, nothing was deployed, no keys were exported, and no transactions were signed or submitted during this review.

## Assessment

The shared execution and escrow infrastructure has meaningful protections, but customer key export should remain disabled. Five actionable findings remain: two high-priority recovery/accounting problems and three medium-priority authorization, messaging, and operator-tool problems. The empty live recovery queue is encouraging but does not exercise these edge cases.

## Findings

### 1. High — Missing receipt can cause recursive recovery

Location: `lib/otc/recovery-runtime.ts:55`, called by `discoverConsumedNonce` and `advanceTransaction`.

When a finalized block contains the original transaction but the receipt endpoint still reports it missing, nonce discovery finds the original hash. Reconciliation calls `advanceTransaction` again. That repeats receipt lookup, nonce discovery, and reconciliation without a recursion or elapsed-time bound.

An isolated runtime reproduction performed five receipt lookups and four nonce-search passes inside one advance call before the test deliberately stopped it. The documented eight-read nonce-search bound does not bound this recursion. A provider visibility disagreement can therefore occupy the worker until a timeout and delay unrelated recovery. This can affect ordinary bot transactions; exported keys are not required.

Required correction: treat finding an already-known hash as a pending receipt result, return control to the worker, and bound the entire recovery invocation. Do not recursively re-enter the same transaction's recovery path.

### 2. High — Indirect escrow funding can be classified as unfunded

Location: `lib/otc/signed-recovery.ts:97`; automatic cleanup is called by `convex/otc.ts:109`.

The changed-payment guard checks whether the replacement transaction's top-level recipient equals the escrow address. It misses a transaction to the Arc USDC contract that calls `transfer(escrow, amount)`. The original native-USDC transfer and the external ERC-20 transfer use different top-level recipients even though both can credit the same escrow.

The model reproduction supplied a successful same-nonce USDC-transfer replacement for a listing deposit. Reconciliation cancelled the request and cleanup marked the listing cancelled with zero returned funds. The encoded transfer amount was 99.999000 USDC. This was a state-machine reproduction with mocked successful-chain evidence, not an actual transfer.

Impact: funded escrow inventory can disappear from the active listing/accounting workflow and require manual return or reconciliation. This does not establish that another user can steal the deposit.

Required correction: examine relevant receipt delivery evidence and supported indirect transfer paths before declaring funding absent. Quarantine uncertain contract-mediated payments rather than inferring “unfunded” from the top-level recipient alone. Preserve funds and original-request linkage until reconciled.

### 3. Medium — Counterparty can retry an externally cancelled customer gas payment

Location: `lib/otc/escrow-model.ts:140` and `:148`; payer selection is at `:50`.

Either the seller or buyer can invoke settlement retry. The external-cancellation guard prohibits new attempts for `fund` and `deposit`, but allows them for `topup` and `arc_topup`. Those steps charge customer wallets rather than the dedicated escrow wallet.

The model reproduction had the seller retry a buyer gas top-up after a different finalized transaction had cancelled its nonce. The next attempt still used the buyer's wallet. The existing accepted gas budget limits the amount, but the counterparty can restart a payment the payer explicitly replaced externally.

Required correction: distinguish escrow-owned payouts from customer-funded recovery payments. Require the paying owner's explicit renewed authorization for externally cancelled customer top-ups; do not let the other participant provide that authorization.

### 4. Medium — Paused social requests still appear to be processing

Location: `app/api/arc/command/route.ts:74`; wallet history excludes approval legs at `app/api/otc/route.ts:76`.

The social command endpoint returns `pending: true`, `processing: true`, and “Arc transaction pending. Check wallet history.” for a signed transaction with a persisted `broadcastPausedAt` and an underfunding note. An isolated API reproduction confirmed this exact response and the absence of an attention field.

Waiting or refunding the wallet does not resume the bot's broadcasts: explicit recovery is required. The endpoint therefore fails to tell X/TG processing logic that action is needed. Approval transactions also remain excluded from wallet history by design, so pointing an affected approval request to history is particularly unhelpful.

Required correction: propagate an actionable paused/attention state through social execution and notification handling. Keep the warning that a previously broadcast signature may still execute. Preserve the policy against announcing an unconfirmed success, without describing an intentionally paused request as actively processing.

### 5. Medium — Documented operator recovery command cannot load runtime

Location: `lib/otc/external-spending.ts:6`; loader `scripts/register-typescript.mjs`; recovery imports in `scripts/recover-wallet-request.mjs:16`, `:24`, and `:28`.

The new constructor uses the TypeScript parameter property `constructor(readonly reason: WalletChangeReason)`. Native Node strip-only execution rejects it with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. This was reproduced using Node 24.13.1 and the documented TypeScript registration loader.

The loader resolves imports but does not transform that syntax. CLI help exits before importing the runtime, so a successful help check misses the failure. Recovery operations that dynamically import the runtime, including resume-broadcast, fee replacement, and nonce reconciliation, are affected. The website/Convex bundlers handle the syntax, so this is an operator execution problem rather than evidence of a website build failure.

Required correction: use erasable TypeScript in shared native-Node modules or provide a consistent transforming runner. Validate a read-only runtime import with the exact documented command, rather than checking only `--help`.

## Protections reviewed

- Never-signed cancellation checks signing fences and prior signed attempts, and performs reservation cleanup atomically in Convex.
- Ambiguous CDP signing recovery retrieves the original result before treating a request as a fresh transaction.
- Signed customer underfunding persists a broadcast pause; it does not falsely revoke a signature that could already be circulating.
- External replacements must pass signature, sender, chain, nonce, canonical-block and receipt checks; matching calls retain normal delivery verification.
- Approval receipt events avoid relying solely on allowance at the end of a block. Later execution still checks current authority and avoids repeating an approval sequence indefinitely.
- Dedicated OTC escrow accounts remain separate from customer wallets. Customer outside spending cannot directly withdraw already-deposited inventory from those accounts.
- Accepted OTC purchase reservations and payout destinations remain durable. Seller Base payment precedes buyer Arc delivery in the current settlement flow.
- Native and token balances refresh, while failed reads can retain the last display value. A displayed prior balance is not sufficient authorization to spend it.
- Web write authentication, Telegram ownership/session handling, and strict policy on sensitive pages have regression coverage.

These observations are scoped source/test findings, not a claim of exhaustive security proof.

## Live read-only checks

Snapshot beginning 2026-09-12 20:13 UTC, with provider checks later in the same review:

| Surface | Result |
| --- | --- |
| Website `/`, `/wallet`, `/otc`, `/guide` | HTTP 200 |
| Wallet and OTC script policy | Enforced nonce-based strict CSP, private/no-store responses |
| Deployed frontend | Updated balance/history strings present in live wallet JavaScript |
| Convex recovery work selection | No queued work returned by the work query at the snapshot |
| OTC market | 3 listings; 624.988406 USDC available; 1,123.928004 USDC sold |
| X credentials | HTTP 200; authenticated as `TheArgosBot`; configured user ID matches |
| Telegram | `The_ArgosBot`; expected argosbot.io webhook; zero pending updates; no recorded webhook error |
| CDP | Account listing succeeded; signing/export not tested |
| Arc runtime RPC | Chain 5042; latest block approximately 2 seconds old |
| Base runtime RPC | Chain 8453; latest block approximately 2 seconds old |
| ArgusPad RPC read | Chain 5042 and fresh head; transaction submission not tested |

A direct probe of the configured primary Arc URL failed once; the configured runtime client subsequently read Arc successfully. That establishes runtime read availability at the later check, not which provider served it or that every provider is healthy. Telegram's check returned valid health results but its local Node process then emitted a Windows libuv shutdown assertion; no corresponding Telegram webhook failure was reported.

The work query's empty result does not prove the absence of older terminal failures or establish complete recent-activity coverage. Read-only API success does not prove live transaction signing, X posting, or mobile sign-in completion.

## Validation

- 539 existing financial/API tests passed across 34 files.
- 166 existing authentication and Telegram tests passed across 14 files.
- Four isolated review reproductions confirmed findings 1–4. Their passing assertions describe problematic current behavior, not successful fixes.
- Application and Convex TypeScript checks passed.
- Targeted lint of changed execution/API files: zero errors; one unused-parameter warning in the runtime.
- Native Node runtime import failed as described in finding 5. Using explicit TypeScript transformation allowed the read-only chain checks, but no runner or source fix was applied.
- Review fixtures are local, ignored files under `.deployment-private/review-20260912/`; no customer keys or transaction signing are involved.

No new production build was run in this review. No funded concurrency/drain tests, private-key export tests, full-history chain reconciliation, or fresh end-to-end mobile OAuth sessions were performed.

## Remaining architectural limits

Private-key export remains unimplemented/disabled. Its separate fresh-authentication, encrypted delivery, export fencing, audit, and device-testing requirements still apply. The external-spending safeguards do not by themselves provide a safe key-export interface.

Cross-chain OTC settlement remains backend-controlled and non-atomic. The Base confirmation delay is a confirmation policy, not Ethereum settlement finality. A signed transaction cannot be revoked by changing database state. Finalized nonce conflict proof can legitimately take longer than ordinary transfer confirmation.

Unrecognized hooks/taxes, unsupported transaction envelopes, missing historical nonce data, and account-delegation nonce changes remain special recovery/routing cases. Bot transaction history is not a complete ledger of externally initiated wallet activity.

Recommended priority: fix the recursion and escrow-funding classification first, repair the operator runner, then close the top-up authorization and social status gaps before enabling customer exports.
