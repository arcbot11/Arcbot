# Launch review after the recovery fixes — 2026-09-15

Scope: current local launch input/parsing, website preparation and execution, X orchestration, Convex authorization and draft lifecycle, shared signing/recovery, Portal verification, paired pricing, receipt validation, indexing and creator claims. This was a review, not a deployment or production activity audit. Launch execution remains disabled.

## Remaining findings

### 1. High — X converts retryable launch failures into final command failures

`app/api/arc/command/route.ts:81` returns HTTP 200 with `ok:false` for every LaunchError, including WALLET_BUSY, IMAGE_UNAVAILABLE and STALE_SIMULATION. The new launch service deliberately leaves an accepted run running for those failures. `convex/wallets.ts:7050` nevertheless marks the original X wallet request failed and returns its final error reply. Later `authorizeArcCommand` rejects failed requests, while the independently scheduled launch worker still sees a running run.

This can interrupt the next unsigned step after an approval has already completed, or prevent the normal success reply for work whose signing already started. A retryable error after acceptance must remain pending throughout the API, wallet request and X reply pipeline. Pre-acceptance validation failures can still be final.

Evidence: three isolated API diagnostics reproduced terminal responses for the retryable error codes; the worker retry behavior and downstream failed-request authorization were inspected and covered separately by regression tests. No live X post was sent.

### 2. Medium — new hook code is not subject to an explicit review gate

`lib/launches/contracts.ts:32` pins token, splitter and locker implementations, but not the Portal's mutable hookStore or a reviewed hook-code hash. `lib/launches/prepare.ts:101` accepts the init-code hash returned by the Portal. Prediction proves that the resulting address matches that code, not that the code was reviewed by this project.

The saved September 13 ABI bundle documents hookStore changes on Portal 6 behind its four-hour admin timelock. A new draft can therefore accept a new hook implementation while the other three implementation checks pass. Existing accepted drafts have prediction consistency checks, which is a separate protection.

Evidence: a mocked preparation diagnostic accepted two different hook init-code hashes with identical Portal bytecode and other implementation pointers. This does not establish malicious code or a current on-chain pointer change. Before enablement, explicitly pin/verify the approved hook code or make that trust decision explicit.

### 3. Medium — a lost execute response leaves automatic frontend tracking inactive

`components/LaunchPreparation.tsx:58` starts polling only after a response has supplied `draft.run.status === "running"`. If acceptance succeeds but the execute request times out, returns a temporary error or loses its response, the catch at line 90 only displays an error and retains the pending write. It does not automatically load the saved run. The user must choose Reload or Retry manually even though the backend may be working.

The durable request ID and transaction locks survive. The issue is missing progress/completion tracking, not duplicate execution. Reconcile the saved request after an uncertain execute response and begin polling its confirmed state. Evidence: frontend state-flow inspection.

### 4. Medium — terminal runs still leave draft lifecycle dead ends

After success, the form is disabled and the New draft condition at `components/LaunchPreparation.tsx:145` excludes completed drafts. Only reload remains until the draft expires or the user manually removes its URL parameter.

For stopped runs, `convex/launchExecution.ts:77` sets only the run to blocked; its draft remains executing. `convex/launchDrafts.ts:47` counts those drafts against the quota and cancellation refuses executing drafts. Ten stopped runs can exhaust the quota even when all transaction work is terminal.

Evidence: server rendering reproduced the missing New draft button after success; a Convex fixture reproduced the quota rejection and refusal to cancel the retained executing drafts. Update the draft and run lifecycle consistently while retaining transaction history and signing guards.

### 5. Medium — execution enablement would leave misleading preparation-only copy

`components/LaunchReview.tsx:51` unconditionally says no transaction will be signed or sent. The page heading also says execution is disabled. Neither changes with the execution flag, although that flag exposes Confirm launch in the editor. This wording is accurate today while execution is disabled, but becomes misleading at enablement. Separate preparation-only instructions from actual launch confirmation copy before release.

Evidence: rendered review tests and direct inspection of the execution button and page heading.

### 6. Medium, remaining limitation — paired valuation is not manipulation resistant

`lib/launches/quote.ts:48` now filters dust pools and compares candidate depth, which fixes the reproduced V3-over-V4 selection problem. It still derives price from a single pinned spot snapshot. Virtual reserves do not prove liquidity extends over a meaningful tick range, and one qualifying market is enough. There is no TWAP, independent oracle or historical consistency check.

A temporary price distortion can change the paired-token amount and initial/bond valuation accepted for a dollar-denominated launch. The website does show the exact paired-token amount before web confirmation; X commands have no equivalent interactive review. Add suitable historical/independent checks, or limit the initial rollout to USDC. No price-manipulation transaction was attempted.

## What checked out

- Scoped deployment gas policy, the total gas cap, and the raw-estimate versus saved-allowance comparison.
- Deadline enforcement for new steps and atomic unsigned cancellation at the signing boundary; recovery of an already-started signature remains allowed.
- Shared wallet reservation and key-export guards.
- Fixed 1% buy/sell taxes, 100,000-token dividend threshold, allocation parsing and supported pair parsing.
- Exact transaction calldata binding, receipt/creator/pool/parts validation, and verification before indexing.
- The creator-discovery incomplete flag and preservation of known same-wallet tokens.
- Launch and hidden-page gates remain disabled as intended.

## Validation and limits

- 427 current regression tests passed, plus six targeted diagnostic cases. The combined run reported 480 passes because two diagnostic fixtures also repeated 47 existing tests.
- Diagnostic cases intentionally assert the current defective behavior. Their success is evidence of reproduction, not evidence that these findings are fixed.
- Temporary diagnostic files were removed after recording results. Application code was not changed in this review.
- The preceding implementation pass completed website/Convex TypeScript checks. No fresh full production build, live RPC simulation, mainnet pointer verification or funded launch was performed in this review.
- Arc connectivity and a funded end-to-end setup/approval/launch/receipt/indexing test remain readiness requirements before enabling launches.
