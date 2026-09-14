# ARGUS-paired trading investigation

Research only. No approvals, signatures, trades, deployment or runtime policy changes. The preceding wallet-card presentation edit is unrelated and remains intact.

## Live findings

On 2026-09-13 at Arc block **20,695,715**, Portal #6 (`0xa5628a11c412596e1f63b75a2c0284f843c549d6`) contained 194 launches, including **10 non-USDC launches**. Every non-USDC launch used ARGUS `0xece5ca8bf9220718e5727754026757512212cb3c`, with 18 decimals. `quoteApproved(ARGUS)` returned true. Initial intermittent upstream errors were retried at the same block; the completed inventory has no unresolved records. This inventory covers that Portal at that block, not arbitrary tokens created elsewhere or later.

| Token | Contract | Buy / sell hook tax |
|---|---|---|
| BABYARGUS | `0xe4894ec09505ab0fcf357005df4866f1d90ae489` | 1% / 1% |
| GIANT | `0xdac59a34aa347cacaf46332ae9ae9615c3243faa` | 2% / 2% |
| PAD | `0x70771d373c38ff5433801f63192e844dc847a65d` | 2% / 2% |
| PAD | `0xe6602d40e86f3dd9c32d3865b2f9dc71875cef91` | 1% / 1% |
| SUGRA | `0xfd0ff824d6ccf819b4d0e9459b36e42f2aa9a4c8` | 1% / 1% |
| PANOPTES | `0xf05583c1718034a7271187fb3ec67c1f66f2b339` | 1% / 10% |
| CHESTER | `0xf2c4695c947e404f4ccc6fceb888b7826d7e17f6` | 1% / 1% |
| WHAT | `0xc02c7e3bcac17603dbd65c58d561cdd99a5e1538` | 1% / 1% |
| ARGUSCAT | `0x57d4ed2dcdb2d34814330d280a4d7179b179b9c4` | 1% / 1% |
| FEG | `0xc225b533ea80e9d31d2011e6ec5e3007fd84de05` | 1% / 1% |

The [documentation](https://arguspad.io/docs) now explicitly describes ARGUS approval and per-launch quotes. The [version-3 ABI bundle](https://arguspad.io/argus-v4.json) still has a USDC-only `quote.approved` snapshot and a note claiming all #6 launches use USDC. These are stale snapshots, not safe live constraints. Use the launch's recorded quote and on-chain approvals/events.

Portal #7 (`0xB021Be536808f551b31789422Fd28a6c9c6e97Da`) also exists but returned **zero tokens** in a separate live read during this investigation. It is not included in our trading `ARGUS_PORTALS` list. Its 11-word records do not distinguish it from #6: use known Portal identity and its `registry()` discriminator. Pair currency and creator/dividend payout currency can differ on #7. A future adapter must keep those concepts separate; converting rewards does not mean a user's sell should output USDC.

## What was tested

The existing `discoverArgusPool` successfully verified Baby Argus's saved hook, splitter, locker, quote, sorted currencies and pool ID. Pool: `0x814b3c9f4dcdba75ff7eb014c45ca9f27a448113e14af3b326bd2c6be099d8c7`.

Fresh read-only quotes through the existing quote engine succeeded:

| Path | Block | Indicative output |
|---|---|---|
| 1 ARGUS → BABYARGUS | 20,696,022 | 145.133237691657617528 BABYARGUS |
| 1,000 BABYARGUS → ARGUS | 20,696,029 | 6.618709851045948164 ARGUS |
| 10 USDC → ARGUS → BABYARGUS | 20,696,035 | 729,697.585948842178146838 BABYARGUS |

These are quoter outputs, not guaranteed executable amounts or current prices. They do not prove approval, actual transfer-tax settlement or a sender-specific router simulation. Mixed quotes chain pool quoters and do not simulate ERC-20 transfers between hops.

The ARGUS/USDC connector is V3, fee 10000, pool `0x6a3bacaa6493734c1ac221ebf42cf530a96c1e02`. The child-token pools are hooked V4.

A recent [successful Baby Argus pool transaction](https://www.arcexplorer.org/tx/0x9fd53f0e30a9bee96fd2aea279b6a13167de9b0454c4500b1721f3188526353e), block 20,687,587, called a different router (`0x919c548ea8a779e0e551ef35f6aba65565b140a7`). Receipt logs show ARGUS leaving the V4 manager and then moving to the ARGUS V3 pool. This proves live pool activity; it does not validate our Universal Router encoding or establish which RPC the sender used. Baby Argus had one pool swap in the sampled last 10,000 blocks; FEG had none in that window. A deployed pool is not automatically active or sufficiently liquid for every requested amount.

41 existing discovery/routing/trading tests passed; one discovery test was skipped. These tests do not constitute a funded end-to-end execution test.

## Current infrastructure and gaps

| Layer | Existing support | Required change |
|---|---|---|
| Identity/discovery | #6 per-token quote, hook/pool validation; bounded recursive quote discovery | Return a reusable verified market descriptor to every entry point; cache identity, reprice state; separate #7 adapter |
| Route engine | Up to three pools, V3/V4 mixing, explicit ERC-20 input/output, final-output guard | Validate actual ARGUS transfer behavior on direct V4 and intermediate hops; simulation coverage beyond isolated quoters |
| Website controls | Buy explicitly sets input `native`; sell explicitly sets output `native` | Select verified quote asset, display funding asset and actual sell proceeds; paired-only UI variation |
| X/TG execution | Shared `/api/arc/command`; normal buy accepts USD/USDC; sell returns native USDC | Both platforms call the same market/funding planner; accept explicit quote-token input; preserve ambiguity flow |
| Amount selection | `arcSellAmountForUsdc` values through USDC | Separate dollar valuation from settlement asset; quote-token amount and percent support without relabeling units |
| Quotes/authorization | Wallet-bound signed preview, exact input/output and route hint | Freeze source asset, source amount cap, target, quote asset, taxes and minimum delivery for the chosen request |
| Reservations/recovery | Durable transaction IDs, approval loop, native gas and ERC-20 debit metadata | Reserve the actual funding token plus USDC gas; recover the same plan, never silently switch source assets after signing |
| History/replies | Actual received-token evidence is available | Use actual input/output symbols everywhere; sell confirmation must say ARGUS received, not USDC |
| Catalog/pricing | Contract identity and display USD estimates | Store verified pairing separately from ticker; USD value = token/quote × quote/USD with freshness checks; never use raw quote units as dollars |
| Launch preparation | Background #6 launch path is fixed to USDC | Later add quote asset/decimals, approvals, dev buy, quote-denominated thresholds and reward/payout metadata; keep launch execution disabled until separately ready |

## Proposed behavior

1. Resolve the requested token's verified quote asset. Ordinary USDC markets retain existing behavior. ARGUS markets use ARGUS; future reviewed quote assets follow the same data-driven path. Contract addresses, never tickers, select currencies.
2. For a dollar-denominated paired buy, obtain a fresh conversion and calculate the quote-token spend including applicable input tax. If available ARGUS covers the full authorized buy, use ARGUS → token. Otherwise use USDC → ARGUS → token for the full buy. This whole-buy fallback is a recommended interpretation of “use ARGUS if available”; combining partial ARGUS and USDC balances is a separate explicit policy, not something to do silently.
3. For an explicitly ARGUS-denominated buy, preserve that denomination. Do not silently spend USDC unless that fallback was part of the authorized instruction/confirmation.
4. Prefer one atomic router swap for USDC fallback, with all legs reverting if final delivery is insufficient. Prove that execution with ARGUS taxes first. If its transfer behavior prevents the atomic route, a two-transaction acquisition/purchase flow needs its own durable parent request, input budget, intermediate inventory, nonce coordination and recovery. If only acquisition completes, report that ARGUS was acquired and the child-token buy did not complete; never report a completed child-token purchase or repeat acquisition on retry.
5. Sell paired tokens directly to their recorded quote: BABYARGUS → ARGUS. No automatic ARGUS → USDC leg. Dollar input remains a valuation option; the receive estimate and confirmation show ARGUS and an optional USD equivalent.
6. Native Arc USDC still pays gas, even when every traded asset is ERC-20. Having enough ARGUS alone is insufficient without USDC gas. Hold the maximum permitted funding-token debit and USDC gas separately; a signing-time balance change must not silently choose a different asset.
7. Freeze funding choice for the executable request and recover that choice across approvals, retries and sign-in/session refresh. Before signing, an expired preview can be rebuilt within the user's authorized funding policy; show the actual chosen asset. Never reuse one route hint across different input/output identities.

## Tax and safety work before enabling

ARGUS reports current taxes `(100,100)`. The sampled wallet, our Universal Router, V4 PoolManager, Baby Argus hook and splitter all returned `isExempt = false`. Whether a particular transfer incurs tax must still be checked in context; the observed receipt should not be replaced by a blanket assumption about every hop.

Our `trading.ts` currently calculates the extra input tax only when the first pool is V3. That is insufficient as a general model for ARGUS-funded V4 buys. Verify actual sender debit/recipient credit at each transfer boundary, including router-to-manager payment, output delivery and leftover sweeps. Calculate maximum spends using the actual tax model. Preserve the final balance/delivery guards rather than bypassing a failing simulation. Child hook taxes vary (PANOPTES has a 10% sell tax); do not assume the 1% default chosen for our future launches applies to every existing token.

Future quote admission requires more than Argus approval: support its decimals, transfer semantics, USD reference/USDC connector, liquidity and adapter. Rebuild approved quotes from `QuoteApproved`/`QuoteRevoked` and confirm live getters for launch choices. Revoking a quote for future launches does not change the quote of existing tokens or justify rewriting their pools. Keep immutable pool identity separate from mutable pricing/availability and registry reward conversion policy.

For later paired launches, the ABI's `startFdvUsdc6`, `bondFdvUsdc6` and `devBuyQuote` contain **raw quote-asset units**, despite the names. The current hardcoded six-decimal USDC defaults cannot be copied into an 18-decimal ARGUS launch. Derive intended economics in quote units using a validated quote/USD rate, and review the new #7 `expectConvert`/payout rules separately.

## Implementation order and acceptance checks

1. Shared versioned market descriptor and reviewed quote-asset registry; backfill saved pairing metadata without changing duplicate-ticker or canonical-USDC rules.
2. Direct quote-asset buys/sells, tax-aware maximum input and correct actual-delivery reporting. Prove sender-specific full execution using a fork or supported read-only state override.
3. Atomic USDC fallback execution and precise funding authorization; only add a two-transaction fallback if necessary and with explicit recovery states.
4. Integrate web, X and TG with the same planner. Update buy input, sell proceeds, help, estimates, pending statuses and final confirmations together.
5. Test sufficient/insufficient/partial ARGUS, insufficient USDC gas, zero/changed allowances, price changes during approvals, USD/token/percentage amounts, transfer taxes, drained external balances, failed second hop, finality/reorg handling and duplicate/retried requests. No duplicate spend after a lost signing response. USDC markets must retain current presentation and behavior.
6. Add #7 and future quote adapters with independent fixtures and deployment identity checks; do not blindly trust an 11-word record or newly approved ticker.

Public evidence snapshots: `paired-launches-live-2026-09-13.json`, `paired-launches-quotes-2026-09-13.json`, `paired-launches-activity-2026-09-13.json` in this directory.
