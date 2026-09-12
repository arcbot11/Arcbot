# Telegram website sign-in security review

Scope: local Telegram website authentication, X/TG session replacement, sign-out, Telegram approval, permanent-wallet ownership, and shared website authorization. Application code was not changed during this review. All test identities and external services were mocked; no Telegram messages, live authentication, or financial transactions were performed.

## Remediation follow-up

All three findings below have now been addressed locally. The original findings are retained as the review record.

- X and Telegram website sign-ins now share a signed, HttpOnly browser cookie and a Convex browser generation. The latest start supersedes earlier attempts. Activation and revocation of the previous session occur in one mutation; only one session can activate in a generation. Every new session also checks its browser binding and current active session hash. A late HTTP response cannot restore server authority after logout or a newer activation.
- Sign-out advances the generation, invalidates pending X/TG authentication, revokes active/previous sessions, and clears attempt cookies. Even a retained cookie or an in-flight response cannot complete an older generation. Choosing an already signed-in X session also cancels competing pending authentication. Telegram-to-X linking clears and revokes the browser session without changing permanent wallet ownership.
- Starts are limited per minute to 5 per browser, 20 per source, and 300 globally. On Vercel the source is derived from its trusted `x-vercel-forwarded-for` header; other hosts use a conservative shared source bucket rather than trusting caller-supplied forwarding headers. Only HMAC source digests are stored. Telegram request bodies are capped at 512 bytes. Bootstrap sets a browser cookie without allocating a database record. A minute cleanup job removes expired rate limits and browser rows, and deletes Telegram challenges only after their possible two-hour session lifetime has also elapsed.

New regression coverage is in `tests/webAuthSecurity.test.ts`, including both concurrent completion orders, delayed responses after logout, preservation/revocation of legacy X sessions, foreign-browser rejection, one activation per generation, source/browser throttling, and safe retention. The private original reproduction probes below describe the old contract and are not current regression tests.

233 focused tests across 18 files passed after remediation. Local TypeScript checks and the production Next.js build passed. Convex remote code generation was blocked by automatic approval review over possible source upload; the local API declarations were updated and checked without deployment. Production/mobile smoke testing remains necessary after deployment to the existing Convex/Vercel projects.

## Findings

### 1. P2 — Concurrent login completion bypasses the single-active-session rule

Locations: `app/api/auth/telegram/route.ts:39` and `app/api/auth/x/callback/route.ts:126`.

Each flow activates its new session and independently revokes only the previous session included in that HTTP request. Two in-flight completions can carry the same previous cookie. The Telegram and X completions both revoke that old session, but neither revokes the other's newly created session. Both new server sessions remain valid. The browser has one cookie at any instant, but whichever response arrives last selects the displayed wallet; the other issued cookie remains valid on the server.

Reproduced with parallel calls to both real Next route handlers, the actual Telegram exchange/session mutations, an in-memory database, and mocked X session persistence. Both new sessions remained active while the original was revoked. This does not itself let an attacker authenticate without approval, but it violates the promised account-switching invariant and makes stale responses unsafe.

Recommended fix: maintain a server-side browser login generation/shared session family. Atomically activate one session and supersede the previous generation across both providers. Reject stale callbacks/exchanges and check the generation on every session-authorized request. Preserve recovery of already-submitted transactions separately from session authority.

### 2. P2 — Sign-out leaves pending Telegram authentication usable

Location: `app/api/auth/x/session/route.ts:39`.

Sign-out revokes the current wallet session and clears its cookie, but does not clear the Telegram attempt cookie or invalidate an approved challenge that has not yet been exchanged. A delayed/replayed poll can finish that login after successful sign-out, without fresh Telegram approval, until the ten-minute challenge expires.

Reproduced: approve a Telegram challenge, sign out an existing X session, then exchange the retained challenge/proof. Sign-out returned success and the later exchange issued an active Telegram wallet cookie.

Recommended fix: sign-out must invalidate all pending login attempts in the current browser family and advance its generation, as well as clear attempt cookies. Clearing cookies alone does not invalidate requests already in flight. Cover pending X OAuth completion as part of the same fix.

### 3. P2 — Unauthenticated challenge creation has no application throttling or retention cleanup

Locations: `app/api/auth/telegram/route.ts:25`, `convex/telegramWebAuth.ts:13`, and the absence of a cleanup job for `telegramWebLogins`.

Each accepted start request inserts a durable record. The route checks Origin, but a non-browser client can supply that header. There is no per-source/browser start limit or reuse rule, and expired login records are never deleted. This enables avoidable database/function cost and storage growth. Actual platform/WAF limits were not audited.

Reproduced 30 sequential unauthenticated start requests through the real route and actual start mutation: every request succeeded and created a distinct record. No load test was performed.

Recommended fix: add trusted-source and browser throttles, reuse an unexpired pending attempt where appropriate, bound request bodies, and periodically delete expired records only after their possible session lifetime has elapsed. Keep active sessions intact.

## Controls checked

- Browser proof is random, HttpOnly, and absent from the bot link. Only a digest is persisted.
- Bot approval requires a private Telegram identity and an existing permanent native TG wallet. An X-linked wallet is not silently substituted.
- Cross-user confirmation, foreign-browser exchange, incorrect service secret, expiry, and revocation are rejected by the covered tests.
- Same-origin checks and session-bound CSRF checks guard website mutations. Moving funds also checks recent authentication and wallet ownership.
- X and TG principals are distinct, including when their numeric IDs match. Existing X session cookies remain supported.
- Telegram webhook authorization remains required. Sensitive website pages include the sign-in route in the nonce-based script policy; production header delivery was not inspected.
- Delayed transaction replies retain the executing wallet identity; labels depend on both links being present. Labels do not grant authority.

Approving a login someone else initiated still grants that initiating browser wallet access. The displayed matching code is a confirmation cue, not an independent second factor. The explicit in-bot warning must remain.

## Evidence and limits

90 existing focused security/regression tests passed across 10 files. Three additional private review probes reproduced the findings above. They live in `.deployment-private/telegram-web-security.test.ts` and are excluded from the ordinary test suite; their passing assertions confirm the current undesirable behavior, not remediation.

No direct unauthorized wallet access was demonstrated in these tests. This is a scoped local review, not a production penetration test. Fix the session invalidation findings before enabling the feature publicly, then repeat race/logout tests and perform a live mobile sign-in smoke test.
