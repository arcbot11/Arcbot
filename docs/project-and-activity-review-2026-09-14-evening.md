# Project and activity review — 14 September 2026, evening

Activity window: **14:27:56–20:27:56 UTC (11:27:56–17:27:56 ADT)**. Read-only follow-up checks continued afterward. Current production is **READY**, commit **70dc4e654db643c87c2345afb7cc90a2a17f0c38**, matching local HEAD at the final check. The latest OTC layout change was committed/deployed during the review; it is included in that final state.

No production writes, signatures, fund transfers, exports, or deployments were performed by this review. Diagnostic scripts and this report were created locally. The local environment's CONVEX_DEPLOY_KEY selects the backend even when the CLI is passed --prod; the live website's market listing IDs and sold total match that backend.

## Findings and concerns

### High — Arc RPC reliability remains the main operational weakness

The configured primary timed out/reset during the probe. Infura identified chain 5042 but rejected the contract read with “project ID exceeded quota.” ArgusPad answered the contract read in 5.24 seconds. This is a local probe, not a measurement of every Vercel region. Contract reads remain dependent on the remaining working provider. Increased slippage cannot fix provider failures.

Four of 24 Telegram balance replies in the window reported partial token refresh (three users). Verified balances must remain visible, but the platform cannot promise exhaustive fresh token discovery during these failures. Resolve Infura access/quota and establish another independently working contract-read provider. Relevant implementation: lib/arc/transport.ts, lib/arc/rpc-role.ts, lib/arc/wallet-tokens.ts.

### Medium — The default test suite is not a dependable release gate

Full run: **3567 passed, 390 failed, 20 skipped/pending**, 3977 total. There were 48 failing test files, including a suite that imports the removed stats page. The default include pattern also executes 103 scratch tests under tmp/; 23 of those failed. Many root tests expect deliberately removed launch, old fee/claim, interactive-terminal, or old command behavior. Other failures concern updated response shapes and denomination behavior; they should be reviewed individually, not indiscriminately removed.

Examples: tests/statsPageLayout.test.ts references app/stats/page.tsx; tests/walletPageAccess.test.tsx expects “Your OTC positions”; old launch tests require currently blocked workflows. vitest.config.ts:7 excludes .deployment-private but does not exclude tmp.

Current OTC/Base/recovery test groups: **363/363 passed** across 24 files. Authentication/export/Telegram identity groups: **282/282 passed** across 17 files. These are subsets of the full run, not additional tests. Application and Convex TypeScript checks passed.

Action: explicitly scope maintained tests, update changed product expectations, then investigate the remaining active-feature failures. Do not enable removed functionality just to make legacy tests pass.

### Medium — Reloading loses OTC purchase tracking and can mislabel the buyer

components/OtcClient.tsx:50 initializes processingPurchase to null and stores it only in React state. The status poll at line 112 runs only when that state exists. The listing-card label around line 198 identifies the active buyer from this same state.

Refreshing the page or opening another tab while your purchase settles therefore loses its live progress and can display **“Another Purchase Is Processing” for your own purchase**. The backend reservation still prevents a double fill; this is a tracking/message defect, not evidence that the wrong wallet is charged. Restore an authenticated pending order by listing/order ID, with wallet binding, before deciding whether the purchaser is another user.

### Medium — Dollar valuations can remain stale indefinitely

lib/arc/token-value.ts:18 accepts a positive explorer price without limiting the age of pricedAt. components/ArcTokenBalances.tsx:20 retains the previous price if refresh fails, and line 28 continues using it. The prior read-only reproduction using a year-2000 timestamp still applies to the unchanged code. No stale live price or trading loss was established in this review.

Apply an age limit to displayed prices, retaining verified token quantities while omitting or identifying expired valuations. Execution quotes remain separate.

### Medium — Telegram wallet-selection errors use transaction-uncertainty language

One Telegram update failed with **“Link that wallet first.”** The guard in convex/telegramWallets.ts:60 is appropriate. The catch in convex/telegram.ts:647 changes this into **“Action needed: Result unavailable. Check wallet activity before retrying.”** No transaction is needed for this rejected wallet switch. Return a wallet-link instruction instead. All durable Telegram command results in the snapshot were delivered.

### Low — Some successful Arc transactions are still recorded noticeably after mining

The slowest purchase took 79.2 seconds from deposit-record creation through final completion. Its 263.968247 USDC Arc payout mined at 17:54:28 and was recorded 22.4 seconds later. Other Arc funding/return examples showed 20.6–39.6 seconds from mining to recorded completion. All checked funds and destinations were correct.

This window does not repeat the earlier 56-second Base gas-refund recording delay. The remaining tail delays here were Arc steps. Historical records do not isolate whether finality visibility, RPC errors, or recovery scheduling caused each delay. lib/otc/escrow-runtime.ts:136 waits up to eight seconds for a receipt before relying on durable recovery; improve prompt reconciliation without weakening delivery checks.

### Low — Duplicate non-export closes still add misleading export failure audits

Two flows recorded closed followed by failed:close:EXPIRED. These were closed flows, not successful exports followed by compromise. convex/walletExports.ts:351 handles duplicate acknowledged closes, but ordinary closes lack the same idempotence. Preserve browser/account binding while treating an already-closed flow as closed.

## Actual recent trade incidents

- **CRCL sell, TG @Akuny:** a sell reverted at **19:52:16 UTC**, costing **0.003333520000166676 Arc USDC in gas**. The canonical receipt has no logs, so that reverted swap delivered no token trade. [Reverted transaction](https://www.arcexplorer.org/tx/0xe5863c7cb0d958586e053b6fc7861f54a369a1ea4d890d2595480e0bb1156405).
- The next attempt was cancelled before signing after its simulation failed. A later sell of 0.010274446988999918 CRCL succeeded at **19:55:26**, with recorded output **0.479233 USDC**. [Successful transaction](https://www.arcexplorer.org/tx/0x381916837d80c413e278123834b7ba0760ac7d64ca7992c0f5db474b775d7c8c). Both receipts were independently checked. The precise earlier revert cause remains unconfirmed: Argus RPC rejected debug_traceTransaction. Do not present slippage, taxes, or gas as a proven cause.
- **ARCAT, TG @Benji0204:** two 10-USDC buy requests returned no supported liquid route. A fresh read-only reproduction using the same wallet/token succeeded in **2.68 seconds**. No buy was submitted by this review. Historical liquidity/provider state was not preserved sufficiently to prove the original cause.
- Other rejected TG trading requests reported insufficient USDC/token balances and returned final responses. A prior buy rejection used token-tax wording for a USDC purchase; distinguish current behavior from this historical response.
- Two cancelled Base swap preparations in this window were **our operator work from earlier in this conversation**, not customer OTC failures. One accounts for 71 repeated request_failed diagnostics. Both were cancelled before signing, and the replacement swaps completed. They must not inflate the customer-failure count.

## Recent activity and accounting

| Measure | Result |
|---|---:|
| Completed OTC purchases | 17 |
| Arc USDC delivered | 1,433.852978 |
| Independently checked OTC transfers | 123 |
| Wrong amount/recipient, reverted or noncanonical OTC receipts in checked set | 0 |
| Purchase completion, deposit record to completion | 32.9–79.2 seconds; median 40.1 |
| Open listings | 8 |
| Listed available Arc USDC | 2,010.745976 |
| Platform total sold | 4,257.592080 USDC |
| Sales ledger entries / duplicate order credits | 72 / 0 |
| Completed Arc swaps touching this window | 10 |
| Other Arc swaps | 1 reverted; 1 cancelled unsigned |
| Completed ordinary Base ETH withdrawals in backend | 14; 4.4–5.7 seconds |
| New X-linked wallets | 6 |
| New Telegram-native wallets | 24 |
| Telegram updates | 283 completed; 16 ignored; 1 failed wallet-selection update |
| Durable Telegram commands | 62; all final results delivered |
| New website sessions | 18 |
| Telegram web sign-in attempts | 12; 10 approved; 2 expired/uncompleted |
| Acknowledged private-key exports | 5: 2 X, 3 Telegram |

All checked purchases paid the Base seller before delivering Arc USDC. Fee transfers matched saved fee recipients and amounts. All eight open escrows covered both recorded reservations and listed principal. The sales aggregate equals its ledger. No inconsistent listing holds, active transaction locks, or pending accepted orders were found. A fresh work query returned an empty list.

Uncompleted Telegram web sign-ins are not automatically authentication failures: abandonment and callback/browser failure cannot be distinguished from these records alone. Export audit checks used metadata only; no private keys were requested or viewed.

The X bot authenticated as @TheArgosBot, ID 2097696306135220226, and its sweep state was updating. There were no new persisted X command/reply interactions in this six-hour window; no end-to-end X post/reply was triggered by this review. Telegram authenticated as @The_ArgosBot, correct website webhook, zero queued updates.

Website home, wallet, OTC, and guide returned HTTP 200 with Argos Bot metadata and CSP headers. The live market returned HTTP 200. Base's initial concurrent health probe timed out on one block request; a follow-up returned a block only 1.6 seconds old. Do not classify Base as down from that isolated timeout.

## Completed purchases

Durations below start at Base deposit-record creation, excluding time reviewing the quote.

| Completed UTC | Buyer | Seller | Arc USDC | Seconds |
|---|---|---|---:|---:|
| 19:16:47 | TG @Benji0204 | X @MGGABSC | 100 | 32.9 |
| 18:52:33 | TG @Benji0204 | TG @Cryptohodl777 | 100.985661 | 36.5 |
| 18:48:44 | TG @Benji0204 | X @0xTheOdysseus | 40.003195 | 41.5 |
| 18:39:13 | TG @Benji0204 | TG @Cryptohodl777 | 100 | 38.1 |
| 18:32:49 | TG @Benji0204 | TG @Cryptohodl777 | 49.993195 | 47.8 |
| 18:17:17 | X @robocryptic_1 | X @MGGABSC | 76 | 36.3 |
| 18:15:24 | X @robocryptic_1 | TG @dipsnchip | 264.947835 | 52.4 |
| 18:04:51 | TG @Benji0204 | TG @dipsnchip | 60 | 35.0 |
| 18:03:47 | X @robocryptic_1 | TG @dipsnchip | 25 | 34.6 |
| 18:01:58 | X @robocryptic_1 | X @MGGABSC | 50 | 33.5 |
| 17:58:30 | TG @Benji0204 | TG @dipsnchip | 50 | 40.9 |
| 17:54:57 | X @robocryptic_1 | TG @dipsnchip | 263.968247 | 79.2 |
| 17:51:19 | TG @Benji0204 | TG @dipsnchip | 50 | 38.3 |
| 17:45:35 | TG @arweb1 | TG @dipsnchip | 70 | 40.1 |
| 17:42:02 | TG @arweb1 | X @MGGABSC | 10.99 | 41.3 |
| 16:16:32 | TG @BlazeKeith1 | X @LancheeDev | 10 | 66.2 |
| 14:34:31 | TG @degenofmeme | TG @dipsnchip | 111.964845 | 46.0 |

## Scope limits

This was a code, tests, deployment/API, audit-record and on-chain receipt review, not a penetration test or fresh mobile OAuth walkthrough. The Convex log stream only retained approximately **20:23–20:29 UTC**, not the full six hours; 1,083 returned records had no failed result. Six-hour findings rely on durable records and sampled operation diagnostics. Receipt checks covered all 123 OTC transfer records in the stated set, plus both cited CRCL receipts; they do not certify every transaction on the platform.

Sanitized evidence and full local test results: .deployment-private/project-review-20260914-night/. No application fixes were made during this review.
