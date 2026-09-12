# Website sign-in with Telegram

Implemented locally; requires deployment of both the website and Convex updates. No live wallet actions were performed.

Every general website connection link opens `/wallet/sign-in`, with **Sign in with X** and **Sign in with Telegram**. Account switching is also available from the wallet menu. The browser has one signed wallet-session cookie. Successful account replacement revokes the old server session; other open tabs refresh their wallet display.

Telegram sign-in opens `The_ArgosBot` with a random, ten-minute challenge. The bot displays a matching code and requires explicit approval in the user's private chat. Users return to the original browser after approval. This follows Telegram's documented [bot deep links](https://core.telegram.org/bots/features#deep-linking), without an embedded login widget or extra BotFather domain configuration.

The browser proof stays in an HttpOnly, same-site cookie. Only its hash is stored in Convex; it never appears in the bot link. The challenge binds to the permanent native Telegram wallet on first presentation. Another user cannot approve it, and another browser cannot exchange it. Approval alone does not expose a usable website cookie. Exchange retries reuse the same session and original expiry, and revoked sessions cannot be reactivated by replay.

Both providers now use a shared browser generation in Convex. Only the latest login attempt can activate; sign-out invalidates pending attempts as well as the active session. Newly issued sessions require the signed browser cookie and the current active session hash. Existing X wallets and valid legacy X sessions keep their original identities. Website X sign-ins already in flight from before this security update must restart because their attempts lack a browser generation.

Sign-in starts are limited to 5/browser/minute, 20/source/minute, and 300/minute globally. No extra secrets are needed. The Vercel source-header behavior is documented in [Vercel request headers](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for); non-Vercel hosts use a shared source limit. Expired challenge/session and limiter records are cleaned on a minute schedule without removing active sessions.

Sessions expire after two hours. Moving funds retains the existing 30-minute recent-authentication requirement, same-origin checks, CSRF protection, and live ownership verification. The native owner namespace is `tg:<numeric ID>`; it never uses a fabricated X identity. Shared website balances, trades, transfers, Base withdrawals, history, and OTC routes all use that owner. Signing in does not change Telegram's selected wallet or X link.

Users must create their permanent TG wallet with `/createtg` first. Telegram sign-in never automatically creates one or substitutes an X-linked wallet. X-only users should use the X sign-in button.

Existing environment settings are reused: `WEB_AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`, `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_WEBHOOK_SECRET`. Keep the website and bot on the same Convex deployment. No bot command-menu update is needed specifically for web sign-in.

Deployment validation: open the chooser on desktop and mobile; test an existing TG wallet, an X-only user, and a user with both; verify both switch directions, sign-out, expiry, and a second browser rejection. Confirm wallet addresses remain unchanged before any funded smoke test.

Local validation passed: 216 tests across 17 files, Convex code generation/typechecking, and the production Next.js build. Existing unrelated unused-variable warnings remain. Live mobile approval has not been tested.
