# Local environment audit — 2026-09-10

Current configuration changes supersede the environment recommendations below: see [CONFIGURATION.md](./CONFIGURATION.md). Retired flags are permanently disabled in code; public identity, gas limits, and the production worker URL no longer require environment variables.

Audited the archived `.env.local` (76 variables), archived `.env.x-oauth` (4 duplicate credentials), current source, and `.env.example`. No credentials or private addresses are reproduced here. No provider account was accessed, credentials revoked, or active environment restored.

The active repository has no `.env.local`. The archived files remain outside it in `../arcbot-inherited-local-backup-20260910/`. Keep that private backup out of Git.

## Findings

- The archived environment targets the inherited Convex project and contains its service credentials and contract configuration.
- `TELEGRAM_ENABLED`, `AUTOMATED_BUYBACK_BURN_ENABLED`, `AUTOMATED_FEE_SWEEP_BUYBACK_BURN_ENABLED`, and `CREATOR_SELF_BUYBACK_ENABLED` were true. Do not carry these values over.
- The four credentials in `.env.x-oauth` exactly duplicate `.env.local`; do not restore this second credential source.
- Arc/Base RPC checkpoints, website OAuth 2.0 credentials, web session secret, and OTC settlement configuration are absent from the archived files.
- Ordinary Arc token burns do not need any automated creator-fee or self-buyback configuration.
- Environment replacement does not migrate the legacy chain 4663 executor or implement the missing website buy/sell handler.

## Every archived local variable

References show up to two source files. A name referenced by a script does not imply runtime use. Convex deployment variables are consumed by its CLI even without application references.

| Variable | Action | Reason | Source references |
|---|---|---|---|
| `X_API_KEY` | Replace / verify ownership | Configure the Argos Bot X app and authorize @ArctosBot; verify the numeric user ID. No online account ownership check was performed. | `convex/xReplies.ts`, `scripts/authorize-x.mjs` |
| `X_API_SECRET` | Replace / verify ownership | Configure the Argos Bot X app and authorize @ArctosBot; verify the numeric user ID. No online account ownership check was performed. | `convex/xReplies.ts`, `scripts/authorize-x.mjs` |
| `X_ACCESS_TOKEN` | Replace / verify ownership | Configure the Argos Bot X app and authorize @ArctosBot; verify the numeric user ID. No online account ownership check was performed. | `convex/xReplies.ts`, `scripts/authorize-x.mjs` |
| `X_ACCESS_TOKEN_SECRET` | Replace / verify ownership | Configure the Argos Bot X app and authorize @ArctosBot; verify the numeric user ID. No online account ownership check was performed. | `convex/xReplies.ts`, `scripts/authorize-x.mjs` |
| `X_BOT_USER_ID` | Replace / verify ownership | Configure the Argos Bot X app and authorize @ArctosBot; verify the numeric user ID. No online account ownership check was performed. | `convex/automatedFeeClaimInfo.ts`, `convex/wallets.ts` |
| `X_REPLIES_ENABLED` | Set deliberately | Enable only against the dedicated bot/app and new backend. Archived Telegram was true; X replies were false. | `convex/graduationAnnouncements.ts`, `convex/xOperations.ts` |
| `X_REPLY_USER_DAILY_LIMIT` | Keep / review | Operational policy, not project identity. Reader exists; review effective behavior before restoring rather than copying old limits blindly. | `convex/xReplies.ts` |
| `X_REPLY_GLOBAL_DAILY_LIMIT` | Keep / review | Operational policy, not project identity. Reader exists; review effective behavior before restoring rather than copying old limits blindly. | `convex/xReplies.ts` |
| `X_REPLY_USER_WINDOW_LIMIT` | Keep / review | Operational policy, not project identity. Reader exists; review effective behavior before restoring rather than copying old limits blindly. | `convex/xReplies.ts` |
| `X_REPLY_GLOBAL_WINDOW_LIMIT` | Keep / review | Operational policy, not project identity. Reader exists; review effective behavior before restoring rather than copying old limits blindly. | `convex/xReplies.ts` |
| `X_REPLY_WINDOW_MINUTES` | Keep / review | Operational policy, not project identity. Reader exists; review effective behavior before restoring rather than copying old limits blindly. | `convex/xReplies.ts` |
| `X_REPLY_COOLDOWN_SECONDS` | Keep / review | Operational policy, not project identity. Reader exists; review effective behavior before restoring rather than copying old limits blindly. | `convex/xReplies.ts` |
| `OPENROUTER_API_KEY` | Replace recommended | Provider key may be reusable under the same owner, but a dedicated Argos Bot key isolates usage and revocation. Not a chain RPC or proof of Arc token coverage. | `convex/llm.ts`, `scripts/check-arc-apis.mjs` |
| `OPENROUTER_TEXT_MODEL` | Keep / review | Nonsecret parsing configuration; not tied to the previous blockchain. Provider/model availability was not checked. | `convex/llm.ts` |
| `OPENROUTER_STRUCTURED_OUTPUTS_ENABLED` | Keep / review | Nonsecret parsing configuration; not tied to the previous blockchain. Provider/model availability was not checked. | `convex/xWalletIntent.ts` |
| `WALLET_FEATURE_PROMPTS_ENABLED` | Remove | No current application reader found. Do not assume these enforce transaction limits. | None in scanned application/scripts |
| `X_CRYPTO_EXECUTION_ENABLED` | Keep false | Still controls the legacy chain 4663 executor. Enabling it does not enable Arc trading. | `convex/automatedFeeClaimInfo.ts`, `convex/wallets.ts` |
| `WALLET_SIGNER_TOKEN` | Replace if used | Fresh Argos Bot service/idempotency secrets for the existing wallet signer and provisioning integration. Do not reuse inherited secrets. | `convex/automatedFeeEngine.ts`, `convex/wallets.ts` |
| `WALLET_SIGNER_IDEMPOTENCY_SECRET` | Replace if used | Fresh Argos Bot service/idempotency secrets for the existing wallet signer and provisioning integration. Do not reuse inherited secrets. | `lib/wallet-signer/service.ts`, `scripts/check-wallet-signer.mjs` |
| `CDP_API_KEY_ID` | Replace | Use dedicated Argos Bot CDP project credentials and its wallet secret. A new key in the old project does not isolate its wallets. | `lib/otc/runtime.ts`, `lib/wallet-signer/service.ts` |
| `CDP_API_KEY_SECRET` | Replace | Use dedicated Argos Bot CDP project credentials and its wallet secret. A new key in the old project does not isolate its wallets. | `lib/otc/runtime.ts`, `lib/wallet-signer/service.ts` |
| `CDP_WALLET_SECRET` | Replace | Use dedicated Argos Bot CDP project credentials and its wallet secret. A new key in the old project does not isolate its wallets. | `lib/otc/runtime.ts`, `lib/wallet-signer/service.ts` |
| `WALLET_MAX_LAUNCH_BUY_USD` | Remove | No current application reader found. Do not assume these enforce transaction limits. | None in scanned application/scripts |
| `WALLET_MAX_SEND_USD` | Remove | No current application reader found. Do not assume these enforce transaction limits. | None in scanned application/scripts |
| `WALLET_MAX_SWAP_USD` | Remove | No current application reader found. Do not assume these enforce transaction limits. | None in scanned application/scripts |
| `WALLET_MIN_GAS_RESERVE_WEI` | Remove | No current application reader found. Do not assume these enforce transaction limits. | None in scanned application/scripts |
| `NEXT_PUBLIC_CONVEX_URL` | Replace | Use a separate Argos Bot Convex project/deployment. Deployment key belongs in deployment tooling, not client code. | `app/api/auth/x/callback/route.ts`, `app/api/auth/x/session/route.ts` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Remove | No current application reader found. Do not assume these enforce transaction limits. | None in scanned application/scripts |
| `CONVEX_DEPLOY_KEY` | Replace | Use a separate Argos Bot Convex project/deployment. Deployment key belongs in deployment tooling, not client code. | None in scanned application/scripts |
| `CONVEX_DEPLOYMENT` | Replace | Use a separate Argos Bot Convex project/deployment. Deployment key belongs in deployment tooling, not client code. | None in scanned application/scripts |
| `AUTOMATED_FEE_ADMIN_CDP_ACCOUNT_NAME` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_ADMIN_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_KEEPER_CDP_ACCOUNT_NAME` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_KEEPER_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_QUOTE_CDP_ACCOUNT_NAME` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_QUOTE_AUTHORIZER_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_PAUSE_GUARDIAN_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_TEST_LAUNCHER_CDP_ACCOUNT_NAME` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | None in scanned application/scripts |
| `AUTOMATED_FEE_TEST_LAUNCHER_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | None in scanned application/scripts |
| `AUTOMATED_BUYBACK_BURN_ENABLED` | Force false | Excluded fee/creator system. Keep explicitly disabled while its code remains. | `convex/automatedFeeEngine.ts`, `convex/wallets.ts` |
| `AUTOMATED_FEE_SWEEP_BUYBACK_BURN_ENABLED` | Force false | Excluded fee/creator system. Keep explicitly disabled while its code remains. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_NEW_LAUNCH_ENROLLMENT_ENABLED` | Force false | Excluded fee/creator system. Keep explicitly disabled while its code remains. | `convex/automatedFeeEngine.ts`, `convex/wallets.ts` |
| `AUTOMATED_FEE_EXISTING_LAUNCH_UPGRADE_ENABLED` | Force false | Excluded fee/creator system. Keep explicitly disabled while its code remains. | `convex/automatedFeeEngine.ts`, `convex/wallets.ts` |
| `AUTOMATED_FEE_BOT_COMMANDS_ENABLED` | Force false | Excluded fee/creator system. Keep explicitly disabled while its code remains. | `convex/automatedFeeClaimInfo.ts`, `convex/automatedFeeEngine.ts` |
| `AUTOMATED_FEE_MANUAL_TEST_ENABLED` | Force false | Excluded fee/creator system. Keep explicitly disabled while its code remains. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_CONTROL_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_VAULT_IMPLEMENTATION_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_VAULT_FACTORY_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_EXECUTION_ADAPTER_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_NATIVE_BUYBACK_EXECUTOR_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_PAIRED_BUYBACK_EXECUTOR_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_MANUAL_TEST_TOKEN_ADDRESSES` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_MANUAL_TEST_VAULT_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `scripts/deliver-automated-fee-test-allocation.mjs`, `scripts/inspect-automated-fee-test-cycle.mjs` |
| `AUTOMATED_FEE_PRIVATE_TEST_LAUNCHER_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `scripts/deliver-automated-fee-test-allocation.mjs` |
| `AUTOMATED_FEE_V3_ROUTER_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_V3_QUOTER_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `AUTOMATED_FEE_WETH_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `lib/automated-fee-policy.ts` |
| `COINGECKO_PRO_API_KEY` | Replace recommended | Provider key may be reusable under the same owner, but a dedicated Argos Bot key isolates usage and revocation. Not a chain RPC or proof of Arc token coverage. | `convex/marketData.ts`, `lib/coingecko-client.ts` |
| `OPENROUTER_MANAGEMENT_API_KEY` | Remove from runtime | Operator resource/usage diagnostics only. Keep separately if needed; use Argos Bot-scoped access where supported. Admin keys are not transaction RPC endpoints. | `scripts/check-project-resources.mjs` |
| `ALCHEMY_ADMIN_API_ACCESS_KEY` | Remove from runtime | Operator resource/usage diagnostics only. Keep separately if needed; use Argos Bot-scoped access where supported. Admin keys are not transaction RPC endpoints. | `scripts/check-arc-apis.mjs`, `scripts/check-project-resources.mjs` |
| `VERCEL_ACCESS_TOKEN` | Remove from runtime | Operator resource/usage diagnostics only. Keep separately if needed; use Argos Bot-scoped access where supported. Admin keys are not transaction RPC endpoints. | `scripts/check-arc-apis.mjs`, `scripts/check-project-resources.mjs` |
| `VERCEL_TEAM_ID` | Remove from runtime | Operator resource/usage diagnostics only. Keep separately if needed; use Argos Bot-scoped access where supported. Admin keys are not transaction RPC endpoints. | `scripts/check-project-resources.mjs` |
| `TELEGRAM_ENABLED` | Set deliberately | Enable only against the dedicated bot/app and new backend. Archived Telegram was true; X replies were false. | `app/api/telegram/webhook/route.ts`, `convex/telegram.ts` |
| `TELEGRAM_BOT_TOKEN` | Replace | Token for the dedicated Argos Bot Telegram bot. Do not restore the inherited token. | `convex/telegram.ts`, `scripts/check-arc-apis.mjs` |
| `TELEGRAM_WEBHOOK_SECRET` | Replace | New random secret shared by the Argos Bot webhook and backend. | `app/api/telegram/webhook/route.ts`, `convex/telegram.ts` |
| `NEXT_PUBLIC_SITE_URL` | Replace | Set the exact local origin (currently port 3003 when used) or the new production origin; OAuth and CSRF depend on it. | `app/api/auth/x/callback/route.ts`, `app/api/auth/x/session/route.ts` |
| `CREATOR_SELF_BUYBACK_ENABLED` | Force false | Excluded fee/creator system. Keep explicitly disabled while its code remains. | `convex/creatorBurnEngine.ts`, `convex/creatorBurnEnrollment.ts` |
| `CREATOR_SELF_BUYBACK_FACTORY_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `convex/automatedFeeEngine.ts`, `convex/creatorBurnEngine.ts` |
| `CREATOR_SELF_BUYBACK_EXECUTOR_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `lib/wallet-signer/creator-burn-enrollment.ts`, `lib/wallet-signer/creator-burn.ts` |
| `CREATOR_SELF_BUYBACK_FACTORY_CODE_HASH` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `lib/wallet-signer/creator-burn-enrollment.ts`, `lib/wallet-signer/creator-burn.ts` |
| `CREATOR_SELF_BUYBACK_EXECUTOR_CODE_HASH` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `lib/wallet-signer/creator-burn-enrollment.ts`, `lib/wallet-signer/creator-burn.ts` |
| `CREATOR_SELF_BUYBACK_NEW_LAUNCH_FACTORY_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `lib/wallet-signer/creator-burn-enrollment.ts`, `lib/wallet-signer/creator-burn.ts` |
| `CREATOR_SELF_BUYBACK_NEW_LAUNCH_EXECUTOR_ADDRESS` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `lib/wallet-signer/creator-burn-enrollment.ts`, `lib/wallet-signer/creator-burn.ts` |
| `CREATOR_SELF_BUYBACK_NEW_LAUNCH_FACTORY_CODE_HASH` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `lib/wallet-signer/creator-burn-enrollment.ts`, `lib/wallet-signer/creator-burn.ts` |
| `CREATOR_SELF_BUYBACK_NEW_LAUNCH_EXECUTOR_CODE_HASH` | Remove | Inherited fee contracts, authorities, accounts, or test assets; not used for ordinary dead-address burns. | `lib/wallet-signer/creator-burn-enrollment.ts`, `lib/wallet-signer/creator-burn.ts` |

## Add for Argos Bot

| Variables | Where / purpose |
|---|---|
| `X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET` | Website server. Dedicated X OAuth 2.0 application for wallet login; distinct from the posting credentials. Register the exact `/api/auth/x/callback` URL. |
| `WEB_AUTH_SECRET` | New random shared secret in website and Convex for wallet sessions/authenticated provisioning. |
| `X_BOT_USERNAME` | Set `ArctosBot` in the backend; default currently matches. Configure/verify `X_BOT_USER_ID` separately. |
| `NEXT_PUBLIC_ARCBOT_X_URL`, `NEXT_PUBLIC_ARCBOT_TELEGRAM_URL` | Public links to Argos Bot accounts only. |
| `TELEGRAM_BOT_USERNAME` | Dedicated Telegram identity, if Telegram is configured. |
| `ARC_MAINNET_RPC_URL`, `ARC_CHECKPOINT_NUMBER`, `ARC_CHECKPOINT_HASH` | Arc mainnet 5042 endpoint and trusted block checkpoint; required by Arc transaction validation. Do not rename the old RPC key and reuse its endpoint. |
| `BASE_MAINNET_RPC_URL`, `BASE_CHECKPOINT_NUMBER`, `BASE_CHECKPOINT_HASH` | Base mainnet 8453 endpoint and trusted block checkpoint for website Base sends and OTC. |
| `ARC_MAX_GAS`, `ARC_MAX_FEE_PER_GAS`, `BASE_MAX_GAS`, `BASE_MAX_FEE_PER_GAS`, `BASE_MAX_TOTAL_FEE_WEI` | Actual current transaction policy settings. Review limits; existing defaults are in `.env.example`. |
| `OTC_SERVICE_SECRET` | New shared secret, minimum 32 characters, in website and Convex. Also required by managed-wallet reservation storage for ordinary sends. |
| `OTC_WORKER_URL` | Argos Bot website worker endpoint. Needed by transfer runtime, including regular sends, despite the OTC name. |
| `OTC_BASE_PAYMENT_ROUTER`, `OTC_BASE_ROUTER_CODE_HASH`, `OTC_FEE_WALLET` | Actual Base payment contract, verified deployed bytecode hash, and dedicated Argos Bot service-fee recipient. OTC-only; ordinary transfers do not need these three. |
| `WALLET_SIGNER_URL` | Argos Bot signer endpoint if explicitly configured; never point to the inherited deployment. Legacy signer use still needs Arc migration. |
| `ARC_SIGNER_PRIVATE_KEY`, `ARC_JOURNAL_DIRECTORY`, `BASE_SIGNER_PRIVATE_KEY`, `BASE_JOURNAL_DIRECTORY` | Optional local operator CLI only, not required for website CDP signing. Use dedicated accounts and persistent journals outside Git. |

## Clean up the example environment

The example is still a mixed legacy/current template. Remove old contract/account sections (`AUTOMATED_FEE_*`, `CREATOR_SELF_BUYBACK_*`, launch sponsorship and factory values, legacy RPCs, inherited token address). Preserve explicit false flags for excluded systems while code remains. `ARGUS_V4_*` and `ARGUS_PERMIT2_ADDRESS` in the legacy signer must not be treated as verified Arc routing configuration merely because of their names.

Remove inert `X_READ_EXCLUDE_WALLET_BALANCE` and `X_READ_EXCLUDE_SHOW_MY_WALLET` settings and stale filter commentary. The current direct-retrieval policy only uses the emergency premium mechanism; `X_AUTO_INTAKE_GUARD_ENABLED` controls that mechanism. Keep `X_GRADUATION_POSTS_ENABLED=false` and creation/sponsorship disabled. `OTC_ENABLED` is not a website rollout gate; it still restricts legacy/operator spending. Do not remove reservation checks.

`CSP_REPORT_ONLY=false` is an applicable website security default. `MARKET_INDEX_SECRET` authorizes inherited market data/import paths and should not be restored without deciding whether that path is part of the Arc deployment. `COINGECKO_ANALYST_ONCHAIN_ENABLED` is optional provider-specific analysis, not required for sends or OTC.

## Setup order

1. Create a separate Convex project and dedicated CDP project; record their identifiers without importing the old database or accounts.
2. Configure Argos Bot website origin, X OAuth login, fresh service secrets, and dedicated posting/Telegram identities.
3. Configure verified Arc/Base RPC checkpoints. Validate wallet provisioning and regular sends with the new backend.
4. Configure the deployed Base OTC payment contract, code hash, dedicated fee wallet, and worker. Validate reservation and settlement recovery.
5. Add optional provider/diagnostic keys separately. Keep launch and legacy automated fee systems disabled.

This audit intentionally does not copy any credential back into the project.
