# New portal: follow-up implementation review

Reviewed the current working tree after GitHub parsing and assignment-rejection
guards were added. This is a review, not a deployment or a contract-source audit.
No production code was changed, no wallets were provisioned, and no transactions
were signed or sent. Temporary mocked reproduction tests were removed afterward.

## New, reproduced defects

### P1: assignment guard can silently fall back to creator-only launch

`lib/launches/x-fee-recipient.ts:41` only invokes validation for destinations
starting with `@`, `0x` or an HTTP URL. This bypasses the parser's own rejection
for the ordinary URL spelling `github.com/alice/project`.

Reproduction:

```text
Launch Cat CAT; assign to github.com/alice/project
```

The recipient parser throws when called directly, but the actual guard returns
success. Both `normalizeLaunchFeeOptions` and `launchInputFromXCommand` accept
the text and produce `creatorBps: 10000` with no recipient. This permits an
otherwise valid launch to proceed with the launcher's wallet receiving the
creator allocation instead of stopping for the requested assignment.

There is a second path at `x-fee-recipient.ts:12`: the description mask consumes
the entire remainder of a line, including a subsequent sentence:

```text
Launch Cat CAT; description: Cute cat. Assign to https://github.com/alice/project
```

The parser returns undefined, the guard accepts it, and both execution-input
entry points again return 100% creator allocation. Do not silently interpret
ambiguous assignment text as no assignment. Recognize assignment intent before
destination validation, and reject unresolved/ambiguous clauses while retaining
the distinction between explicitly quoted metadata and operative instructions.

### P2: dynamic-portal validation failures are incorrectly reported as pending

`lib/arc/argus-discovery.ts:34-48` adds seven specific deterministic validation
errors. Neither `app/api/arc/command/route.ts:33` nor
`lib/arc/trade-errors.ts` recognizes them. The generic catch at route line 184
therefore returns pending, even when preparation failed before reservation.

Mocked API probes reproduced this for all seven messages: record length,
registry mismatch, missing contract code, hook mismatch, unsupported pool
configuration, missing quote-token code and pool-ID mismatch. Every response was:

```json
{"pending":true,"message":"Arc request is waiting for verification."}
```

The probes asserted that repository preparation and transaction advancement
were never called. Users can be left waiting for a transaction that does not
exist, until request expiry or another terminating condition. Classify these
local pre-transaction failures explicitly; retain pending behavior for genuinely
uncertain signed/submitted transactions and provider failures.

## Reconfirmed release blockers (unfinished implementation)

### P1: launches still target the old portal

`lib/launches/contracts.ts:7` selects Portal7, and `prepare.ts:55` mines the old
hook mask. Encoding, prediction, receipt verification and clone checks all use
the old contracts. `LAUNCH_EXECUTION_ENABLED` remains true for that legacy path.
The new trading adapter does not migrate launch execution. Implement a complete
versioned portal adapter; changing the global address alone would also interfere
with recovery of stored legacy jobs (`execution-checks.ts:20`).

### P1: X/GitHub fee assignment is not connected to persisted signing terms

`convex/walletCommands.ts:261` still removes `feeRecipient`.
`convex/wallets.ts:3865-3873` stores destination addresses for transfers, but only
source text/image for launches. `LaunchInput` and its fingerprint contain no
resolved fee beneficiary. `resolveGithubFeeRecipient` is called only by tests.
No production path resolves and persists a GitHub ID or selects its portal vault.
Well-formed assignment commands deliberately fail as unavailable; the new
guard-bypass finding above is the exception.

Before enabling assignments, persist platform, immutable account identity and
resolved destination in the accepted input, fingerprint and signed-call checks.
Provision an X recipient's Argos wallet through the existing X-ID reservation.
GitHub vaults have a different claim authority; do not infer an X wallet from a
same-spelled GitHub login. Organization repositories currently fail the explicit
`record.type === 'User'` check; organization claim support is unresolved.

### P1: new-portal and assigned-recipient fee claims are unsupported

`lib/launches/fees.ts:23` accepts only Portal6/7 and requires original creator
ownership. Its `claim(address)` encoder and clone checks are incompatible with
the new splitter. Discovery filters by creator (`fee-service.ts:20` and
`convex/launchExecution.ts:114`) rather than fee entitlement. New direct-wallet
and social-vault claims require verified adapters and entitlement discovery.
Selector matches for `claimCreator()` and `claimDividends()` from prior research
do not establish the complete accounting or signature authorization scheme.

### P2: claim-all is advertised but multiple launches are rejected

`convex/xWalletIntent.ts:351` promises that "claim everything" claims all
supported native-pair fees. Current X/Telegram requests route through
`convex/wallets.ts:3890` to `app/api/arc/command/route.ts:88`, which calls
`runCreatorClaim`. At `lib/launches/fee-service.ts:49`, an unspecified token with
multiple discovered launches is rejected. The older downstream claim workflow
does not rescue this path because execution returns through the Arc service
first. Implement resumable per-token claims or correct the advertised behavior.

## Other review results

| Area | Result |
|---|---|
| Wallet authority | Stored request owner, active wallet ID and source checked; arbitrary replacement client commands are not accepted by the Arc endpoint. |
| X recipient provisioning | Existing resolver obtains immutable X ID and uses the idempotent wallet reservation; new fee assignment does not yet invoke it end to end. |
| GitHub identity | Strict host/scheme, numeric safe-integer ID, matching login and no redirect following; resolution alone grants no claim authority. |
| Signing | Legacy accepted terms, chain, target, calldata, value and gas bounds checked; new portal has no equivalent integrated path yet. |
| Recovery | Signed-job reconciliation and canonical receipt checks inspected; relevant recovery suites passed. Preserve per-job portal/version during migration. |
| Claim-only behavior | Existing creator-claim path encodes only claim; its signer and receipt checks validate target and beneficiary. Separate reward-distribution paths exist and must not be substituted. |
| Dynamic trading | Exact dynamic fee flag, registered hook/pool identity, manager, quote and code presence checks retained. Trading/quote/discovery suites passed; no live trade sent. |
| Index policy | New-family admission bypasses historical volume/liquidity screening at refresh script line 72. Documented policy difference, not proof all listed tokens are liquid. |
| Index freshness | Line 90 refreshes snapshotAt on known dynamic tokens without refreshing their market metrics. Do not present that timestamp as fresh valuation. |
| Contract audit | No verified source/full ABI was available in prior investigation. No claim of source-level security audit or new social-claim correctness. |

## Verification

- 20 focused test files: **275 passed, 1 live test skipped**. Covered wallet
  signer policy, signed recovery, wallet continuation, transaction signing,
  launch repository/acceptance/execution/mined/gas checks, X launch service and
  allocations, creator claims/recovery, recipient parsing, routing and index.
- **7 isolated mocked API probes** confirmed the pending-response defect above.
  Passing probes mean the bug was reproduced, not that the behavior is correct.
- Direct pure-function probes confirmed both assignment-to-creator fallbacks;
  no execution or wallet side effects were performed.
- Prior holder-assignment test mismatches remain recorded in the earlier
  review. They were not fixed by these changes.
- Source-only TypeScript check **failed** with TS7016 at
  `tests/argusIndexScreen.test.ts:2`: no declaration for
  `scripts/lib/argus-index-screen.mjs`. No other errors were reported in that run.

Release assessment: **not ready to enable new-portal launch/assignment/claim
execution**. Existing passing legacy tests and new trading support are not
end-to-end evidence for those unfinished features.
