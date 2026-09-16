# Launch system review — 2026-09-16

Read-only operational review and local validation. No additional launch, transfer, claim, deployment, or feature enablement was performed.

## Findings

1. **Release blocker: production does not contain the complete reviewed launch release.** Current Vercel production is READY (`dpl_12YueaxMRKtQ7ZcWxbF2mYFV4biq`), but recent launch changes remain local. `ARGUS_LAUNCH_PREPARATION_ENABLED` is absent from Vercel production and the configured Convex deployment `aware-okapi-12`. `/wallet/launch`, `/api/wallet/launches`, and `/tokens` each return 404. Execution is also hardcoded off. This is intentional containment, not evidence of a production launch outage. Release needs coordinated Vercel/Convex code and flags, plus an actual authenticated web/X smoke test. The operator test bypassed customer acceptance, social notification and the scheduled launch runner.

2. **Medium: disabling launches can strand orchestration.** `convex/launchExecution.ts:recover` returns immediately when execution is disabled, without scheduling a successor. There is no launch-run sweep in `convex/crons.ts`. The ordinary transaction worker may still reconcile existing signed transactions, but unfinished multi-step launch runs and their final draft reconciliation need their orchestration chain. Re-enabling the flag does not itself restart that chain. Separate new-launch admission from recovery, and add a bounded sweep for running launch records. Do not automatically authorize new signatures after a pause.

3. **Medium: a rejected web confirmation can remain in uncertain-acceptance mode.** `LaunchPreparation.write` marks every execute/resume attempt uncertain before submitting; its error path does not distinguish a definite rejection from a lost response. `awaitingLaunchAcceptance` continues to return true for a prepared draft without a run, even if the preview has expired. A rejected confirmation can therefore keep polling and disable normal preparation/editing until the user uses the cancellation/retry escape paths. Return an explicit authoritative acceptance outcome and reconcile it; do not treat a pre-commit read alone as proof of cancellation.

4. **Medium operational risk: repeated preparation increases RPC and latency pressure.** The browser simulation, `advanceLaunchAttempt`, and `assertLaunchSigning` each perform launch preparation; the latter two also fetch and decode the image again. Hook salts are reused and accepted paired amounts are frozen, but substantial identity/configuration/balance checks repeat. Initial ARGUS/ARCASH preparation also performs historical market discovery twice around hook mining. No new concurrent-user load benchmark was performed. Preserve fresh funding, nonce, pointer and signature checks while sharing immutable evidence and measuring the complete customer path under concurrency.

5. **Low: image support differs between web and X.** `lib/launches/image.ts` now accepts constrained Google thumbnail URLs used by TEST. `convex/wallets.ts` only extracts direct X photo/IPFS links when no attached media is present. The identical Google thumbnail supplied as an X text link therefore does not reach shared verification and produces the missing-image response. Use the same bounded source extraction policy across channels; keep DNS pinning and image decoding.

6. **Low, scale-dependent: token-directory results are silently capped at 500.** `launchExecution.directory` returns the latest 500 verified launches, without pagination. Older tokens eventually disappear from the directory. `creatorTokens` also caps results per creator. Paginate before that volume is reached; this is not a current launch blocker.

Additional presentation observation: `/how-to-launch` returns 200 in production and is only marked noindex, whereas `/tokens` is explicitly development-only. The guide is unlisted, not access-restricted. Decide whether that meets the intended hidden-page requirement.

## What was checked

- X command extraction, deterministic allocation/pair conversion, source-request authorization, image binding, shared command endpoint, pending/result handoff and response formatting. Legacy recipient/self-burn fields are cleared by normalization; this review did not establish an active legacy execution bypass.
- Web session-derived identity, CSRF/origin checks, bounded bodies, revisions, stale preparation protection, wallet-switch isolation, uncertain confirmation tracking and terminal draft lifecycle.
- Backend acceptance, one running launch per address, deterministic step IDs, previous-step verification, durable signing fences, recovery of the original signature before new simulation, gas accounting and receipt verification.
- Portal 7 code/pointer/hook consistency checks, fixed taxes, paired-asset approval and payout checks, prediction verification, creator/dividend configuration and actual creator-buy transfer accounting.
- Creator fee discovery and claim binding, verified-launch registration, catalog duplicate/USDC/exclusion policies and token-directory provenance.
- Current deployment status, route availability, feature flags, production build and Convex type checking.

## Validation results

- 367 distinct tests passed across 24 selected launch, API, X parsing, image, gas, receipt and creator-fee suites (one 23-test suite was repeated across two batches).
- Convex TypeScript check passed.
- Production build passed. Initial restricted build failed because esbuild could not traverse a filesystem path; it passed outside that restriction. The successful build retained unrelated unused-variable warnings and logged two prerender fetch certificate failures. Those fetches did not fail the build; they are not evidence that every remotely sourced prerender value was refreshed.
- Existing TEST operator journal remains completed and released. Confirmed token: `0xf9542AD2476188AFFf73F00F02C1A4F9dC93666d`; transaction: `0xf990453cd8755e456eb2b3757659210453f78363372526988a760d49d25bf2bd`; gas: 0.059045740002952287 USDC. Zero developer buy; creator-only rewards.
- TEST is not registered by the operator in the bot launch directory or token registry and its local catalog exclusion is present. That new exclusion requires deployment to affect production catalog code.

## Boundaries of evidence

The real TEST transaction proves Portal 7 deployment, CDP signing/broadcast and shared mined-result verification for a USDC pair with zero developer buy and creator-only allocation. It does not prove production customer web acceptance, X reply publication, multi-step setup recovery, a funded developer buy, dividend distribution, or an ARGUS/ARCASH launch end to end. Earlier paired-price checks were blocked by volatility policy; they were not rerun in this review. Contract fingerprints detect changes relative to recorded deployments; they are not a source-code security audit. No adversarial exploit test or mobile visual pass was performed.

Recommendation: fix findings 2 and 3, make the deployment/enablement procedure explicit, then exercise authenticated customer paths before broad release. Keep existing safeguards for unresolved signatures and recipient verification.
