# Project and OTC review — 14 September 2026

Activity window: **11:18–17:18 UTC (08:18–14:18 ADT)**, with current-state checks through 17:26 UTC. Code reviewed: **fa48cf83310be75e820d0ae1228bdbf8867ac984**. Vercel production is READY on the same commit. The configured Convex deployment is the one used for these reads; its market totals and listing IDs agree with the live website. CLI deployment selection is controlled by CONVEX_DEPLOY_KEY, which overrides --prod.

No application changes, deployments, signatures, exports, or transactions were performed. This report and ignored read-only diagnostic scripts are the only files created.

## Findings

### 1. High — Arc execution still depends on a fragile RPC arrangement

At 17:24 UTC, the configured Arc primary reset all three local probes. Infura returned chain 5042 and a fresh block, but an ordinary eth_call returned “project ID exceeded quota.” ArgusPad returned a successful call in 1.26 seconds. These reproduce the earlier provider failures despite deployment of the fallback improvements. Local connection failures do not prove the identical behavior in every Vercel region.

The retained diagnostics contain 13 worker network failures and 11 web estimate/preview network failures. Some older entries predate the improved distinction between simulation reverts and network failures; these are events, not unique failed trades. In the six-hour transaction records, one Telegram approval took 246.4 seconds and five broadcast attempts; other approvals took 103–158 seconds. No transaction remained nonterminal in the snapshot.

Action: resolve Infura eth_call access/quota and establish another working execution-call provider. Larger slippage does not repair this. Relevant code: lib/arc/transport.ts and lib/arc/rpc-role.ts.

### 2. Medium — A completed on-chain OTC refund can still wait for the next recovery pass

The 35 USDC purchase by Telegram @arweb1 delivered Arc USDC at **14:20:03 UTC**. Its gas refund mined at **14:20:21**, but the transaction record completed at **14:21:17**: **56.0 seconds after mining**. End-to-end completion from deposit-record creation was **99.2 seconds**. Every recipient and amount checked correctly. The receipt timing establishes an application-verification delay; retained records do not isolate the original RPC error or worker interruption.

runStep waits up to eight seconds for a submitted receipt, then returns to durable recovery. Completion still depends on resolving the refund step, except when the explicit dust path applies. Improve prompt follow-up verification for submitted tail steps without weakening payment checks or clearing signed work. Relevant code: lib/otc/escrow-runtime.ts:139 and lib/otc/escrow-runtime.ts:166.

### 3. Medium — Telegram gives transaction-uncertainty wording for a wallet-link rejection

One Telegram update for @Akuny failed with “Link that wallet first.” The wallet-selection guard correctly rejects an unavailable linked wallet, but the outer handler responds: “Action needed: Result unavailable. Check wallet activity before retrying.” This is misleading for a selection action that never starts a transaction. Handle this as a wallet-link instruction and return the appropriate menu. Relevant code: convex/telegramWallets.ts:60 and convex/telegram.ts:641. All durable Telegram wallet requests in the snapshot have delivered final responses.

### 4. Medium — Dollar valuations have no enforced freshness limit

A synthetic read-only reproduction returned a 200 USD valuation from an explorer price timestamped **2000-01-01**. tokenUsdEstimate validates the address and numeric price but accepts any string timestamp and recaches the price. HoldingCard also keeps its last fetched fallback price indefinitely when subsequent refreshes fail. This can present an old USD estimate as the current holding value. No stale live valuation or monetary loss is claimed from this reproduction.

Add a source-age limit and visibly distinguish or omit expired prices, while retaining the verified token balance. Trading still uses separate fresh quotes; this is a display issue. Relevant code: lib/arc/token-value.ts:18 and components/ArcTokenBalances.tsx:20–29.

### 5. Low — Repeated export close requests create misleading failure audit entries

At **15:01:00** and **17:14:56**, export flows were closed. A second close two to three seconds later recorded failed:close:EXPIRED. Those two flows had been requested and closed; neither had exported a key. These events are not failed key delivery or unauthorized exports. Separately, seven exports in the window reached client acknowledgment. Make close idempotent after checking the same browser/ticket binding, or classify the duplicate as already closed. Relevant code: convex/walletExports.ts:246–271.

## Recent OTC purchases

**10 completed purchases; 805.925875 USDC delivered.** All 50 purchase-related transfers and 18 listing funding/return transfers checked successfully: **68 canonical successful receipts**, with matching expected sender, destination and amount. Seller Base payment preceded buyer Arc delivery for every purchase. Fee transfers matched the saved fee recipients and amounts. No recovery top-up transaction appeared among these ten orders.

Times below are from **deposit transaction record creation to order completion**, excluding time spent reviewing a quote and preparation before the deposit record. Range **29.8–99.2 seconds**, median **58.7 seconds**. These are historical measurements across deployments and confirmation-policy changes, not a guarantee for a new order.

| Completed UTC | Buyer | Seller | Arc USDC | Completion |
|---|---|---|---:|---:|
| 16:16:32 | TG @BlazeKeith1 | X @LancheeDev | 10.00 | 66.2s |
| 14:34:31 | TG @degenofmeme | TG @dipsnchip | 111.964845 | 46.0s |
| 14:24:08 | TG @zhiliao6666 | TG @dipsnchip | 10.00 | 43.7s |
| 14:22:50 | TG @zerion007 | TG @dipsnchip | 30.00 | 39.5s |
| 14:21:17 | TG @arweb1 | TG @dipsnchip | 35.00 | 99.2s |
| 14:14:27 | TG @zerion007 | TG @dipsnchip | 10.00 | 58.0s |
| 13:41:59 | TG @degenofmeme | TG @dipsnchip | 100.00 | 29.8s |
| 12:03:30 | X @Vrij3man | X @0xTheOdysseus | 40.013195 | 59.5s |
| 11:59:29 | X @Vrij3man | TG @dipsnchip | 448.947835 | 60.5s |
| 11:40:19 | X @0xTheOdysseus | X @LancheeDev | 10.00 | 63.8s |

## Current accounting and operational state

- No pending accepted purchases, nonterminal transaction records, or active transaction locks in the main snapshot. The live work query remained empty at 17:26 UTC.
- Listing held amounts and pending-fill counts match their reserved orders. No duplicate X/TG wallet addresses or incorrect X wallet chain IDs were found.
- The listing that briefly showed Closing returned **29.9982602000001638 USDC**, is Cancelled, and has a successful [return receipt](https://www.arcexplorer.org/tx/0x011611ef80a6f4957f93cb795f765ae42985d09136330ac14c93fa4566f23670). Its earlier snapshot hold was obsolete by the time the chain was read; that transient mismatch is not an underfunded live escrow.
- Both current open escrows cover their principal and all recorded holds. They offer **10.996597** and **334.960309 USDC**, totaling **345.956906 USDC**.
- Platform sold total **2,945.703947 USDC** matches 57 unique sales-ledger entries; no duplicate order IDs.
- Eight ordinary Base withdrawals completed in **4.6–9.5 seconds** according to durable records. These eight ordinary transfers were not included in the 68-transfer OTC chain audit.
- X credentials authenticate as **@TheArgosBot**, user ID 2097696306135220226. Polling was current. The two blocked publication records are old September 11 cases, one deleted/inaccessible post and one old address restriction; neither is a new six-hour failure.
- Telegram is **@The_ArgosBot**, with the expected argosbot.io webhook and zero pending Telegram updates. In the window: 297 completed updates, 15 ignored, one failed wallet-selection update described above.
- There were 9 new X wallets and 28 new Telegram wallets. No claim that all new wallets executed a trade.
- 14 of 22 Telegram balance replies in the window reported incomplete token refresh; the latest eight did not. This is improved warning behavior, not proof that every possible on-chain holding is indexed.
- Seven of 13 Telegram website sign-in attempts were approved; the other six expired without approval. Records cannot distinguish abandonment from an actual browser/login failure. No active export fence was found.
- Website home, wallet, OTC and guide returned HTTP 200 with the current Argos Bot title. Wallet and OTC responses carry CSP and private/no-store caching.

## Validation and limits

**500 tests passed**: 318 transaction/routing/OTC/price tests plus 182 authentication/export/Telegram tests. Application and Convex TypeScript checks passed. No new full production build was run; production deployment status and commit were checked directly.

The Convex log sample covers **17:19:14–17:23:13 UTC**, not the full six-hour activity window. It contains 322 OTC function entries and no explicit failures. Durable tables cover the activity window but cannot reconstruct every preview failure, client-visible delay, abandoned authentication, or historical provider response. Mobile authentication and end-to-end key export were not repeated. No claim of exhaustive security proof or support for arbitrary custom hooks/taxes is made.

OTC remains backend-controlled and non-atomic across Arc and Base. The configured Base deposit policy is a ten-second canonical-block confirmation window, not Ethereum settlement finality. The reviewed receipts show the intended seller-first order and exact buyer delivery.

## Purchase transaction appendix

Amounts are exact on-chain top-level native transfers. The Base deposit includes purchase payment and settlement gas; the fee is a separate outgoing transfer from escrow.

### 2026-09-14T16:16:32.159Z — TG @BlazeKeith1 bought 10 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.000001226165161751 ETH | [0x5cc83a486cd83bead6272b921e7f4e7078963ca27b4bc4494a1ccf1280a4974b](https://basescan.org/tx/0x5cc83a486cd83bead6272b921e7f4e7078963ca27b4bc4494a1ccf1280a4974b) |
| fee | 0.00023277290978105 ETH | [0x172d922aa5e0c39a2c8a1608f7ea05e0100973cb4c3a7d751f56fa96c2aedb5c](https://basescan.org/tx/0x172d922aa5e0c39a2c8a1608f7ea05e0100973cb4c3a7d751f56fa96c2aedb5c) |
| seller | 0.015518193985403324 ETH | [0xeb8bd87dba08486e63824183ae26d69451f18dba8d0d39f60dd40189052944c4](https://basescan.org/tx/0xeb8bd87dba08486e63824183ae26d69451f18dba8d0d39f60dd40189052944c4) |
| arc | 10 USDC | [0x6ce085a3055d65dd854d714a56746d449a20b431abe011843b23db368498d854](https://www.arcexplorer.org/tx/0x6ce085a3055d65dd854d714a56746d449a20b431abe011843b23db368498d854) |
| deposit | 0.015753189195160774 ETH | [0xf04f1246ddf1815ab9212f8be67283934d0791d2922482c8c5640a8cade7154b](https://basescan.org/tx/0xf04f1246ddf1815ab9212f8be67283934d0791d2922482c8c5640a8cade7154b) |

### 2026-09-14T14:34:31.885Z — TG @degenofmeme bought 111.964845 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.000001210551684033 ETH | [0x83f5c0897d3c1a022b389ecb98fe29a1d3487055ef21ffedc6ac7aba6f7ff268](https://basescan.org/tx/0x83f5c0897d3c1a022b389ecb98fe29a1d3487055ef21ffedc6ac7aba6f7ff268) |
| fee | 0.001171157052559224 ETH | [0xeb4fc487468897961f6faf293e36686356dc2c5b28a3581646d8bb0a1d7cfcc2](https://basescan.org/tx/0xeb4fc487468897961f6faf293e36686356dc2c5b28a3581646d8bb0a1d7cfcc2) |
| seller | 0.078077136837281585 ETH | [0x720e477d4f5dc5dd3e5a221996e5cad8b8f305497ffeb4a64c4d532e3e29d989](https://basescan.org/tx/0x720e477d4f5dc5dd3e5a221996e5cad8b8f305497ffeb4a64c4d532e3e29d989) |
| arc | 111.964845 USDC | [0x0d97db9d984b14d5f432cbeca9dd970ed3300cbfc1c2d9f2d94858066cbff7df](https://www.arcexplorer.org/tx/0x0d97db9d984b14d5f432cbeca9dd970ed3300cbfc1c2d9f2d94858066cbff7df) |
| deposit | 0.079250500839162473 ETH | [0x96e99e30efd359bfa97fb90733e0f0e5c09fedb2e79e94490513172668e607a6](https://basescan.org/tx/0x96e99e30efd359bfa97fb90733e0f0e5c09fedb2e79e94490513172668e607a6) |

### 2026-09-14T14:24:08.953Z — TG @zhiliao6666 bought 10 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.000001220969839443 ETH | [0xbf6d9e25c4c4d8bcbcfb2cacf139789caec7b96964c6ac33b9b555b465982c11](https://basescan.org/tx/0xbf6d9e25c4c4d8bcbcfb2cacf139789caec7b96964c6ac33b9b555b465982c11) |
| fee | 0.000104817408075134 ETH | [0x6348f931cae1f63780dd644d7a4cac60d2027e2f93b401b34131b7a834e6ed72](https://basescan.org/tx/0x6348f931cae1f63780dd644d7a4cac60d2027e2f93b401b34131b7a834e6ed72) |
| arc | 10 USDC | [0xfe030d87636a12159a155ea911650554bd0323a0a2438943383690e26c99620c](https://www.arcexplorer.org/tx/0xfe030d87636a12159a155ea911650554bd0323a0a2438943383690e26c99620c) |
| seller | 0.006987827205008875 ETH | [0xceca8daee255168b95a89f1616a999706358cb5f5a83bf1221d20375769c95e5](https://basescan.org/tx/0xceca8daee255168b95a89f1616a999706358cb5f5a83bf1221d20375769c95e5) |
| deposit | 0.007094869307559657 ETH | [0xda7739de2593ff767a59cd7ee6c2431311d302d3a4e71fee298b8b309a959d44](https://basescan.org/tx/0xda7739de2593ff767a59cd7ee6c2431311d302d3a4e71fee298b8b309a959d44) |

### 2026-09-14T14:22:50.704Z — TG @zerion007 bought 30 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.00000122596877525 ETH | [0xe64d5feacb23bece13e39e4fa62bbc5c63e5db3d83814799e64577aa02df737a](https://basescan.org/tx/0xe64d5feacb23bece13e39e4fa62bbc5c63e5db3d83814799e64577aa02df737a) |
| fee | 0.000314064715277903 ETH | [0xc64d80d745b9c11f7aa687cd235f0d507eebe29cb7be06e524c67bd44035a0b6](https://basescan.org/tx/0xc64d80d745b9c11f7aa687cd235f0d507eebe29cb7be06e524c67bd44035a0b6) |
| seller | 0.020937647685193494 ETH | [0xe640c689907fdd11aaab6dcb85ee72e4fdc0ef4aa3470c8f2845bffbf13def1a](https://basescan.org/tx/0xe640c689907fdd11aaab6dcb85ee72e4fdc0ef4aa3470c8f2845bffbf13def1a) |
| arc | 30 USDC | [0xe030fb935246c65c17b4ba1a2b2674128cf8f561b311a319be5047378ef6b393](https://www.arcexplorer.org/tx/0xe030fb935246c65c17b4ba1a2b2674128cf8f561b311a319be5047378ef6b393) |
| deposit | 0.021253939773765341 ETH | [0x1c26deaf2ceedee2f2d42917e12267b469a3d81a47d9de2594b97e26ffac5500](https://basescan.org/tx/0x1c26deaf2ceedee2f2d42917e12267b469a3d81a47d9de2594b97e26ffac5500) |

### 2026-09-14T14:21:17.335Z — TG @arweb1 bought 35 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.000001223650479776 ETH | [0xdabcc77030d3e53b3f21de2973084b28e01b5122316cc3dfeefd2eaf4efc8ba8](https://basescan.org/tx/0xdabcc77030d3e53b3f21de2973084b28e01b5122316cc3dfeefd2eaf4efc8ba8) |
| fee | 0.000365567609615573 ETH | [0x0bc04c011d5f9276c605fdf97daf2633c94ab2e61444fa43702ac409ce853b36](https://basescan.org/tx/0x0bc04c011d5f9276c605fdf97daf2633c94ab2e61444fa43702ac409ce853b36) |
| arc | 35 USDC | [0xd9e5443a0a8b9ca211fc3099d1867f4d4c6b2f2f23a8dc1f1acda1dd06f9444c](https://www.arcexplorer.org/tx/0xd9e5443a0a8b9ca211fc3099d1867f4d4c6b2f2f23a8dc1f1acda1dd06f9444c) |
| seller | 0.024371173974371473 ETH | [0x5c4ed4d829051df63ca45780b7552720ad972bc63771c6c2d58dfae04d213da3](https://basescan.org/tx/0x5c4ed4d829051df63ca45780b7552720ad972bc63771c6c2d58dfae04d213da3) |
| deposit | 0.02473896834453159 ETH | [0x12e7be5f8b6283a8cac71b54c07d988c6055cd887ecdc1c3ed98686fcd5f3f0d](https://basescan.org/tx/0x12e7be5f8b6283a8cac71b54c07d988c6055cd887ecdc1c3ed98686fcd5f3f0d) |

### 2026-09-14T14:14:27.746Z — TG @zerion007 bought 10 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.000001217412183103 ETH | [0x26d7ea02d247f8e1ff22341752b9e78f57ff0ee9561991cc171b1a7580a66b59](https://basescan.org/tx/0x26d7ea02d247f8e1ff22341752b9e78f57ff0ee9561991cc171b1a7580a66b59) |
| fee | 0.000104606470458137 ETH | [0xc67f8153146a1373226d39197d01b4fcf7c5108378fc9c800bdb070a3b0a1fae](https://basescan.org/tx/0xc67f8153146a1373226d39197d01b4fcf7c5108378fc9c800bdb070a3b0a1fae) |
| seller | 0.0069737646972091 ETH | [0x15a77e628017e7e41aec7bae753e43dbec6a77bf57805d5c64248f8c66b7eacc](https://basescan.org/tx/0x15a77e628017e7e41aec7bae753e43dbec6a77bf57805d5c64248f8c66b7eacc) |
| arc | 10 USDC | [0xc8c181b513392ff80b2b79fe6a46cfd22da398e6e8739808ae6330ed2a9c699d](https://www.arcexplorer.org/tx/0xc8c181b513392ff80b2b79fe6a46cfd22da398e6e8739808ae6330ed2a9c699d) |
| deposit | 0.007080577947625317 ETH | [0xb0917bb6aac09218962d5fc02888d17aeef943beb0aa800894a72834173e8551](https://basescan.org/tx/0xb0917bb6aac09218962d5fc02888d17aeef943beb0aa800894a72834173e8551) |

### 2026-09-14T13:41:59.458Z — TG @degenofmeme bought 100 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.000001209027033368 ETH | [0xf32e2faf1bfced0ef75606661165896172b8c9271541c283c11a17e0a82de30e](https://basescan.org/tx/0xf32e2faf1bfced0ef75606661165896172b8c9271541c283c11a17e0a82de30e) |
| arc | 100 USDC | [0xf9965dfe53cbf42031a9f463981bbca395d036836a440397f7a0c6b6c3fa6207](https://www.arcexplorer.org/tx/0xf9965dfe53cbf42031a9f463981bbca395d036836a440397f7a0c6b6c3fa6207) |
| fee | 0.00104872265580523 ETH | [0x459e712e6fcee0ab907d25781d4cf5e2bc941dbf86304d8b1c8af187a31cca05](https://basescan.org/tx/0x459e712e6fcee0ab907d25781d4cf5e2bc941dbf86304d8b1c8af187a31cca05) |
| seller | 0.069914843720348616 ETH | [0x9a52309c7787a9d75202ae8dd463f54edce0ac8a9ce9f652cf9f6ca247983e85](https://basescan.org/tx/0x9a52309c7787a9d75202ae8dd463f54edce0ac8a9ce9f652cf9f6ca247983e85) |
| deposit | 0.070965779957079694 ETH | [0x79f7296fe22f235126c38389eb1babec5f6075bc68eab54b87b0e94dbe6d2dbc](https://basescan.org/tx/0x79f7296fe22f235126c38389eb1babec5f6075bc68eab54b87b0e94dbe6d2dbc) |

### 2026-09-14T12:03:30.768Z — X @Vrij3man bought 40.013195 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.000001183667604426 ETH | [0x7e8c418ffc01aaa3af9f248a229725ae941d7530dbe52ebb88cdf16d6d3943ff](https://basescan.org/tx/0x7e8c418ffc01aaa3af9f248a229725ae941d7530dbe52ebb88cdf16d6d3943ff) |
| fee | 0.000418824276919029 ETH | [0xaba9d9b438eb058cbbeb03670fe91a1726933215e9828899415a4dafc0ce989e](https://basescan.org/tx/0xaba9d9b438eb058cbbeb03670fe91a1726933215e9828899415a4dafc0ce989e) |
| seller | 0.02792161846126854 ETH | [0xd2cb87f3c4a3cf882a448cf5d630a0399ff60dacf422f8d78a5e419771e7f545](https://basescan.org/tx/0xd2cb87f3c4a3cf882a448cf5d630a0399ff60dacf422f8d78a5e419771e7f545) |
| arc | 40.013195 USDC | [0xa83dd30c6e2a19d95d0b0cb2f8b131d0fcbef6a7822f97b81e14475bcfb32367](https://www.arcexplorer.org/tx/0xa83dd30c6e2a19d95d0b0cb2f8b131d0fcbef6a7822f97b81e14475bcfb32367) |
| deposit | 0.028342599392396841 ETH | [0x163547da0f8dc59b9e4870907466762bcfce7eb8d521153bb637c61c1f506802](https://basescan.org/tx/0x163547da0f8dc59b9e4870907466762bcfce7eb8d521153bb637c61c1f506802) |

### 2026-09-14T11:59:29.951Z — X @Vrij3man bought 448.947835 USDC

| Step | Amount | Transaction |
|---|---:|---|
| fee | 0.004566609276086688 ETH | [0xa5cee44a179c1476d8fe7a487b48cd2772c92614c6797f7fa0d7fb3968c83b08](https://basescan.org/tx/0xa5cee44a179c1476d8fe7a487b48cd2772c92614c6797f7fa0d7fb3968c83b08) |
| return_gas | 0.000001178077260602 ETH | [0x46585945495aa67108b66f5c7f2d6312a47581800df7bd64ea0fe40717c3e96d](https://basescan.org/tx/0x46585945495aa67108b66f5c7f2d6312a47581800df7bd64ea0fe40717c3e96d) |
| arc | 448.947835 USDC | [0x9e7f59c694cc1752ea1257731f76042857dab1f7d170f8bcb35d68321c6e4cee](https://www.arcexplorer.org/tx/0x9e7f59c694cc1752ea1257731f76042857dab1f7d170f8bcb35d68321c6e4cee) |
| seller | 0.304440618405779181 ETH | [0x36d8ec8d2ab20a9d4a069486702d7dea9286c0147302f88f385651a861d30c5a](https://basescan.org/tx/0x36d8ec8d2ab20a9d4a069486702d7dea9286c0147302f88f385651a861d30c5a) |
| deposit | 0.309009378788206773 ETH | [0xf77de84971fa9405ac3494f2e900190b0a459f09a19dd4276e8aa7c677419777](https://basescan.org/tx/0xf77de84971fa9405ac3494f2e900190b0a459f09a19dd4276e8aa7c677419777) |

### 2026-09-14T11:40:19.686Z — X @0xTheOdysseus bought 10 USDC

| Step | Amount | Transaction |
|---|---:|---|
| return_gas | 0.00000117809807646 ETH | [0x89ba783e34020a01a3bf4729fa76ad2e3bcd756259f5baff26b463b75a6c83ca](https://basescan.org/tx/0x89ba783e34020a01a3bf4729fa76ad2e3bcd756259f5baff26b463b75a6c83ca) |
| fee | 0.000232220782864614 ETH | [0x61d5a122b337c97f629f8372bc098da795dd15e4f353d9620d62fe733adff944](https://basescan.org/tx/0x61d5a122b337c97f629f8372bc098da795dd15e4f353d9620d62fe733adff944) |
| arc | 10 USDC | [0x5f904fd4bf08292dd3cb562629040d8b0da5c1ce037b58ddb1f75736040ba66f](https://www.arcexplorer.org/tx/0x5f904fd4bf08292dd3cb562629040d8b0da5c1ce037b58ddb1f75736040ba66f) |
| seller | 0.015481385524307567 ETH | [0x8979216bf7530f857aa297c388f6997c5dc2a1836e46a545eeaf132ceacb404c](https://basescan.org/tx/0x8979216bf7530f857aa297c388f6997c5dc2a1836e46a545eeaf132ceacb404c) |
| deposit | 0.015715755061797029 ETH | [0xe8f481222f45c1e250e6a95ed224a1294017e6398d50d5cce30eef5c2ccea2ba](https://basescan.org/tx/0xe8f481222f45c1e250e6a95ed224a1294017e6398d50d5cce30eef5c2ccea2ba) |
