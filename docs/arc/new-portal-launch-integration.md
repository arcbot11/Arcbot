# New portal X launch integration — pending contract interface

Requested behavior: launch through `0xeed7559b8a6abf64427dc41cb5cc6400109c5d93`,
assign fees to a supplied wallet or to the Argos Bot wallet for an authenticated
X handle, provision the recipient wallet when absent, and support explicit fee
claims without any distribute/crank transaction.

Completed independently: `launchFeeRecipientFromXText` recognizes assign,
allocate, direct, send and route fees to an X handle or nonzero wallet address.
Its tests reject metadata, quoted instructions, negative assignments, multiple
recipients, truncated handles and malformed addresses. It is not yet connected
to execution: the old portal must never silently receive a redirected launch.

Existing `resolveXRecipient` in `convex/xReplies.ts` resolves the X API identity,
upserts the immutable user ID, calls `ensureWallet`, and binds the recipient
address to the interaction. Reuse this path, including its retry binding.

Verified interface differences as of September 23, 2026:

- COOLCAT's successful launch transaction is
  `0x565e99bef533964156e03eb8f0c876697c5387e1464ffaab697160fe238d04cb`.
  Its launch selector is `0x206641c0`; its calldata does not match the old ABI.
- Among the old portal ABI's function selectors, only `registry()` appears in
  the new portal's runtime. Replacing only the configured address is invalid.
- New hook permission bits differ (`0x60cc` vs the old miner's `0x2044`).
- The new splitter `0xb4f6f4934673fc0803c22d9de929aa1e4f1938c7` is not the old
  minimal clone. Its dispatch table does not contain the old `claim(address)`
  or credited-balance getters. Token, quoteAsset, payoutAsset and portal getters
  were read successfully; creator/feeRecipient getters from the old path failed.
- Explorer reports no verified source/ABI. Sourcify full-match metadata was not
  available. The runtime's IPFS metadata CID is
  `QmUbVzzaNejFSrFdMVYxxGU6gGBfaawf6iGNU2XfBd6fVs`; attempts to retrieve it failed.

Required to finish: authoritative launch parameters and prediction/mining ABI,
fee-recipient assignment structure and permissions, and splitter claim ABI/events.
Then update encoding, preparation, signed-call checks, receipt verification,
recipient persistence and claim discovery together. Preserve old signed-job
reconciliation. Claims must enforce the caller's entitlement and encode only
the verified claim function; never insert a crank to create claimable funds.

Further independent investigation recovered a successful GitHub assignment:
the DEGEN launch stores platform `github`, numeric user ID `276738470`, and
vault `0x21a66ca1bb7f15171f4ab264a7858251a87d2954`. GitHub resolves the ID to
`degenanddreams`; the deployed social controller's `vaultOf` and `predict`
both return that vault. This is a separate social-vault claim system, not an
Argos Bot X wallet. The splitter has selectors matching `claimCreator()` and
`claimDividends()`, but complete claim semantics remain unverified.

GitHub profile/repository parsing and numeric-ID resolution are implemented
and tested. Assignment commands are explicitly rejected at both X command
normalization and launch-input conversion until the new execution adapter is
verified; they must not silently fall back to creator-only legacy launches.
See [the review and research evidence](../research/new-portal-review-2026-09-23.md).

No launch configuration switch, deployment, wallet provisioning or transaction
was performed during this implementation work.
