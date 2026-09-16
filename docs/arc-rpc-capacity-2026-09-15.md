# RPC routing and verification — 2026-09-15

## Provider checks

Read-only checks used real wallet balances and the confirmed second ARGUS sale receipt. No new transaction was signed or broadcast in this review.

| Provider | Result | Assignment |
| --- | --- | --- |
| Arc QuickNode | Chain 5042, checkpoint, head, balance, contract calls, gas, nonce, receipts, debug_traceCall and trace_call passed. Warm raw calls approximately 41–54 ms. | Primary Arc provider for quotes, preparation, broadcast and verification. |
| rpc.mainnet.arc.io | Chain/head, balances, calls, gas, nonce, receipt passed. Approximately 75–96 ms warm. Old checkpoint returned rate limit; newer independently verified checkpoint passed. debug_traceCall unsupported, trace_call unavailable in probe. | Paced backup; not a substitute for every tracing path. Both earlier authorized sales used normal durable operator verification; the second sale used this provider. |
| Configured Infura | HTTP 401 and project quota errors. | Removed from automatic routing. |
| rpc.arc-scan.org | Connection failed. | Not included. |
| arguspad.io/api/rpc and argus.world/api/rpc | HTTP 404. | Removed from automatic routing. |
| Base Alchemy | Identity, checkpoint, balance, contract call, gas and nonce passed. | Existing primary unchanged. |
| Base Tenderly | Same Base checks passed. | Existing fallback unchanged. |

These are point-in-time checks, not uptime guarantees. Raw eth_sendRawTransaction was not probed with a new spend.

## Arrangement

ARC_MAINNET_RPC_URL remains the primary. ARC_RPC_FALLBACK_URLS optionally overrides the comma-separated fallback list; when omitted it defaults to https://rpc.mainnet.arc.io. An explicitly empty list disables fallback. ARC_INFURA_RPC_URL no longer implicitly enables a broken provider.

The exact legacy project checkpoint 18456078 / 0xdd5a48032af8571d6a262f39e5cde7e6b91625aaa4330289f03e5a346dd3c358 advances to block 21065497 / 0xdba68d53cfd9677309247a79359fe7d01599447d69f84f69a958bc179a6cdf07. QuickNode and the public provider independently returned that hash. Other explicitly configured checkpoints are preserved. No untrusted latest block becomes a trust anchor automatically.

Chain/checkpoint identity is cached for five minutes after successful validation; fresh head validation remains bounded to five seconds. Prices, balances and transaction reads are not cached by this change. Reads remain pinned to their requested block. A failed read can move to another verified provider. Broadcast is attempted on one provider only; durable recovery retains the same signed bytes.

## Capacity

QuickNode's shared Convex bucket schedules 20 requests/second with a bounded one-second late window. Eight exclusive slots are allocated per admission call; concurrent processes share the same database bucket, including the older single-slot clients. Unused/late permissions expire. Conservative round-trip bounds handle clock skew. Lost coordinator responses can be retried without sending any RPC or reusing their unreceived slots. Local requests are sequenced too.

The public fallback is locally spaced at 300 ms. This is not a cross-instance public-provider quota guarantee. Rate limits can still occur, particularly under larger multi-instance load. Provider rate limits and admission-service failures have distinct log categories.

Transient rate-limit errors do not trigger trace fallback or minute-long method blackouts. Monthly/project quotas retain their longer cooldown. Tracing and actual execution reverts remain distinct.

## Validation and deployment

62 focused regression tests passed across configuration, capacity, pacing, transport and trading flow. Website and Convex TypeScript checks and changed production-file lint passed. The final admission retry also passed its dedicated tests.

Live read-only tests: buy and sell estimates and approval preparation passed; three simultaneous buy estimates passed in 11.4 seconds (65 RPC requests, 11 admission calls, no HTTP 429). After fixing first-admission connection recovery, cold/warm estimates took 5.953 / 1.375 seconds. Public-only validated balance and receipt check passed in 1.617 seconds. These do not measure a full signed purchase or guarantee throughput at 50 RPS.

Convex deployed to the existing aware-okapi-12 backend. The initial review left Vercel deployment pending; the follow-up below records its completed deployment. No new secrets are required. Launch execution remains disabled.

## Follow-up review and production deployment

Found and fixed a separate balance-only configuration that still selected Arc Scan, Infura, and the removed Argus gateway. Public website balances and social token holdings now share arcConfigFromEnv with trading. Display-only operation retains a verified public default without enabling transaction execution when operator settings are absent.

Deployed five RPC modules over the verified production baseline 3ef5fb73c06b3425594c67e91e133c444e6f5bdd. Final Vercel deployment dpl_EWeb7AYHZFkjDB5Zg2imZixJVthW is READY and aliased to www.argosbot.io. The build, lint and typecheck passed (existing unused-variable warnings remain). Convex also received the balance configuration fix. No unrelated operator edits were uploaded.

Post-deployment: public OTC endpoint HTTP 200 in 300 ms; fresh public arguswallet balance endpoint HTTP 200 in 4.458 seconds. It returned the on-chain USDC balance and ARGUS/BABYBAT holdings; partial=true means token discovery is not guaranteed complete. Local live ARGOS and paired BABYARGUS estimates passed in 7.003 and 6.669 seconds. No transactions were signed in these checks.

Full-suite audit (not a clean run): 3,784 passed, 398 failed, 20 skipped; 51 failing files out of 326. This includes scratch tests under tmp, retired feature expectations, and stale presentation/pricing mocks. Not every failure has been triaged; do not characterize the whole project as passing. Focused RPC/transport/pacing/configuration/balance regression run passed all 45 tests after the display fix.
