# Arc Bot project review — September 10, 2026

Scope: local source, full Vitest suite, TypeScript, deployed Convex configuration and records, public production HTTP routes, accessible Vercel projects, Telegram API, and the preceding read-only CDP/wallet/RPC checks. No signing, broadcasting, deployment, or remote configuration changes were performed. Secret values were not written to this report.

## Findings

### P1 — No verified Arc transaction broadcast path

Local ARC_MAINNET_RPC_URL is empty and the variable is absent from the inspected Convex environment. The previous direct Arcscan probes reset connections; Argus's read proxy explicitly refuses eth_sendRawTransaction. The new Vercel project's environment cannot be inspected with the available token. Reads and wallet provisioning do not establish readiness to send transactions. Obtain access to the correct Vercel project and run a protected read-only capability probe from that host before configuring a broadcast provider.

### P1 — OTC still requires a contract despite the desired contract-free design

lib/otc/runtime.ts otcConfiguration and verifyRouter require the Base router address, code hash and fee recipient. Payment construction in lib/otc/transactions.ts still calls pay/payUsdc. Production /api/otc returns available:true, enabled:false. No OTC records exist in the inspected Convex deployment. Removing the contract dependency requires implementing direct seller and fee transfers with separately persisted verification and recovery; configuration changes alone cannot do it.

### P1 — An unsigned prepared swap can permanently occupy the wallet lease

app/api/wallet/trade/route.ts persists a transaction and activeTx before advanceTransaction runs. lib/otc/runtime.ts simulates the stored swap before signing; after the router deadline passes this can repeatedly fail. The transaction model has no cancelled/expired prepared state, and the worker retries the same bytes. Existing payout retry recovery does not cover standalone prepared swaps. Add a serialized cancellation/requote path that distinguishes provably unsigned requests from signing-in-progress, signed and broadcast requests; never release an uncertain signature's reservation merely because time passed.

### P2 — Production wallet provisioning retains legacy chain and launch defaults

Both deployed wallets have chainId:4663 and launchEnabled:true. convex/wallets.ts finishWalletProvisioning writes these defaults and checks existing bindings against the legacy chain. Current Arc transaction APIs explicitly use 5042, so this is not evidence that the deposited Arc funds went to another chain. Fix provisioning and migrate existing metadata together, preserving addresses, owner links and signer references. Launch workflows must remain blocked.

The addresses match their CDP accounts. @ArcChainBot has 46 native Arc USDC; @Arctos_Arc has zero. Both had zero Base ETH and Base USDC and nonce zero in the preceding live check. CDP account names contain arcbot-rh-. Do not rename/rederive deterministic account identities without a migration strategy.

### P2 — X and Telegram operation is not ready

The inspected Convex environment has OAuth website-login credentials, but lacks X_REPLIES_ENABLED, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET and X_BOT_USER_ID. convex/xReplies.ts requires the posting credentials and explicit enablement. Website X login working does not establish X mention/reply operation. Telegram getMe succeeds for @TheArcChainBot, but getWebhookInfo reports no configured webhook. No messages were sent during the audit.

### P2 — Deployment access and credential isolation need cleanup

The available Vercel token, both default scope and the configured team, lists only the old ponsbot project. It does not establish which account owns the currently working arcchainbot.io deployment. The CDP credential can see old-project accounts as well as the new wallets. Convex also contains administrative deployment, Vercel and provider-management credentials copied from local configuration. Review runtime references and remove unnecessary management credentials from application runtime environments; use project-scoped access for the new deployment. Do not delete old accounts or rotate credentials blindly while existing wallets depend on them.

### P2 — Full regression suite does not pass

173 test files: 37 failed, 122 passed, 14 skipped. Individual tests: 288 failed, 1,969 passed, 16 skipped. Many failures expect removed launch behavior, old token catalog entries or the deleted stats page. Other failures include wallet-signer valuation fixtures. Do not classify every failure as harmless without triage. Update obsolete tests to assert current disabled behavior and retain tests for live Arc paths. TypeScript passes. The earlier production build passed after the CDP external-package fix; a fresh production build was not repeated in this review.

### P2 — Routing has availability and coverage limitations

previewArcTrade runs Argus discovery before either protocol's quotes; an error at an unrelated Portal can abort trading even when a usable V3 route exists. Protocol discovery is sequential and a V3 factory RPC error can prevent V4 attempts. Isolate unavailable candidate discovery without weakening validation of any route that will actually execute.

Known Argus hooks are discovered from per-token records and their pool IDs are checked. The live test verified one deployed hook; tests of full hooked trade preparation use mocks. This is not funded execution evidence. Native-output V4 still requires debug tracing, which the tested read proxy rejects. Token-to-token hooked V4 multihop and mixed V3/V4 execution remain unsupported.

## Working checks

- Public /, /wallet and /otc return HTTP 200.
- HSTS and X-Frame-Options:DENY are present on inspected responses.
- Session and OTC data endpoints return Cache-Control:no-store.
- Unauthenticated POSTs to wallet send, wallet trade, OTC, OTC worker and Arc command return 401.
- X OAuth start redirects; prior successful provisioning establishes two actual website-linked wallets.
- Both Convex owner links and signer addresses match their CDP accounts.
- Production market reads succeed with zero listings; Convex has zero OTC records and zero walletRequests.
- Local session revocation, CSRF, expiry, OTC reservation and receipt-verification regression tests pass in their focused suites.
- No authenticated browser transaction, real payout, or live swap was executed by this review.

## Recommended order

1. Resolve correct Vercel access and test broadcast connectivity from that host.
2. Fix wallet metadata/defaults with an address-preserving migration.
3. Add safe recovery for unsigned prepared transactions.
4. Implement the chosen contract-free OTC payment state machine.
5. Configure X posting and Telegram webhook only when ready for those channels to operate.
6. Triage the full test suite, then conduct explicitly authorized small funded tests covering sends, approvals, buys, sells and partial OTC settlement failures.
