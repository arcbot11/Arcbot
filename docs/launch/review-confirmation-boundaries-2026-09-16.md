# Launch confirmation boundary review

## Follow-up implementation

Both findings below have now been addressed: definite pre-acceptance failures carry a rejection marker; existing X runs bypass admission gating; authenticated draft/status reads and existing-run recovery remain available during a pause. New launch execution remains disabled. The How to Launch and Tokens pages are public, with navigation, sitemap and home-page links. The OTC page returns not found; historical records and recovery are preserved.

Regression coverage includes CSRF rejection, disabled execution, paused X completion, paused authenticated draft reads, and rejection of an unrelated owner.

Scope: follow-up review of launch admission, recovery, website tracking, X responses, and the recent fixes. No transactions, deployments, or public feature enablement performed.

## Findings

### Medium: definitive pre-acceptance errors still leave uncertain website tracking

`LaunchPreparation.tsx` records uncertain confirmation before POST and clears it on failed responses only when `acceptance` is `rejected`. The API adds that marker for selected Convex acceptance failures, but not for authentication/CSRF failures or execution-disabled errors before acceptance. A subsequent unchanged prepared draft intentionally cannot clear uncertainty. The page can keep polling and prevent editing even though this attempt never reached acceptance.

Three isolated mocked probes confirmed: a CSRF 403 has no rejection marker and never calls acceptance; an execution-disabled 400 has no marker and never calls acceptance; the X pause behavior below. Probes were removed after review. This is not proof of a failed live customer launch.

Remedy: distinguish pre-acceptance rejection from post-acceptance uncertainty across the full POST boundary. Preserve same-request reconciliation for genuinely lost responses; do not clear pending state based on arbitrary errors after acceptance.

### Medium: pausing launch admission still breaks channel status handling

`runSocialLaunch` calls `assertLaunchEnabled` before looking up an existing run. After pausing execution, a retry for a running or already completed launch returns `EXECUTION_DISABLED`; the command endpoint treats that as a final failure. The new background recovery path can still recover accepted signed work, so that failure response may contradict the final on-chain outcome.

Separately, turning off the preparation flag makes the website GET return 404 and blocks `launchDrafts:read`, so existing customers cannot follow their accepted run through the launch page while the worker continues recovery.

Remedy: gate new admission separately from authenticated existing-run retrieval and terminal reporting. Recover or report accepted runs before rejecting a new launch.

## Verification

- Reran 14 launch suites: 213 tests passed.
- Ran three isolated boundary probes: all reproduced the findings described above.
- Inspected atomic signing checks: the backend verifies a running launch and step registration before first signing. The reviewed findings do not demonstrate duplicate launches or cross-wallet access.
- Previous two real TEST launches cover the operator USDC, zero-dev-buy, creator-only path. They do not prove complete customer web/X execution, funded multi-step creator buys, or paired-asset launches.
- No implementation fixes made in this review.
