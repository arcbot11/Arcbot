# Private-key export remediation — 2026-09-12

The six implementation findings in the export review are fixed locally. No production private key was exported, no customer was enrolled, and no deployment or feature enablement was performed.

## Changes

1. **CDP addressing:** lookup uses the audited customer account name. Returned name and normalized address must match the registry; the encrypted export URL retains CDP's exact canonical address. Mixed-case tests now reach the mocked export endpoint successfully.
2. **X interruption recovery:** callback work has an attempt lease. A sealed access token is committed before identity lookup; that lookup and completed authentication can resume. An ambiguous code exchange can restart OAuth within the same grant after the lease expires. Replaced states and stale workers cannot authorize the grant. PKCE and token encryption are bound to purpose and attempt; identity still must match the original wallet owner.
3. **TG interruption recovery:** the exact same grant/browser/verified-proof combination may acknowledge an already-committed authentication. Cross-grant replay remains denied. The browser reconciles status and retains its in-memory Telegram proof until authentication is authoritatively confirmed.
4. **Indexed ownership and pending work:** per-owner and normalized-address queries replace global wallet scans. Escrow and pending-transaction lookups use dedicated indexes. A persisted, paginated migration must finish before any eligibility or export operation proceeds. Financial record writes maintain indexes atomically. Historical unrelated accounts, closed listings and stuck transactions no longer impose a global 2,000-row ceiling.
5. **Disclosure lifecycle:** the browser checks authority immediately before display, before copy, and every two seconds during the 30-second display window. Revocation, failed checks, offline/background/navigation events clear the key. A status request times out after three seconds. This reduces the logout race; it cannot revoke material already delivered, viewed or copied.
6. **Actionable, redacted failures:** safe ConvexError codes distinguish configuration, eligibility, expiry, rate limits, pending work, callback interruption and provider retry. Only fixed messages reach users. Audit entries retain stage/outcome codes, never provider bodies, OAuth secrets, Telegram proof or private keys.

Additional fixes: the main starter retains session/CSRF/ownership checks without requiring an extra recent login before export OAuth. Mobile Firefox/Chrome handoff uses native browser links to a fixed, credential-free URL; the original browser cookie remains mandatory. The shared 100/hour initiation ceiling is removed, with an optional operator cap. Expired grants, prompts and limiter rows are cleaned in bounded batches; proof hashes outlive their freshness window and audit metadata is retained for 90 days.

The X export button remains at the bottom of the wallet page. Telegram has no export menu button: `/export` requests explicit confirmation before a verification grant is created. No passkey requirement was introduced.

## Validation

Tests cover canonical CDP casing, owner substitution, changed registry bindings, cross-provider IDs, protected wallets, callback interruption/replacement, proof replay, failed responses, browser logout during/after delivery, backgrounding during encryption, migration readiness, large unrelated backlogs, cleanup retention, and safe error handling. Provider export is mocked; cryptographic tests use locally generated disposable material.

Checks passed: 406 unique tests across the export, Telegram, reservation/settlement and social-command suites; application and Convex TypeScript checks; targeted ESLint; isolated browser bundle generation; and the production Next.js build. The build reports existing unused-variable warnings in unrelated files. A repeat build also logged two certificate-verification failures during prerender data fetching, but completed successfully; TLS verification was not weakened.

## Rollout requirements

- Deploy the schema, indexed write paths and migration together; verify `walletExportMigration` with `key=v1` reports `ready=true`. Do not set readiness manually.
- Configure the isolated broker, provider callbacks and dedicated credentials. Verify actual CDP export permissions and encrypted delivery with an explicitly designated disposable account.
- Approve only audited customer bindings. Customer enrollment remains deliberately explicit; schema migration does not approve accounts. Keep operator, Personal, escrow and fee wallets excluded.
- Test the complete flow on real Telegram clients and mobile browsers, including Firefox → X app → original Firefox. OS/browser handoff behavior has not been device-tested here.
- Keep customer export disabled until these checks pass. Follow the [deployment configuration](private-key-export-implementation.md).
