# X and website execution review

> Historical audit. Account and deployment observations below are superseded by `docs/readiness-followup-2026-09-11.md`. Current public identities are in `lib/project-config.ts`.

Reviewed September 11, 2026. Changes are local; deployment is required.

## Execution

Explicit X mentions pass author checks, grounded command extraction, recipient resolution and wallet ownership validation. The social branch of `wallets.executeCommand` sends buy, sell, swap, send, burn, buy-and-send and buy-and-burn through `continueArcCommand` to `/api/arc/command`.

That endpoint shares `previewArcTrade`, `arcActionAmount`, `prepareArcSend`, durable reservations and `advanceTransaction` with website execution. These retain V3/V4 routing, known-tax amount handling, CDP signing, RPC submission and receipt/delivery verification. Burns use the dead-address transfer path. Retries reconcile stored transaction IDs before creating another step. Base and OTC remain website-only.

## Corrections

- Explicit swap parsing now supports token amounts, USD/USDC values, percentages and all. X grounding uses the same parser and still rejects quoted/hypothetical authority.
- USDC buys no longer attach a conflicting pair-asset field, including buy-and-send and buy-and-burn.
- Plain commands, structured validation and AI schemas cap slippage at the website's 1,000 basis points.
- Polling and publication verify the authenticated X user ID against the bot ID. Successful identity checks are cached for 60 seconds and invalidated by credential changes. Wrong-account credentials block publication before a POST.

## Live configuration

Local and Convex OAuth 1.0 credentials match, but `/2/users/me` authenticates as `@0xTheOdysseus` (2097782568934371330), not `@TheArgosBot` (2097696306135220226). Replies are disabled. Reauthorize OAuth 1.0 access tokens as the bot before enabling replies. Website OAuth login has the expected callback, PKCE and secure cookies.

## Validation and limits

262 focused tests passed across command grounding, shared execution, reply queue, explicit mentions, bot identity and recovery timing. Root and Convex TypeScript checks passed. Application lint has no errors; the existing reply-queue test fixture has pre-existing explicit-any lint errors. No public post or funded transaction was performed. Sharing execution code does not prove every token route has executable liquidity; live quotes and simulations still decide support.
