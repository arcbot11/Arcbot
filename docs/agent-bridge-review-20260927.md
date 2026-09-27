# CTS Bridge API review — 2026-09-27

Scope: the separate external-wallet service, including the pending Arc/Base
direct-payment changes, payment recovery, job lifecycle, persistence, discovery
and hosting. No operator signatures, payments, bridge transactions or deployments
were performed during this review.

## Findings addressed

- Direct-payment settlement timeouts previously had only Gateway reconciliation
  available. The separate API now accepts an optional `Payment-Transaction`
  header on an identical paid-request retry. It verifies canonical USDC calldata,
  authorization fields, nonce consumption, exact transfer, successful receipt,
  canonical block hash, chain ID and source finality before recovering the saved
  result. It never calls settlement again. This does not change the CRA lookup API.
- A job with 16 recorded steps could not refresh its last unarmed quote. It can
  now replace that quote without increasing the step count. A seventeenth step
  remains blocked, as do replacements of armed or submitted steps.
- The earlier Convex intent-key-order fix remains in the pending changes. Its
  regression test verifies that serialization order cannot change job identity.

## Second review

Recovery is reached only after the original payment proof and operation binding
match an existing settling/uncertain record. Changed requests are rejected before
receipt reads. The verifier requires a direct canonical USDC authorization call,
not merely matching logs that could belong to separate calls in a batch. RPC
failures and incomplete evidence retain the uncertain state. Existing job locks,
revision checks, fee limits and finality requirements remain intact.

No further blocking issue was identified in the reviewed paths. This is a code
review with mocked regression tests, not a security certification or live
end-to-end settlement test.

## Validation and remaining work

- 53 distinct relevant tests passed across eight test files (the changed payment
  files were rerun after adding the final failure-path regression).
- TypeScript check, standalone build and local HTTP smoke test passed.
- Deploy the pending Convex persistence fix and Vercel service changes together.
  Deployment remains the user's next step.
- Live Base direct settlement still needs a separately authorized funded test.
  No paid Base transaction was performed in this review.
- Receipt recovery requires a known settlement hash and currently handles direct
  `receiveWithAuthorization` / `transferWithAuthorization` calls with v/r/s.
  Unknown hashes, batched calls and other call encodings remain unresolved; clients
  must not create a second payment. Recovery remains subject to the existing
  payment-record retention window.
- Circle marketplace submission and approval remain separate from deployment.
