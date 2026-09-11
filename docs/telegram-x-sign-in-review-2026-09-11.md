# Telegram X sign-in review

Reviewed the live authorization redirect, local OAuth routes, Convex linking/provisioning, recent link records and focused tests. No user was signed in, linked, unlinked or messaged by this review. Fixes remain local pending Vercel and Convex deployment.

## Confirmed problems and changes

1. Each browser previously had one set of OAuth state/verifier/Telegram cookies. Starting again could overwrite an in-progress attempt, causing invalid_state on the first return. New attempts have independent signed HttpOnly cookies selected by their random state. Legacy attempts remain supported during rollout. Missing/tampered cookies still fail closed.
2. The error page cleared Telegram context and retried plain website login. A valid Telegram attempt now gets a signed retry context; the retry preserves its original Telegram nonce. Expired links return to Telegram instead of silently becoming web login. Browser-switch/expiry errors explain the same-browser requirement.
3. Repeated callbacks could stage different return tokens for the same nonce/account, invalidating the first deep link. Return tokens are now deterministic HMACs bound to that nonce and authenticated X identity. They still require delivery from the originating Telegram user and private chat before access is granted.
4. A reopened, already-completed Telegram deep link previously said expired. It may now acknowledge the exact still-active original link without refreshing authentication or recreating a revoked/replaced link. Legacy nonce consumption remains single-use.
5. Concurrent first-wallet provisioning waited only 500ms for another request, then returned no wallet. It now observes the same idempotent creation for up to 20 seconds, stopping when provisioning stops. Ownership and Arc-chain checks remain in place; no duplicate creation is started by the waiter.
6. Failure reporting now identifies token exchange, X identity lookup, wallet creation, Telegram staging or session registration without logging tokens or provider response bodies. The callback has an explicit 120-second server duration budget.

## Existing and new wallets

- Existing wallets are selected by canonical X user ID and reused; successful recent Telegram linking of the existing TheArgosBot wallet appears in the records.
- StudholmeOne's wallet was created immediately before its successful Telegram link, providing live evidence of first-time creation through this interaction. This is evidence for the deployed baseline, not an end-to-end mobile test of the local changes.
- The earlier chain-4663 provisioning error was fixed and deployed in the prior task. Creation now requests 5042; regression coverage verifies the request against the actual signer schema.
- Active links remain one-to-one. A wallet already linked to another Telegram user is rejected; a Telegram user linked to another X wallet is rejected. Revocation and per-command authorization binding remain enforced.

## X error page and mobile limits

The live start route redirects to https://x.com/i/oauth2/authorize with S256 PKCE, users.read/tweet.read, and callback https://www.argosbot.io/api/auth/x/callback. These endpoint forms match X's documentation: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code and https://docs.x.com/tutorials/postman-getting-started.

The reported X “This page is down” screen was not reproduced or conclusively diagnosed. It occurs before our callback if it is shown by X, so it must not be labeled as a proven Argos callback failure. Recent successful sign-ins make a universally broken client ID/callback unlikely, but do not establish mobile reliability.

Telegram's embedded browser, an external browser and X's application can use different cookie stores. A callback in a different cookie store cannot safely finish the original attempt. Keep the browser/PKCE check; do not bypass it to hide the error. The retry page now directs users to restart and finish in the same browser and always offers a return to Telegram. Browser/app handoff itself is controlled by the device and those applications.

Link records include unconsumed/expired nonces. Those indicate incomplete journeys, not a measured backend failure rate; some are unused buttons. Precise production callback failure attribution still needs the new safe stage diagnostics after deployment.

## Validation

48 focused tests passed across OAuth return, recent authentication, consent routes, account linking, consent security and wallet provisioning. Coverage includes concurrent attempts, original nonce preservation, tampered/missing cookies, expired links, deterministic return tokens, duplicate returns, revoked links, wrong users/chats and concurrent creation. TypeScript and production build were checked separately. No security bypass, wallet migration, user credential change or live financial action was introduced.
