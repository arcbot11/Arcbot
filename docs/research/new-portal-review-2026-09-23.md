# New portal review and GitHub assignment investigation

Scope: local routing/index changes; X launch parsing, ownership, provisioning,
stored requests, signing, mined verification and creator-fee claims. Read-only
contract research; no wallet provisioning, signing, transactions or deployment.

## Findings

1. **P1 — New-portal launches are not implemented.** `lib/launches/contracts.ts:7`
   still selects Portal7. Preparation uses its four-argument ABI, implementation
   pointers and `0x2044` hook permission mask (`prepare.ts:55`). Successful new
   launches use selector `0x206641c0` and hooks ending in permission bits `0x60cc`.
   Old receipt/clone verification cannot validate the new contracts. Changing
   the global address alone is unsafe. Keep recovery for stored Portal7 jobs;
   select the verified adapter using the portal recorded in each job.

2. **P1 — Fee destinations are not persisted through execution.**
   `convex/walletCommands.ts` clears `feeRecipient`; `convex/wallets.ts:3865`
   freezes recipients for send operations, while launches retain source text
   and an image. `LaunchInput` has no destination field. A new adapter needs the
   resolved immutable identity, destination and platform in the accepted input,
   fingerprint, stored request, signed-call checks and receipt verification.
   The new parser alone does not implement this. This review adds explicit
   rejection at normalization and X-input conversion so a recognized assignment
   cannot silently become an old-portal launch paying the launcher.

3. **P1 — Claims do not support the new portal or assigned recipients.**
   `lib/launches/fees.ts:23` recognizes only Portal6/7 and requires the caller to
   be the original creator. Its `claim(address)` ABI and clone checks differ
   from the new splitter. `fee-service.ts:20` and
   `convex/launchExecution.ts:114` discover by creator, not fee entitlement.
   New wallet and social-vault claims require separate verified authorization
   and receipt handling. Finding a selector does not prove claim semantics.

4. **P2 — The natural-language claim-all promise exceeds execution.**
   `convex/xWalletIntent.ts` advertises “claim everything” and “claim fees from
   my launches”; `lib/launches/fee-service.ts:49` rejects an unspecified token
   when the wallet has multiple launches. Either implement resumable per-token
   claims or narrow that promise. Never add distribute/crank to manufacture
   claimable funds.

5. **P2 — New-family catalog admission bypasses historical market screening.**
   `scripts/refresh-argus-index.mjs:72` admits every verified new-family candidate
   through `dynamic.has(a)`; older candidates need market screening. This is
   documented but not equivalent index policy. Also, refreshing `snapshotAt`
   at line 90 is not evidence that market values were refreshed. Missing V4
   market coverage remains unassessed.

6. **Parser defects found and fixed in this review:** multiple alternatives
   such as `@alice or @bob`, newline-separated negation and invalid mixed-case
   address checksums were accepted by the isolated recipient parser. The
   parser now rejects those cases. It remains an input component, not a claim
   authorization mechanism. Unquoted description fields end at semicolon or
   newline; keep operative instructions outside descriptions.

## Wallet and recovery checks inspected

Stored request authorization uses the stored owner/wallet and command rather
than accepting a replacement client command. X recipient provisioning resolves
an immutable X user ID and uses the existing idempotent wallet reservation.
Launch execution reconciles signed/pending jobs before preparing replacements,
checks fingerprints, accepted calldata, nonce, gas and mined identity. Existing
creator-claim encoding uses only `claim(address)` and validates its target and
calldata; it does not insert a crank. These are existing-path protections, not
proof of an unimplemented new-portal path.

## Independently obtained on-chain evidence

Fresh reads at block **22428694**, chain 5042:

| Item | Observation |
|---|---|
| Portal | `0xeed7559b8a6abf64427dc41cb5cc6400109c5d93` |
| Registry | `0x58398c03c7a6240d8aa1ced42592933ad857843a` |
| Launch count | 18 |
| Pool manager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| Position manager | `0x6049c9a0e26405c0985f9e3685c87d0ae917f82b` |
| Lock vault | `0xf61641b4aa3c7ace1084b8d4380920eccbfd7af2` |
| Treasury | `0x1d79df4e2e8bf1847e9a07bbaa9aed67ea09767f` |
| `treasuryBps()` | 3000 on portal and sampled COOLCAT splitter |
| Tick spacing | 200 |
| Default quote | `0x3600000000000000000000000000000000000000` |

The sampled splitter has dispatch selectors matching `claimCreator()` and
`claimDividends()`. Exact credit accounting, claim authorization and events
still need verification; no claim was submitted. Eighteen successful creation
transactions were fetched and their calldata inspected. The first remains
NOFEE, creation transaction
`0xb044648aa5ca14a4eb98fa9bfd25c181c01d491e7b6550fe2cdb1849848e05e9`.

### GitHub assignments are real and use numeric identity

Successful DEGEN creation:
`0x03bde5d2e1c8a32ea9f7a328f3032a77e53d26fed193cc495c89e1364d29a9c7`.
Its calldata contains the left-aligned platform `github`, numeric ID
**276738470**, and recipient `0x21a66ca1bb7f15171f4ab264a7858251a87d2954`.
GitHub's public user-by-ID API independently resolves that ID to
**degenanddreams**. This is not an inference from the launch's token name.

That recipient is a deployed contract, not an Argos Bot wallet. Its runtime
restricts sweep calls to controller
`0x10634798c7f5c37009026bab3f81773389f4e97d`.
Read-only calls to both `vaultOf(bytes32,uint256)` and
`predict(bytes32,uint256)` with `github` and 276738470 return the same recipient.
The controller's `attestor()` returns
`0xf5a088fd51f93f798ad3f11e13b737ded990eeeb`.
This indicates a separate social-identity claim system; URL ownership alone
does not authorize the bot to sweep it. Signature format, replay protection,
attestation endpoint and organization support remain unverified.

Implementation added here accepts `assign to https://github.com/alice` and
repository/subpage URLs, taking their first path segment as owner. It resolves
that owner through GitHub's API and rejects identity changes, redirects,
unsafe URLs, non-user accounts, imprecise IDs and lookup failures. Persist the
resolved ID before signing when the adapter is implemented. GitHub login names
must never be mapped to same-spelled X accounts.

## Verification and limitations

Initial focused run: **211 passed, 1 live test skipped**, across 12 test files:
discovery, quotes, legacy launch preparation/execution/acceptance/mined checks,
creator claims/recovery, X allocations and recipient parsing. These do not
verify new-portal launches or social claims end to end.

After wiring the legacy-assignment guards, a second run passed **94 tests**
and failed **2** in `launchAssignHolders.test.ts`. Both failure behaviors were
reproduced with this review's guard removed: the Japanese ticker example is
rejected, and `assign fees to holders` fails current allocation normalization.
This is an existing command/test-contract mismatch, not a clean full-suite
result. The new GitHub tests (23) and recipient tests (14) all passed.
Final recipient/X allocation rerun: **60 passed**. Source-only TypeScript check
still fails at `tests/argusIndexScreen.test.ts:2`: the existing new index helper
`scripts/lib/argus-index-screen.mjs` has no declaration file (TS7016). No remaining
type errors were reported in the GitHub/recipient changes. `git diff --check`
passed.

The official app and ABI endpoint returned HTTP 429/browser challenges; the
browser tool timed out. Explorer marks the new portal/controller unverified.
Metadata retrieval attempts failed and Sourcify partial-match returned 404.
No source audit or complete launch ABI recovery is claimed. Raw read-only
evidence is retained privately, excluding secrets and signed transactions.

Sources: [portal](https://www.arcexplorer.org/contract/0xeed7559b8a6abf64427dc41cb5cc6400109c5d93),
[GitHub-assigned launch](https://www.arcexplorer.org/tx/0x03bde5d2e1c8a32ea9f7a328f3032a77e53d26fed193cc495c89e1364d29a9c7),
[GitHub identity](https://api.github.com/user/276738470).
