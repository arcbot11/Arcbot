# Bridge wallet release handoff

Prepared locally on September 24, 2026. This handoff does not deploy or perform wallet transactions.

## Release contents

Include the changed and new bridge website, API, `lib/bridge`, tests, documentation, middleware, package manifest and lockfile, **plus `convex/otc.ts` and the changed `lib/otc` files**. Include the pending Base token balances and withdrawal changes as well. Many new bridge files are currently untracked: include them when committing, not just the tracked diff.

Do not include `.env.local`, `.deployment-private`, wallet manifests or transaction journals. The unrelated operator notes in `AGENTS.md` and research exports under `reports/` are not required for this release. Do not reset or delete them.

## Deployment order

1. Deploy Convex from this same checkout to the production deployment used by the website. Check the selected Convex project/deployment first, then run `npx convex deploy`. This includes the new `bridge_reject` mutation and shared transaction validation, reservation release and expiry handling. No new schema migration is required.
2. Push the complete release to GitHub and deploy/rebuild Vercel. If a GitHub push automatically deploys Vercel, finish step 1 before pushing. The website and `/api/otc/worker` are delivered together by Vercel; there is no separate worker service to start.
3. Verify the new production deployment and both wallet buttons before inviting users to transact.

Do not use the old `.deployment-private/deploy-external-bridge.mjs` as a complete release procedure: it only deploys the website snapshot and does not deploy Convex. Do not run operator scripts or restart crank automations as part of deployment.

## Configuration already completed

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is configured locally and in Vercel production as `975223e88e095de253beda08169aa595`. This is a public ID, not a signing credential. Reown reports both `https://www.argosbot.io` and `https://argosbot.io` as allowed origins. A new Vercel build is required to include the ID in the client bundle. Preview domains need their own allowed-origin configuration if they are used for testing.

Keep the existing production CDP, session, Convex and RPC secrets unchanged. Bridge quote verification uses `BRIDGE_QUOTE_SECRET` when configured, otherwise `WEB_AUTH_SECRET`. No additional bot-wallet key is needed.

## Validation completed

- All 89 bridge tests passed, including bot-wallet request binding, duplicate prevention, reservation release and recovery.
- Production build passed with existing dependency/lint warnings.
- Reown configuration and wallet-directory requests returned HTTP 200 for both site origins.
- Local rebuilt UI opened the WalletConnect QR modal and wallet directory, dismissed cleanly, and switched to the Argos Bot Wallet sign-in prompt.
- Arc and Base public RPCs returned chain IDs 5042 and 8453 respectively.

No real wallet was connected and no signatures or transactions were requested. Account connection, wallet network switching and end-to-end funds movement are not validated by these checks.

## Read-only production checks

Open `/bridge`, switch between Connected Wallet and Argos Bot Wallet, and open/dismiss WalletConnect without pairing a wallet. Verify the bot option asks signed-out users to sign in. Check browser logs for CSP or Reown errors. Confirm unauthenticated bot bridge requests remain rejected. Token lookup may be tested without connecting a wallet. Do not confirm any bridge, approval, registration or wrapper-creation transaction without separate authorization.
