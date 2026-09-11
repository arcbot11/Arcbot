# Telegram and website transaction alignment

## Live setup

- Bot: @The_ArgosBot, Telegram ID 8280311402 (verified with getMe).
- Local token and webhook secret match Convex; Telegram is enabled there.
- Production webhook: https://www.argosbot.io/api/telegram/webhook.
- Configured Argos Bot name, descriptions, dog profile image and 13 commands.
- Webhook preflight rejects missing credentials and passes the configured secret to request validation. No chat message or funds were sent.

## Shared execution

Telegram commands are parsed deterministically, bound to their linked X owner in Convex and submitted through /api/arc/command. Website sessions use /api/wallet/trade and /api/wallet/send. These authentication boundaries remain separate; both use the same transaction engine.

| Feature | Shared infrastructure |
| --- | --- |
| Wallet | Existing X-owner CDP account mapping |
| Balances | Verified Arc RPC, token metadata, arcTokenBalances discovery |
| Buy / sell / swap | previewArcTrade, V3/V4/hooked pool discovery, current quotes and simulations |
| USD amounts | arcActionAmount / arcSellAmountForUsdc |
| Percentage token amounts | arcSelectedTokenBalance.maxSellRaw (known tax-aware maximum) |
| Send / burn | prepareArcSend / prepareCall; burn uses the dead address |
| Gas and funds | checkArcAvailable plus the atomic OTC repository prepare command |
| Signing and receipts | advanceTransaction; same CDP signer, RPC policy and delivery checks |
| Completion amounts | transactionHistory, using verified settlement amounts |

## Fixes

- Partial swap percentages survive the structured command validator (previously only 100% did).
- Telegram accepts swap token amounts and USD values, plus USD/percentage sends and burns.
- Percentage sells use the website's known-tax adjustment rather than the full token balance.
- Shared Arc send preparation replaces the duplicate social implementation; Base remains website-only.
- Invalid Telegram structured input cannot fall back to free-text parsing.
- New bot update IDs are namespaced to prevent collisions with records from the previous bot. Legacy deferred callbacks remain readable.
- Verified transaction results can return immediately instead of requiring another continuation.

## Validation and deployment

141 focused tests passed, covering command parsing through structured validation, percentages, USD conversion, reservation protection, authority changes, duplicate requests, immediate completion, wallet linking and consent.

Code changes require deployment to both Vercel and Convex. Telegram API configuration is live; local code changes are not deployed by this task. No funded Telegram transaction was performed. Shared execution reduces implementation differences but does not prove every token or provider will execute successfully.
