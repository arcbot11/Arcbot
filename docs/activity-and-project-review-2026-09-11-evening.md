# Argos Bot activity and project review

Review window: 11 September 2026, 21:08:44–21:38:44 UTC (18:08–18:38 Halifax). Later activity observed during the review is identified separately. Read-only operational review: no transactions, signatures, public replies, or deployments were initiated by this review. The requested missing-estimate presentation change was made locally.

## Activity

- Three new canonical wallets: @sonicchedgehog, @KitchenHorrorX, and @StudholmeOne. All have Arc chain ID 5042. Five canonical wallet records existed at the snapshot; personal operator wallets are separate.
- Three X requests in the window: two wallet lookups and the developer's 20 USDC ARGOS buy. All ultimately completed with published replies.
- The two new X users initially hit the old-chain provisioning bug. Their requests spent approximately 8m21s and 3m36s from intake to publication. The previously deployed chain-ID correction recovered both. These delays are incident measurements, not normal wallet-creation latency.
- The X buy spent 20 USDC and received 659,762.538797856564562661 ARGOS. Approximately 147 seconds from X intake to reply. Two approvals preceded the swap; all three receipts were independently confirmed successful.
- Telegram: 16 updates from seven distinct Telegram user IDs, all marked completed. This counts commands, callbacks and help/start activity, not seven traders. The message table contains ten user records and three assistant records for this interval; it is not a complete ledger of every Telegram API response.
- No new OTC listing or purchase was recorded during the window. One pre-existing active listing had 100.000722 USDC available, 74% premium, and zero USDC held for orders.
- No pending financial transaction was found at the initial snapshot. Existing listing reserves and tiny gas-credit holds are intentional, not stranded swaps.

| Transaction | Hash | Gas, USDC |
|---|---|---:|
| Approval | 0xad33998d93abddaeb27ef3ab26c850f65b55b732c9c5e7f7edf9949d4015cbf1 | 0.00110756 |
| Approval | 0x0f0c3368e969e8e6d82217d9489f660477c702bb09a534e02ce01073674b44bf | 0.000635502 |
| Buy | 0x0540e7d65feb7eb8a5baaeca1d61d31de5ef4e5a7689a4e03a404a564d1671c8 | 0.00346037844 |

### Subsequent live burn

During the review, a new X burn was recorded and completed: 107,301,243.809504382230292344 ARGOS, transaction 0x33b5169fe86d52920e7f67747a75c5f4a65eae03d94dc4bef177d35feac2e9ee, gas 0.00072177 USDC. Durable settlement contains the verified delivered amount and the interaction shows a published reply. Intake to publication took approximately 48 seconds. This was the user's live command, not a transaction submitted by the reviewer.

## Findings, ordered by priority

1. **High: production dependencies need security updates.** Current npm production audit reports one critical and two high package findings: Next 15.5.22, Sharp, and nanoid. Next's patched 15.x release is 15.5.24; Sharp requires at least 0.35.4. The AVIF image-optimization advisory is relevant to the image-processing dependency stack; no exploit was attempted. The separate Windows-hosted Next advisory is not evidence that Vercel's Linux hosting is vulnerable to that Windows-specific issue. Update compatible dependencies and rerun build/tests/audit. Sources: https://github.com/advisories/GHSA-2xp9-vwfh-vxw4, https://github.com/advisories/GHSA-p293-qw3h-jr36, https://github.com/advisories/GHSA-rgj7-g3m4-5g8c, https://github.com/advisories/GHSA-2v37-7h3g-55p8.

2. **High: public wallet token discovery can silently omit real holdings.** Before the later burn, the live creator public-wallet API returned `tokens: []` and `partial: false`, despite an independently verified 107,301,243 ARGOS balance. `app/api/wallet/public/[address]/route.ts` calls discovery without wallet-known or pinned tokens. The social path supplies pinned ARGOS; authenticated web discovery supplies swap-output tokens. Unify candidate discovery and avoid reporting completeness merely because the explorer returned an empty list. This is a display failure, not missing funds.

3. **Medium: dollar valuations depend on incomplete explorer pricing.** The ARGOS explorer token endpoint returned `priceUsd: null`. A verified token balance therefore has no dollar estimate. `lib/arc/token-value.ts` has no alternate pricing source. The user's requested presentation fix now omits missing estimates rather than printing an unavailable message; it does not repair price coverage. A bounded, fresh, address-verified price fallback is still needed for reliable ARGOS valuations.

4. **Medium: Arc RPC redundancy is degraded.** Sampled local primary requests failed for chain, head, native balance and token balance. Infura passed basic reads but rejected the token contract read. Argus passed all four. Base's configured primary passed chain, head and native balance reads. The application's fallback structure is necessary and recent successful trades prove actual execution has worked, but read-provider success does not independently prove broadcast support. Contract reads remain concentrated on Argus; cold-instance validation and failing primary calls add latency. Do not enable blind broadcast retries after ambiguous submission.

5. **Medium: trading still has noticeable end-to-end delay.** The observed 20 USDC buy took about 147 seconds and required two approvals. The application serializes dependent approvals, signing and receipt verification. Keep that ordering safe; profile quote preparation, approval reuse and worker/polling latency. The 48-second live burn provides a simpler-flow comparison. These are individual samples, not percentile measurements or a load test.

6. **Medium: the full test suite is not a usable release gate.** Active-feature selection: 826/826 passed across 61 files. Full offline TypeScript suite: 2,521 passed, 359 failed, 16 skipped across 227 files, 40 failing files. Many failures expect retired launches, fee workflows, terminal access, old chain IDs or old reply policy. Other amount/signing failures need triage rather than blanket dismissal. No `.github/workflows` CI configuration exists, and Vitest still includes temporary diagnostic tests by default unless explicitly restricted. Retire obsolete tests and establish a green supported-feature gate without restoring removed functionality.

7. **Medium: expensive public reads lack visible application-level rate limits.** Public wallet discovery and the image proxy are address/URL-driven network workloads; no application limiter was found on these routes. Authenticated trade estimation is also potentially expensive. Vercel firewall rules and account-level rate protection were not verified. Add measured limits and shared caching before heavier traffic.

8. **Operational gaps remain.** OTC gas recovery has bounded automatic allowances and clear blocked-state messages, but exceptional cases still require operator intervention; this is not guaranteed unattended recovery under arbitrary gas conditions. The generic project-health script still queries an invalid legacy RPC and old services, so it is not an Arc readiness check. Personal operator scripts are tracked, while private manifests/keys/journals are ignored; tracked scripts themselves are not evidence of leaked keys. No exhaustive Git-history secret scan was performed.

## What checked out

- Live home, wallet, OTC and guide pages returned HTTP 200 with Argos Bot metadata and the current social image.
- Live wallet and OTC pages serve nonce-based strict script policies. The image proxy pins the validated public IP through its actual connection and revalidates redirects.
- Telegram identity and webhook match The_ArgosBot and argosbot.io; pending webhook updates were zero, with no last webhook error reported. The local check process emitted a Windows Node shutdown assertion after returning its successful API result.
- CDP could read the existing creator account with current credentials; new wallet provisioning succeeded live after the earlier fix.
- Reviewed storage/recovery paths retain ownership checks, durable signing fences, receipt checks, lock coverage and tiny-refund handling. Focused tests include concurrent OTC and recovery cases. No new OTC settlement or Base withdrawal occurred in the selected window, so these are not new live end-to-end validations.
- Production build completed successfully, with unused-variable warnings and local certificate errors from build-time fetches. Current TypeScript and focused tests were also checked. The build preceded the final missing-estimate text edits; those received separate focused tests and type checking.

## Scope and limits

This is platform-record activity, not all visitors or all Arc-chain trades. Vercel control-plane API access timed out; visitor analytics, function billing, firewall settings and deployment history could not be verified. No load test, penetration test, signed transaction, fee claim or new deployment was performed for this review. The late burn changed the creator balance after the earlier public-wallet mismatch was observed.
