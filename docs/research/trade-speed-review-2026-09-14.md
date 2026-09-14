# Recent buy/sell timing review — 14 September 2026

Reviewed the two latest completed Arc swaps and their four preceding approvals in the configured Convex application backend, then checked all six canonical receipts, matching senders and block timestamps. No transactions were signed or submitted. Times below are UTC. Record creation occurs after preview, so initial quoting and time spent in the interface are not included.

## Actual transactions

| Action | Recorded start | Completion | Recorded workflow duration | Result |
|---|---|---|---|---|
| Sell ARGUS | 13:12:06.929 | 13:15:22.861 | 3m 15.932s | 462.039821886651019011 ARGUS input; 0.962295 USDC delivered |
| Buy BABYARGUS | 13:17:18.567 | 13:21:59.674 | 4m 41.107s | 2 USDC input; 142,350.539567058759383122 BABYARGUS delivered |

### Sell

| Step | Record to completed | First recorded broadcast attempt to mining | Mining to completed | Transaction |
|---|---:|---:|---:|---|
| Token approval | 14.020s | Approximately immediate | 8.949s | [Approval](https://www.arcexplorer.org/tx/0x2dfb5cdb30fcdf54a6b4545ab4989e1ed50158159c962af09cea2f13f61e2dee) |
| Permit2 router approval | 42.634s | 28.594s | 4.318s | [Approval](https://www.arcexplorer.org/tx/0xba9235dc1df8f2e2c15759c03e2b60a38589bcd8169efd00bee81d53b05257ff) |
| Swap | 60.348s | 44.463s | 4.861s | [Sell](https://www.arcexplorer.org/tx/0x7370a5aebee0a2ccb2d32b875751901eb1e111367d4bd49fdd6eece8cbd92267) |

Between completed approvals and creation of the next record there were gaps of 21.735s and 57.195s. These include polling, request/authentication, quote rebuilding and preparation; records alone cannot assign each second to one component.

### Buy

| Step | Record to completed | First recorded broadcast attempt to mining | Mining to completed | Transaction |
|---|---:|---:|---:|---|
| USDC approval | 121.056s | 112.011s | 5.623s | [Approval](https://www.arcexplorer.org/tx/0x5a255957756525a55b7b16094c97c544165dea9898bcdeeb53a76989cf701361) |
| Permit2 router approval | 103.788s | 88.742s | 6.192s | [Approval](https://www.arcexplorer.org/tx/0x695584ac191a25ded6fd0ab50372e6fcf59556482314a1d3ba00871dde75ca84) |
| Swap | 17.780s | Approximately immediate | 9.674s | [Buy](https://www.arcexplorer.org/tx/0x80fb6a209bb28c8f727fc5be07df469e80a39408b5736967367a42d5f59ea0fd) |

Between completed approvals and creation of the next record there were gaps of 17.781s and 20.702s. Both approvals have three recorded broadcast attempts. Their mining timestamps closely match the last attempt and acknowledgement. About 201 seconds elapsed between their first attempts and mining. The swap required one broadcast attempt.

Block timestamps have whole-second precision, whereas application timestamps have millisecond precision. Differences of -0.207s and -0.025s are therefore reported as approximately immediate. A recorded broadcast attempt does not prove the provider accepted it.

## Findings

1. **Submission/recovery is the largest demonstrated delay.** The browser transaction endpoint invokes receipt-only verification. It does not retry signed submissions. The scheduled worker runs once per minute, and the Arc transport stops after one selected provider's broadcast attempt even when that request fails. This can leave an unacknowledged, durably signed transaction waiting for another worker cycle. The available Convex logs include an OTC worker failure at 13:20:14 and a successful worker run at 13:21:15, coinciding with the final buy approval mining. The underlying provider error is absent from those logs; this is evidence consistent with the recovery path, not proof of every failed attempt's cause.
2. **Post-mining verification was relatively short.** All six completed 4.3–9.7 seconds after their mined block timestamp. Reducing finality or delivery checks is not the main improvement for these examples. The OTC Base deposit wait is unrelated to these Arc swaps.
3. **Both operations paid the cost of two approval transactions.** Current code grants exact-amount ERC-20 allowance and exact-amount Permit2 allowance, with a ten-minute Permit2 expiry. Consumed allowance means subsequent trades often repeat setup. After every approval, the complete preview is rebuilt before the next step.
4. **Provider ordering adds considerable quote latency.** Local configuration has Arc Scan first, Infura as a fallback, and Argus ahead of Infura for `eth_call` after the primary fails. Arc Scan failed connection checks in this test. Argus produced 28 `upstream unreachable` responses across the four baseline quote tests; restricted tracing recovered the eligible calls.
5. **Route caching already helps.** Signed route hints carry verified pool identities between stages, with fresh amounts/prices and canonical block checks. There is still repeated code, pool state, token metadata and provider validation work. Full discovery should remain a fallback when a route hint is missing, expired or invalid, rather than being removed entirely.

## Read-only quote experiments

Used the actual wallet and exact trade inputs. These are local measurements under current network conditions, not historical request durations or promised execution times. The trial changed only the probe process's primary endpoint; no environment file or deployed setting changed.

| Quote | Existing provider order | Infura first with existing restricted fallback |
|---|---:|---:|
| BABYARGUS buy, cold discovery | 14.257s / 82 calls | 3.068s / 50 calls |
| BABYARGUS buy, valid route hint | 10.619s / 32 calls | 1.327s / 22 calls |
| ARGUS sell, cold discovery | 17.979s / 61 calls | 3.426s / 39 calls |
| ARGUS sell, valid route hint | 7.131s / 29 calls | 1.000s / 17 calls |

Infura still rejected ordinary `eth_call` with a quota error on the first eligible call of each cold test. The existing allowlisted fallback used 76 successful `trace_call` requests across the four trial quotes. These results do **not** establish support for arbitrary execution simulation or broadcasting through that fallback. Execution and settlement clients still disable it, and should retain that restriction.

## Recommended implementation order

1. **Prioritize the proven fast provider for eligible quote reads**, while retaining validated fallback and keeping execution/broadcast selection separate. Confirm both cold and warm behavior in production before generalizing local measurements. Do not simply enable tracing for execution calls.
2. **Recover uncertain broadcasts promptly.** Use a short, durable, per-transaction recovery schedule or the authenticated polling path with an atomic attempt throttle. Check receipts and nonce evidence first, then retry only the persisted, verified signed bytes/hash through a validated transaction-capable provider. Preserve owner checks, funds coverage, wallet leases, deadlines and existing conflict recovery. Do not create a fresh trade, new signature or a new nonce to accelerate an uncertain submission. Keep the minute worker as backup. Record sanitized provider/method/error-category and attempt timing so future failures are diagnosable.
3. **Reduce approvals after verifying router/CDP support.** A Permit2 typed-data signature included in the swap could remove the standalone Permit2 approval transaction. It still requires ERC-20 approval to Permit2. Reusable token allowances would also reduce repeat approvals but change authorization exposure and should be a deliberate policy; do not silently grant unlimited access. Cache only observed allowance state at an appropriate block and recheck before signing.
4. **Reduce repeated preview work.** Keep a verified route through the approval sequence. Parallelize independent metadata, code and pool-state reads at the same pinned block, and skip unnecessary price rebuilding when merely determining the next approval. Always reprice and simulate the final swap against its original minimum-output commitment. Keep balance, nonce, ownership and delivery checks.

## Balance warning change

`WalletDashboard` previously sent every failed background balance read into the persistent transaction-message box, in addition to showing it on the balance card. A later successful read did not dismiss that persistent warning. That explains how a stale warning could remain when the balance looked normal; it does not mean every RPC failure was false.

Changed locally:
- Background balance failures no longer create persistent popups.
- When a previous balance is present, retain it and show the existing last-read timestamp instead of an alarming unavailable message.
- When no balance has loaded, retain the inline unavailable/retry notice.
- Never restore stale spendable amounts; no changes to transaction balance checks.

Validation: five balance-retention tests passed; WalletDashboard ESLint passed; diff whitespace checks passed. No live trade or deployment performed.

## Evidence and limits

Sanitized evidence is saved privately as `trade-speed-records.json`, `trade-speed-chain.json`, `trade-speed-logs.json`, `trade-speed-quotes.json` and `trade-speed-quotes-infura-first.json` under `.deployment-private/`. No keys or signed transaction payloads were printed or saved by these review scripts.

The accessible Convex log sample covered 13:19:27–13:25:44 UTC, so it does not cover the sell or the first buy approval. Vercel runtime logs were not available through the configured tools/local CLI. Consequently, exact errors behind those earlier attempts and exact browser-visible completion times remain unproven.
