# Argos Bot — follow-up readiness review, 11 September 2026

Reviewed checkout: 1662781 plus the current uncommitted changes. This supersedes the earlier same-day review for the items below. **The recent fixes are sound locally, but I would not call the project ready for unattended public release yet.**

This turn changed no application code, credentials, deployments, bot settings, or balances. It produced this report and ignored diagnostic files. No live transactions or bot messages were sent.

## Findings, in priority order

### 1. P1 — Production dependencies still have known security advisories

The fresh production dependency audit reports **one critical and two high affected packages**: Next.js, Sharp, and Nanoid. Installed Next.js remains 15.5.22; the relevant image-optimization advisory is patched in 15.5.24. Sharp remains affected below 0.35.4; Nanoid below 3.3.18. Update the resolved packages and lockfile, then repeat the build and audit. This is an advisory finding, not a demonstrated exploit of this deployment. The separate Windows-hosted Next advisory must not be assumed to describe Vercel's runtime.

Primary sources: [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). Evidence: package-lock.json, next.config.ts, tmp/readiness-current-audit.json.

### 2. P1 — The public site is configured against a development Convex deployment

Both the local deployment selector and the available deployment key identify a development deployment. The public site's CSP declares the same Convex hostname as the local NEXT_PUBLIC_CONVEX_URL: aware-okapi-12.convex.cloud. The inspected data therefore belongs to that configured deployment, not a separately verified production backend.

The installed Convex CLI explicitly gives a deployment key precedence over selectors such as --prod. Merely adding --prod while retaining the development key will not establish production separation. Development changes can affect the public application's backend.

Set up a deliberate production deployment and migration. Preserve wallet identity derivation, existing CDP accounts, sessions/link bindings as appropriate, and every financial reservation, transaction, order and listing record. Do not point the website at an empty database or regenerate wallet identities.

Evidence: safe environment classification, live response headers, node_modules/convex/src/cli/lib/deploymentSelection.ts:714. Full Vercel private environment access was not available.

### 3. P1 — The latest local changes are not fully reflected in public configuration

Public /wallet and /otc still return policies without strict-dynamic; the new local nonce policy is therefore not what those public responses currently enforce. The production build passes locally. In the preceding verification, local rendered wallet, OTC and public-wallet scripts all carried the matching CSP nonce.

Telegram's live registered command menu still lacks /withdraw. This proves that command registration is outstanding; it does not by itself establish which version of the handler is deployed. The new button and withdrawal implementation are present locally and their targeted tests pass.

Deploy the backend and website together, then update the Telegram command registration and verify the public responses again. Vercel API discovery could not identify a matching project in the available account/team results, so the exact live commit and private Vercel environment values remain unverified.

Evidence: tmp/readiness-current-public.jsonl and tmp/readiness-current-deployment.jsonl.

### 4. P2 — A deterministic social-command failure can be shown as processing

The social command API treats most errors outside a short message allowlist as pending. I reproduced a valid buy request whose preparation throws “Unsupported Argus pool configuration.” It returns pending:true even though no transaction has been prepared or signed. Telegram shows processing; X continues waiting. With no transaction created, authorization eventually expires after 30 minutes, so this example is a delayed error rather than an indefinite financial lock.

Distinguish known input/unsupported-route errors from ambiguous signing or broadcast outcomes. Only the latter need indefinite observation. Do not relax receipt checks or unlock an ambiguous signed request to fix the wording.

Evidence: app/api/arc/command/route.ts:85; lib/arc/argus-discovery.ts:40; convex/wallets.ts:7024. Mock reproduction: tmp/readiness-social-pending-proof.json, one test passed asserting the undesirable behavior.

### 5. P2 — Some exceptional recovery states still need an operator procedure

The lost-signing-response bug is fixed. However, immutable signed transactions can still wait if their fees are too low, Base's additional fee estimate exceeds the reserved allowance, or a nonce is consumed without a verified receipt. Replaying the same bytes is safe but cannot solve every fee or nonce problem. There is no general replacement/cancellation workflow for those signed states.

Likewise, the new gas messages correctly identify exhausted recovery allowances, but the retry interface accepts verified reverted escrow transactions, not every unprepared or underfunded step. Another gas rise after the single bounded top-up still requires assistance. Document and test recovery procedures and add actionable monitoring before unattended operation. I found no currently pending financial records in the inspected deployment.

Evidence: lib/otc/runtime.ts:295 and 307; lib/otc/escrow-runtime.ts:83; lib/otc/escrow-model.ts:145.

### 6. P2 — The complete test suite is not a reliable release check yet

Current results: **2,408 passed, 361 failed, 20 skipped**, across 226 test files; 42 files contain failures. Most failures concern disabled launches, old fee/claim functions, guided workflows, or retired terminal behavior. Some remaining failures concern command parsing, display expectations, or renamed wallet UI and need individual triage. For example, a wallet-page test still expects “Your OTC positions.” Do not treat every failure as a current feature defect, or discard the entire suite as obsolete.

No .github/workflows directory exists. Retire obsolete expectations, retain current security/financial invariants, and add a clean automated build/type/test check. The new recovery, proxy/CSP, Telegram withdrawal and active Arc/Base/OTC test files inspected in this run passed.

Evidence: tmp/readiness-current-tests.json. Production build, root TypeScript and Convex TypeScript checks all passed; build output has existing unused-variable warnings.

### 7. P2/P3 — Coverage and documentation still overstate the supported surface

- Routing supports one to three pools. Mixed routes require ERC-20 currencies; arbitrary native intermediates and arbitrary hooks are not supported. Hook discovery knows four Portal versions, including the new eleven-word record.
- Tax-aware maximum selling recognizes the reviewed legacy Argus implementation and its standard clones. Unknown custom taxes are not understood automatically.
- The guide advertises “Buy 50 TOKEN,” while current social buying requires a USDC/dollar spend amount. Its general examples are also not copyable Telegram slash commands. TG Base withdrawals should be documented separately.
- Telegram accepts leading-dot numbers at the first parser but the structured validator requires a leading digit: use 0.001, not .001. This is a usability mismatch, not a fund-safety failure.
- New multihop combinations, Telegram Base withdrawal, and exceptional recovery sequences still need a controlled funded end-to-end check after deployment.

Evidence: lib/arc/routing.ts:36 and 148; lib/arc/transfer-tax.ts:20; app/guide/page.tsx:7; convex/walletCommands.ts:625.

## Recent fixes rechecked

| Change | Assessment |
|---|---|
| Recover original signing result before re-simulation | Implemented; tests cover mined revert, awaiting receipt, another CDP timeout and mismatched signature |
| Unsigned expired trade cancellation | Preserves the signing fence and refuses ambiguous signed/legacy cancellation |
| Uneconomic OTC gas refund | Exact 0.0000015 ETH / 0.000001 ETH case passes; owner credit retained; other credits untouched; exception capped at 0.00001 ETH |
| Payout-dependent release | Principal/fee receipts must be verified; an existing refund transaction cannot be discarded |
| Clear gas-recovery errors | Implemented; distinguishes insufficient gas, exhausted recovery and allowance limits |
| Wallet/OTC CSP | Local strict nonce policy, forwarded request policy and dynamic rendering implemented |
| Image proxy DNS binding | Connects to the validated IP; preserves hostname TLS verification; validates each redirect; MIME and size checks tested |
| Base receipt verification | Uses canonical receipt and matching transaction, avoiding whole-block net-balance and finality waits |
| Telegram intake and final replies | Atomic intake scheduling and durable result delivery; pending financial results do not become final reply text |
| Telegram Base withdrawal | Shared website preparation, explicit chain 8453, linked Telegram authority, reserved-fund checks, USD conversion and Basescan links |

## Feature status

| Area | Current status / evidence |
|---|---|
| Website home, guide, wallet, OTC | Public HTTP 200; current Argos Bot title, dog favicon and social banner |
| Wallet authentication | Signed session, active server session, origin/CSRF checks and recent-auth requirement inspected; OAuth tests pass; no new real mobile sign-in performed |
| Public wallet pages | Read-only public balance endpoint returned partial:false; owner-only controls remain enforced by authenticated APIs |
| Arc balances and token catalog | Verified native/token reads; whole-token social display and priced USD estimates; duplicate-USDC protection retained |
| Buy/sell/swap | Shared social/web trading preparation and durable settlement; supported route limits above |
| Arc sends/burns | Explicit destinations; token return/delivery verification and reservation handling covered by tests |
| Base withdrawal | Website and TG share preparation; TG addition is local and has not been funded-tested |
| OTC listing/partial purchase/cancellation | Atomic inventory and pending-order holds; cancellation blocked while a fill is unresolved; no pending live orders in snapshot |
| X | Correct account credentials; explicit-tag and self-post protections; X_REPLIES_ENABLED=false locally and in inspected Convex environment |
| Telegram | Correct account, active link, healthy webhook, delivered result records; /withdraw not yet registered live |
| Launch/claim/legacy fee features | Public workflows blocked; considerable dormant code/tests/scripts remain |
| Workers | Scheduled recovery, bounded batches, queue-age counts and HTTP 503 on worker failure; load behavior and operator alerting not verified |

## Read-only service results

- X OAuth1 identifies **@TheArgosBot**, ID 2097696306135220226.
- Telegram token identifies **@The_ArgosBot**, ID 8280311402. Webhook points to https://www.argosbot.io/api/telegram/webhook, with zero pending updates and no reported last error.
- Inspected Convex snapshot: 18 completed TG updates, 8 delivered wallet results, one active TG link, two confirmed social trade requests, 88 completed transaction records, three completed OTC orders, two filled and two cancelled listings, one expired quote, 11 wallet records. No pending financial records were found. X interaction CLI output was empty, so I did not infer a count.
- Selected local/Convex CDP, X, TG, service-secret and Arc/Base RPC/checkpoint values match. No secret values were printed. Existing CDP account-name lookups resolve to both expected wallet addresses; no signing call was made.
- Arc primary failed sampled requests from this machine. Infura backup returned the correct chain/head/checkpoint and basic reads but rejected the sampled eth_call with -32600. Argus returned the sampled reads and contract call successfully. These are regional observations, not guarantees of Vercel behavior.
- Both Base RPCs passed chain/checkpoint/head, balance, nonce, fees, estimate and contract-call reads. Broadcast failover was not tested with a transaction.
- Public ETH price, token search and wallet balances returned HTTP 200. Sample public wallet response took approximately 3.2 seconds. Retired market snapshot returned its expected HTTP 410.
- Tracked-tree secret scan covered 732 paths / 702 text files: no exact current-secret values, literal private keys or provider-key URLs found. Only expected personal-wallet tooling references were reported. Private wallet manifests and deployment state are ignored. This is not an exhaustive historical secret audit.
- Public wallet/token/image endpoints have bounded work in places but no identified application-level request limiter. Vercel firewall/rate-limit configuration could not be verified.

## Validation and limits

The current production build and both typechecks pass. All 2,789 tests in the tests directory were run; failures are retained in the counts above. The separate unsupported-pool reproduction uses mocks. The most recent targeted recovery and Telegram-withdrawal checks remain successful in the full run.

This review does not certify every possible token, hook or route, high-load behavior, signed-in mobile layout, third-party OAuth mobile app handoff, historical secret cleanliness, live broadcast failover, or the exact Vercel deployment commit. No new funded end-to-end transaction was performed.

Recommended order: patch dependencies; establish deliberate production Convex isolation and preserve existing financial/wallet state; deploy and verify the latest changes; register /withdraw; fix the deterministic-pending error classification; establish operator recovery/monitoring; clean the tests and add CI; then run controlled funded checks before enabling X replies or expanding public access.
