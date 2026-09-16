# Coordinated launch release

Public admission is controlled by `LAUNCH_EXECUTION_ENABLED`; preparation additionally requires `ARGUS_LAUNCH_PREPARATION_ENABLED=true` in both Vercel and Convex. These are separate from recovery. Do not enable public execution as part of a routine fix deployment.

1. Run the launch/API/X/creator-fee suites, Convex type checking and production build. Review the exact source snapshot. Exclude environment files, wallet manifests, signed transaction journals and `.deployment-private` from upload.
2. Verify the Convex deploy key identifies the backend configured by `NEXT_PUBLIC_CONVEX_URL`; verify the Vercel project owns `www.argosbot.io`. Deploy schema/functions first, then the same source version to Vercel. Confirm READY and the production alias.
3. Check `launchExecution:directoryPage` and `creatorTokensPage` are present. The launch recovery cron must remain installed regardless of admission settings. Its bounded oldest-first sweep and fenced worker lease recover abandoned orchestration without duplicate signing.
4. During a pause, recovery finishes existing signing attempts and receipts, cancels provably unsigned steps and closes incomplete runs. It does not start another setup/deployment signature. Paused partial setups require a fresh user-authorized draft later.
5. Keep test contracts in the catalog exclusion list and never insert operator test launches into `verifiedBotLaunches`. Contract-address access on the public chain is unaffected.
6. Before public enablement, exercise authenticated customer acceptance and final status, an X command and final reply, lost-response recovery and multi-step setup with a deliberately bounded test. Operator-only tests do not establish these integrations. Do not post from the bot or spend customer funds without authorization.
7. Enable admission only as a deliberate coordinated release, after ensuring fees, Portal/hook fingerprints, RPC configuration and paired-price policy remain valid. A new Portal or fingerprint requires review; never bypass checks to recover an old signed transaction.

The token directory remains development-only until its own release. The How to Launch guide is unavailable in production while preparation is disabled.
