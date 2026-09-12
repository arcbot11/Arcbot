# Telegram and X wallets

Implemented locally. No live account creation, trading, or Telegram messages were used for verification.

## Behavior

- New users see **Create TG Linked Wallet** and **Link X** on `/start`.
- A TG wallet is permanently bound to the numeric Telegram user ID, in that user's private chat. Changing a Telegram username does not change its wallet.
- Existing X-linked users keep their original wallet and default X selection. No migration changes `cryptoWallets`, `xReplyUsers`, or existing links.
- Creating a TG wallet selects it. Completing a fresh X link selects the existing canonical X wallet (or the wallet created by the established X login flow).
- Users with both wallets can switch with buttons, `/usetg`, or `/usex`. Switching moves no funds.
- Wait for wallet-change confirmation before sending a financial command. Commands received during the change are rejected without submission; send them again after confirmation.
- `/unlink` removes Telegram's access to X only. TG remains available, and the X wallet remains accessible through X and website login.
- Menus, instructions, and results identify the selected or executing wallet. Results for queued work identify the wallet originally selected, even after a switch.
- TG wallets support balances, wallet lookup, buy, sell, swap, send, burn, and Base ETH withdrawal. Financial commands use the same `/api/arc/command`, reservation store, RPC routing, signing, and receipt verification as website/X commands.
- TG-linked wallets can now sign in on the website using browser-bound approval inside the bot. See telegram-web-sign-in.md. X and TG identities remain separate; one wallet is active per browser.

## Ownership and recovery

Native TG owners use `tg:<numeric Telegram ID>` in the shared transaction store. They are not fabricated X identities. Existing X CDP account names are unchanged; TG accounts have a distinct deterministic namespace.

Intake captures the selected native wallet ID or the existing X link ID. Changing selection does not change a queued request. Native requests and scheduling commit in one mutation; retries retain the same transaction IDs. Completion is saved before notification, so delivery retries do not repeat trades.

Unlink cancels only transactions provably never signed for that specific Telegram-to-X link and releases their reservations. A final atomic signing check closes the race between preflight and unlink. Transactions already in signing retain their funds and recover the original signature and receipt. Revoked requests can recover existing transactions but cannot start another step, including a swap after a completed approval.

## Activation order

1. Deploy the website changes to the existing Vercel project. This adds TG ownership support to the signer and the shared command endpoint.
2. Deploy Convex to the **same deployment already used by the live website**. Match its `NEXT_PUBLIC_CONVEX_URL`; do not create or switch to another deployment. Retain all existing tables and CDP settings.
3. Refresh Telegram's command menu without replacing its webhook or dropping updates:

   ```powershell
   Set-Location 'C:\Users\potato\Documents\Arcbot\Arcbot'
   node --use-system-ca --env-file-if-exists=.env.local scripts/configure-telegram-bot.mjs --commands-only
   ```

No additional environment variables are required. Keep the current CDP project and wallet signer identity secret. Do not delete native wallet records on rollback: they are the permanent ownership bindings.

## Verification

Offline regressions cover existing X identity preservation, all menu states, native owner isolation, idempotent wallet binding, queued-command selection, unlink cancellation, signing recovery, shared API routing, and completion-delivery retries. The CDP test asserts the exact pre-existing X account name.

Validation: 327 focused tests passed across 16 files; the production Next.js build passed. Existing unrelated unused-variable warnings remain.

Follow-up fixes: 341 focused tests passed across 16 files. The five findings in `telegram-dual-wallets-review-2026-09-11.md` are resolved locally, including wallet-change intake barriers, exact-link unlinking, service failure notices/backoff, callback acknowledgement recovery, and immutable result delivery.

After deployment, verify `/start` and `/wallet` on an already-linked account show its original X wallet. Create a TG wallet, switch both ways, then unlink X and check the TG wallet remains selected. Verify a new user's onboarding separately. Funded transaction and real mobile OAuth testing still require a live smoke test.
