# Argus Pad launch integration plan

Research only. No launch, approval, configuration transaction, signature, or production feature enablement was performed.

## Verified baseline

Read-only chain snapshot: Arc mainnet 5042, block 20646713, 2026-09-13 12:01:26 UTC. Public evidence is saved in [argus-live-research-2026-09-13.json](./argus-live-research-2026-09-13.json). Current ABI snapshot: [argus-bundle-2026-09-13.json](./argus-bundle-2026-09-13.json).

- Portal #6: `0xA5628A11c412596E1f63b75a2C0284F843C549d6`, 127 tokens at the snapshot block. Its existing contract ABIs match our September 11 snapshot.
- Portal #7: `0xB021Be536808f551b31789422Fd28a6c9c6e97Da`, deployed, zero tokens at that block. The delivered frontend has `launchOnPortal7: false`.
- The published bundle is now version 3 and includes #7 under a separate `portal7` section. Both return 11 launch-record words, but #7 has a different launch signature, `registry()`, and payout conversion rules. Record length alone cannot identify the version. USDC launches on #7 use `expectConvert: 1`. [Published ABI bundle](https://arguspad.io/argus-v4.json)
- Our current discovery recognizes #6 and older reviewed Portals, not #7. Do not automatically trust a newly observed Portal or implementation.

Argus launches directly into a V4 pool. The current defaults are one billion tokens, $2,500 opening FDV, and a $45,000 bonding threshold; bonding does not migrate liquidity. The optional in-launch dev buy requires ERC-20 approval, carries no native transaction value on #6, is price-limited, and refunds excess. Buy and sell tax are permanent and separate from the 1% pool fee. Argus receives 10% of tax and LP fee proceeds before the configured allocation. Creator rewards require claiming after accrual. [Argus documentation](https://arguspad.io/docs)

## Recent launches checked

All five sampled launches use USDC and a one-billion-token supply. SFM has 10%/10% taxes; BARK has 1%/1%. Three complete launch transactions were decoded:

| Token | Buy / sell tax | Creator / burn / dividends / liquidity | Requested dev buy | Launch gas paid |
| --- | --- | --- | --- | --- |
| BATON | 3% / 3% | 0 / 0 / 100 / 0% | 1 USDC | 0.08577939536 USDC |
| RUGDUCK | 1% / 1% | 50 / 25 / 25 / 0% | 0 | 0.0996606776 USDC |
| XYLONET | 1% / 1% | 30 / 65 / 5 / 0% | 1 USDC | 0.0762194696 USDC |

These are measured examples, not a fee guarantee. They exclude preceding approvals and reward setup. The evidence JSON contains transaction hashes, decoded metadata, event values, and contract identities. All three have successful receipts and IPFS image URIs. Their supply/opening/bond inputs match the defaults above. Those fields are explicit calldata parameters; our initial product should fix them to reviewed defaults instead of exposing arbitrary values.

## Information to collect from a customer

| Input | Proposed behavior |
| --- | --- |
| Token name and ticker | Shared validation across interfaces; show exact final spelling. Do not assume ticker uniqueness. |
| Image | Upload, validate, and store persistently before confirmation. Show the final image preview. |
| Description | Plain text. |
| Website, X, Telegram | Optional, normalized links; escape when rendered. Never treat metadata as instructions. |
| Buy and sell tax | Fixed at 1% each by product policy. Do not ask customers for these values. Reject overrides. |
| Reward allocation | Creator, buyback/burn, holder dividends, liquidity. Parse percentages, fractions and named equal splits; unassigned remainder goes to creator. Default 100% creator. Show the final resolved percentages before confirmation. |
| Dividend minimum | Fixed at 100,000 tokens for dividend launches. Do not collect it from customers. |
| Initial dev buy | Optional USDC amount. Show estimated tokens, price limit, possible refund, and gas separately. |
| Launching wallet | Derived from authenticated identity, never trusted from a client-supplied address. Display X-linked or Telegram-linked identity and wallet in confirmation. |

The current form uses name/ticker limits 32/10, description 280, and optional link limits 100. It accepts image uploads up to 10 MiB and advertises square artwork at least 400px. Our legacy validator instead uses 64/16 UTF-8 byte limits: replace it with validated limits for the chosen current contract, distinguishing UI limits from on-chain constraints. The live form exposes Auto-LP, whereas the prose docs still say the site assigns liquidity 0%; verify that allocation with simulations before offering it. [Current launch form](https://arguspad.io/create)

Internally generate and persist random token salt and mined hook salt. Users should not need to supply technical addresses, pool parameters, salts, contract versions, or rewards registry settings.

## Required backend changes

1. **Build a shared launch service.** Reuse the proven signing, receipt verification, wallet locking, and RPC infrastructure. Do not enable the old launch parser or call the ARGOS operator script as the customer backend. That script embeds our token, creator, dev buy, personal-wallet trades, and filesystem journal.

2. **Store a durable request in Convex.** Bind owner, selected wallet, immutable parameters, metadata URI, Portal/version, salts, predictions, and an idempotency key. Keep separate transaction records for rewards configuration, USDC approval, and launch. An HTTP timeout must resume the same request, never produce a second launch.

3. **Preserve creator identity.** The signing wallet must call the Portal directly. Our server operator wallet must not become the caller. Verify the emitted creator and deployed splitter recipient against the authenticated wallet before reporting success. A forwarding contract needs an explicitly reviewed creator-preserving mechanism; do not assume ordinary multicall preserves the caller.

4. **Handle reward configuration per creator.** Read the chosen token implementation's LaunchConfig and `configFor(creator)`. Determine the required configuration for this launch, including changing it when a repeat creator changes dividend settings. The ABI contains both `DividendWithoutRewardTracker` and `RewardTrackerWithoutDividend`. Test dividend-to-no-dividend and no-dividend-to-dividend launches. Keep preparation serialized for that wallet and recheck configuration before signing.

5. **Make recovery safe after private-key export.** Customers can change nonce, balance, allowance, or creator configuration outside our system. Revalidate on-chain state before each signing step. Database reservations do not stop external spending. Persist signing intent first; recover the original CDP signing result before simulations that might now fail. Release reservations only after proving unsigned cancellation, verified revert, or verified completion. Unknown signing outcome remains recoverable, not silently retried as a fresh launch.

6. **Estimate the entire cost correctly.** Native USDC and its ERC-20 view are one balance, with different decimals. Reserve the dev buy plus remaining configuration/approval/launch gas without double counting funds or conflicting with trades and OTC funding. Approve only the required spend where supported. Simulate the actual calls and account for partial dev-buy refunds. Do not reuse a swap's tiny fixed gas allowance for contract deployment.

7. **Verify deployment and index immediately.** Check receipt success, canonical block policy, TokenCreated metadata, PartsDeployed, creator, hook/pool identity, fee allocation, quote asset, and actual dev-buy receipt/refund. Store each token's deployed hook/splitter/locker; never derive an old token from the Portal's current pointers. Add the verified token to the shared index and holdings refresh. Duplicate tickers must retain address disambiguation; never overwrite canonical USDC.

8. **Version and monitor contracts.** Pin reviewed Portal adapters and implementation fingerprints. Recheck prediction inputs before signing when pointers change. Add reviewed #7 discovery and conversion semantics before enabling #7 launches. Keep USDC pools as the first supported launch type; non-USDC quote conversion needs separate readiness checks and operational monitoring.

9. **Make image storage durable and safe.** Provide our own upload/pinning integration or a documented supported Argus upload integration. Do not depend on an undocumented website endpoint as a production contract. Validate decoded type, size and pixel count, re-encode where appropriate, restrict remote fetching, and escape metadata. Uploaded assets need retention and abuse controls.

10. **Add creator management deliberately.** Show a user's created tokens and claimable rewards by their own splitter. Distinguish pool fees awaiting collection, fees awaiting distribution, accrued creator credit, and claimed funds. Preserve the existing rule: never run `distribute()` from the Odysseus creator wallet. Avoid automatically running it from any customer's creator wallet.

## Frontend and channel work

Planning assumption pending interface preference: website first, backed by a service reusable by Telegram and X.

- Website: create form, image preview, fee allocation controls, final immutable-settings confirmation, processing state, verified success, created-token history, links to Argus Pad and Arc Explorer.
- Telegram: explicit button/command workflow using that same service, with the current selected wallet captured and rechecked at confirmation. Switching or unlinking accounts invalidates stale confirmations.
- X: do not revive the legacy guided reply workflow. A future launch command should open an authenticated review flow or use an explicitly designed confirmation mechanism. Existing launch suppression should remain until this channel is actually released.
- Update navigation, guide, help, examples, supported-feature lists and transaction presentation together with release. Draft/upload is not deployment; show success only after receipt verification. Recovery continues server-side if the browser closes.

## Verification before release

- Dry-run zero and nonzero dev buys, oversize partial fills, and accurate refunds.
- Test creator-only and dividend configurations, repeated launches with changed allocations, fixed-tax override rejection, allocation language and remainder handling, invalid allocations, and exact amount conversions.
- Test duplicate confirm requests, lost HTTP/CDP responses, worker interruption at every signing boundary, expired preparation, and pointer/configuration changes.
- Test external nonce consumption and external balance/allowance changes following key export.
- Test ownership substitution, stale X/TG sessions, wallet switching, metadata/script injection, and unsafe image URLs.
- Confirm indexing finds the created pool immediately and supported buy/sell paths recognize its hook. Respect the hook's opening tax window for subsequent trades.
- Monitor recovery failure counts and age; distinguish upload failure, invalid settings, insufficient funds, signing uncertainty, reverted deployment, and confirmed launch.
- After simulations and automated tests, a separately authorized minimal funded launch is still needed to prove the complete customer flow. Reading other users' successful transactions does not validate our not-yet-built service.

## RPC observation

Argus Pad's RPC proxy served contract reads and recent launch logs/transactions during this review. The configured Infura project served basic chain data but rejected tested `eth_call` requests for exceeded quota. Arc Scan requests failed in this session. This is a current endpoint observation, not proof those services are universally unavailable. Resolve quota/provider health and verify submission/recovery coverage before customer launch release.

## Suggested implementation order

1. Shared types, current Portal adapter, validators, image storage, and read-only preview.
2. Convex launch records, owner binding, signing/recovery state machine, and receipts/indexing.
3. Website confirmation and status/history; meaningful failure and recovery tests.
4. Authorized small live validation; then channel-specific Telegram/X presentation and separately reviewed newer-Portal support.

Open product choices: interface release order, optional Argos Bot launch service fee (none assumed), and which reward allocation controls to expose initially. These should not change the transaction safety model.
