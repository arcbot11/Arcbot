# TG/X dual-wallet review — September 11, 2026

**Follow-up: all five findings below have been fixed locally.** The original review is retained for context. See the follow-up verification at the end.

Local code review. No live Telegram messages, CDP provisioning, transactions, or deployments were performed. Application code was not changed in this review.

## Findings

### 1. P1 — Rapid switch-then-trade input can spend the previous wallet

`convex/telegram.ts:105` captures the selected wallet at intake, while `convex/telegram.ts:462` applies a switch later in a scheduled action. Reproduction: start with X selected; receive `/usetg`; receive `/buy` before the switch action runs; execute the switch. Current selection is then TG, but the buy still authorizes the previous X wallet. Existing request binding prevents later redirection, but there is no ordering barrier for the earlier switch.

Serialize wallet-selection operations with subsequent intake, or reject spending commands while a switch is pending. Do not rebind already accepted financial work to a different wallet. Until fixed, users must wait for switch confirmation before sending another command.

### 2. P2 — An old unlink command can revoke a newer X link

`convex/telegram.ts:464` revokes the current context's X owner. Management commands execute before the original intake-binding check. A delayed or recovered `/unlink` received for an old link can therefore revoke a subsequently established X link. The offline probe confirmed the new owner was passed to revocation without inspecting the original binding.

Bind unlink operations to the exact link ID at intake and make replay a no-op after that link is revoked. Preserve the TG-native wallet and signed-transaction recovery.

### 3. P2 — Configuration/authentication failures can remain Processing indefinitely

`convex/telegramWallets.ts:127` and `:129` throw for missing service authentication or any non-successful HTTP response; the catch does not record a diagnostic or end a financial request. `finish` schedules another attempt after five seconds. A one-hour-old buy with no service secret remained pending with no result. The API's normal authorization deadline cannot help when the request never reaches that API.

Expose actionable configuration/authentication failures, retain safe diagnostic codes, and back off appropriately. Do not release funds merely because an HTTP response is uncertain.

### 4. P2 — A failed callback acknowledgement prevents the button action

`convex/telegram.ts:422` awaits `answerCallbackQuery` before running the command. Simulating an expired callback response caused `/usetg` to be marked failed without executing selection. This also affects delayed/recovered Create TG Wallet and other buttons. Failed updates are outside the existing received/processing recovery scan.

Treat callback acknowledgement as best-effort UI feedback; validate and process the persisted command independently using its original identity and deduplication key.

### 5. P2 — Notification failure can overwrite a successful balance result

The shared catch at `convex/telegramWallets.ts:139` covers both lookup and delivery. Once a request is over two minutes old, a failed notification changes a saved successful wallet/balance result into `Balance lookup failed`. The probe reproduced a saved `Balances / 100 USDC` result being replaced after delivery failed.

Separate lookup failures from notification failures. Preserve the completed result and retry only its delivery.

## Checks that passed

- 228 existing focused tests across 12 files passed again.
- Existing X CDP account names remain unchanged; TG account names use a separate namespace.
- Existing X links default to X without migration.
- TG ownership uses its numeric Telegram ID and a separate permanent record.
- Native trades use the shared website command endpoint and transaction engine.
- Previously accepted commands retain their original wallet across a completed switch.
- Unlink cancellation and the atomic signing fence preserve already-started signing recovery in the existing regressions.
- OAuth state, nonce identity checks, and existing/new X wallet compatibility tests passed.

Five additional offline probes reproduced the findings above. The probes use in-memory data and mocked HTTP responses; they are saved under the ignored `.deployment-private` directory. Real mobile OAuth and funded native-TG end-to-end testing remain outside this review.

## Fixes and follow-up review

1. Wallet-changing commands establish a per-user barrier in the same intake mutation that records the command. Financial commands received during that barrier are durably rejected and must be sent again after confirmation. They cannot execute later or be rebound to another wallet. Commands accepted before the change retain their original binding. Terminal processing clears only its own barrier.
2. Intake captures an independent exact X link ID for unlink, including when TG is selected. A stale/replayed unlink cannot affect a replacement link, even if it uses the same X owner. Legacy intake uses its original bound link only.
3. Native service configuration/authentication failures persist safe diagnostic codes, issue a deduplicated actionable notice, and retry after five minutes. They do not mark uncertain transactions failed or release reservations. Transient failures back off rather than retrying every five seconds.
4. Callback acknowledgement failure is best-effort UI feedback and no longer aborts command processing. Existing identity, rate-limit, and original-wallet checks still apply.
5. Lookup and delivery error handling are separate. Completion records are immutable; stale workers cannot overwrite them or send a replacement result. Delivery failure retries the saved result only.

The follow-up also checked ownership isolation, legacy X defaults/account naming, unlink/signing serialization, rejected-request authorization, failed-change barrier cleanup, and shared transaction recovery. Active native worker leases now move their due time forward so leased rows cannot occupy the front of recovery selection.

341 focused tests passed across 16 files, including the new regression cases. No additional blocking defect was found in the reviewed paths. Real mobile OAuth and funded TG-native end-to-end verification remain deployment smoke tests. No live wallets or transactions were used for this work.
