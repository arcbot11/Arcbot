# Launch infrastructure: preparation foundation

Implemented locally on September 13, 2026. No deployment, environment change, transaction signing, token deployment, or customer feature enablement was performed.

## Built

- `lib/launches/input.ts`: strict, shared launch input validation; canonical amount formatting; immutable owner/wallet/input fingerprints. Supply, quote, creator, Portal and salts cannot be injected through customer input. USDC is a reserved ticker. Other duplicate tickers are not rejected solely for duplication.
- `lib/launches/contracts.ts`: reviewed Portal #6 ABI subset, code hash and implementation addresses. Defaults are USDC, one billion tokens, $2,500 opening FDV and $45,000 bond FDV. Portal #7 is identified but not selected or enabled.
- `lib/launches/prepare.ts`: a read-only RPC interface with no broadcast/signing methods. Verifies chain/checkpoint, Portal code, reviewed pointers, USDC approval, nonce, available funds and per-creator reward configuration. Mines a hook salt locally, verifies predictions through the Portal, and refuses already-deployed predictions.
- Preparation returns ordered reward-configuration, approval and launch calls. If prerequisites are missing, it reports `needs_setup` with an incomplete total, instead of claiming a successful deployment simulation or inventing a full gas quote. Existing sufficient allowance avoids an unnecessary approval. Native and ERC-20 USDC are not counted as separate balances.
- `convex/launchDrafts.ts` and its schema: owner-bound draft creation, lookup, editing, cancellation, stable salts and request idempotency. Edits require the expected revision, preserve the salt and expiry, and discard old previews. A retry with identical edited settings is idempotent. Concurrent preparation has a short computation lease, stale previews cannot overwrite a newer revision, and editing/cancellation invalidates in-flight preparation. An edit retains any active computation throttle until the original worker ends. Drafts do not reserve money or alter transaction locks.
- `/api/wallet/launches`: authenticated GET plus create/update/prepare/cancel POST operations. Updates require a positive integer revision and fully validated input. Writes use existing session, origin, CSRF and canonical wallet checks. Identity is derived from the session; clients cannot supply a replacement owner or wallet. Slow preparation rechecks the session before saving. Request bodies are bounded and raw provider errors are not exposed.
- `/wallet/launch`: dynamic, no-index preparation page that returns 404 with the existing feature flag off. No navigation or bot menu links were added. The form collects metadata, an existing IPFS image reference, allocation text and optional creator-buy USDC. The review shows resolved percentages, fixed taxes, the 100,000-token dividend minimum where applicable, creator wallet identity, and available funds/gas from a current preparation. Unknown setup totals are labelled as incomplete rather than zero. Metadata is escaped and images use the existing protected image proxy.
- The preparation UI retains a failed request for an identical retry, supports loading the saved draft after an uncertain response, discards component state when the signed-in wallet changes, and aborts stale browser requests. Draft IDs are stored in the page URL; metadata is not persisted in browser storage. Editing hides the old quote immediately. Expired previews require a manual fresh simulation; there is no automatic pool/RPC polling loop.

## Allocation and fixed-tax update

All new customer launches use 1% buy tax and 1% sell tax. Omitted tax fields default to these values; alternative values are rejected. This does not alter existing tokens or historical operator scripts.

`lib/launches/allocation.ts` parses a dedicated allocation field shared by future interfaces. Supported destinations are creator, buyback/burn, holder dividends and liquidity, with common aliases. It accepts numeric percentages (two decimal places), number words, half/quarter/third fractions, all/everything, even splits, percentage ratios and an explicit remainder. Omitted allocation defaults to creator. Otherwise any unassigned remainder goes to creator, unless creator was explicitly excluded. Conflicting assignments, unknown destinations and totals above 100% require clarification. Equal splits use stable basis-point rounding.

Examples:
- `25% burn` -> 75% creator, 25% burn.
- `half creator, rest evenly between burn and holders` -> 50% creator, 25% burn, 25% dividends.
- `spread evenly` -> 25% in each of the four destinations.
- `30% holders, 20% liquidity` -> 50% creator, 30% dividends, 20% liquidity.

The service stores canonical percentages, not free text. The future confirmation interface must show that resolved allocation, including the default remainder. This parser does not enable launch commands in X or Telegram.

The standard dividend minimum is fixed at 100,000 tokens (0.01% of the one-billion-token supply). Input defaults to this constant and rejects overrides. Dividend launches configure the rewards registry with 100,000 tokens in 18-decimal units. Launches without dividends retain disabled rewards (mode 0 and on-chain minimum 0); they do not enable dividends merely because the policy minimum exists. This is a token-count filter, not a USD threshold. Existing tokens and operator scripts are unchanged. Older preparation drafts containing another minimum must be recreated; no preview is silently reused with changed settings.

## Disabled boundary

`ARGUS_LAUNCH_PREPARATION_ENABLED` is opt-in and was not added to any live or local environment. Both the website route and Convex handlers refuse preparation unless explicitly enabled in their own environment. The current local tests set it only inside isolated test processes.

Execution is hard-disabled in code. There is no execute/confirm/sign/broadcast API action, launch signing worker, scheduler, or customer launch button. The gated form only saves drafts and requests read-only simulations. Enabling the preparation flag does not enable transactions. X/TG launch suppression and all existing trading/OTC behavior remain in place.

The shared Arc RPC validation function's parameter type was narrowed to the two read methods it uses. Its runtime behavior did not change.

## Validation

- Draft-edit/review update: 156 isolated launch tests pass, including edit replay, stale revision rejection, edits during simulation, canonical form round-trips, preview identity/expiry checks, escaped review metadata, incomplete funding display and the disabled page. Review markup was tested with React server rendering; full browser interaction and responsive visual verification remain for an isolated staging environment. No production feature was enabled.
- The draft-editor production build, project/Convex TypeScript and targeted lint passed. Existing unused-variable and local page-data certificate warnings remain. The build required the same permitted filesystem escalation as the earlier build; no deployment or environment changes were made.
- Allocation/fixed-tax update: 121 isolated launch tests passed, including 64 allocation and fixed-tax tests; project and Convex TypeScript and targeted lint passed. The earlier production build below predates this parser update.
- 57 new isolated tests cover input/ABI encoding, salt mining, reward transitions, allowance handling, owner substitution, replay/idempotency, stale revisions, cancellation, concurrent preview leases, changed chain/nonce/pointers, false approval results, and the disabled API boundary.
- Four existing RPC tests and fifteen existing launch-suppression tests also passed: 76 tests total.
- Full project TypeScript, separate Convex TypeScript, targeted lint and the local production build passed. The build retained unrelated existing unused-variable warnings and local certificate warnings from background page-data reads. The initial sandboxed build could not resolve esbuild dependencies; the permitted local build completed outside that filesystem restriction. No deployment occurred.
- A separate read-only Arc mainnet simulation passed at block 20655462. It predicted an address and returned a successful launch simulation with a 3,542,242-unit gas allowance. No signatures, transactions or Convex mutations were made. It used placeholder image metadata; it did not verify an actual uploaded image.

## Remaining before customer launches

1. Image upload validation, storage/pinning, retention and image ownership/availability checks. The current backend accepts a syntactically valid IPFS reference; this does not prove that it contains an image.
2. Finish the website form with image upload/pinning and verified image availability; add final execution confirmation and progress/history after the execution service exists. The draft editor and preparation review are built, but do not offer execution or validate that an IPFS reference actually contains an image.
3. Durable transaction states, per-wallet funds/nonce serialization, actual approval/configuration execution, CDP signing recovery and external-spend reconciliation. These must use the existing transaction infrastructure rather than introducing a separate unchecked sender.
4. Revalidate balance, nonce, allowance, reward configuration, implementation identity and preview expiry immediately before signing. The hook init-code hash is recorded and its predicted address is checked, but a reviewed hook-code change policy still needs to be enforced by the future execution service. A preparation snapshot is not signing authorization or an on-chain lock.
5. Receipt/finality verification, creator and per-token deployment verification, actual developer-buy delivery/refund accounting, automatic indexing and holdings refresh.
6. Complete multi-step simulation or validated gas budgeting when prerequisites are missing. The current preview intentionally leaves deployment gas and total required funds unknown in that case.
7. Reviewed Auto-LP and dividend end-to-end tests; Portal #7 adapter/discovery and non-USDC quote support remain separate work.
8. Telegram/X presentation using the same service, followed by an explicitly authorized small live test and production release.

The expired-draft index is present, but no cleanup cron was installed. Add bounded retention cleanup when customer preparation is released; preserve submitted launch history once execution exists.
