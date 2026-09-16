# Fixes, second real test and final launch review

## Repairs

- Pausing launch admission no longer removes access to accepted-run reconciliation. Signed work is recovered; provably unsigned work is cancelled; no new setup/deployment signature starts while paused.
- A 30-second, bounded oldest-first Convex sweep recovers orphaned runs. A five-minute fenced worker lease prevents overlapping recovery chains. A stale worker cannot release its replacement's lease.
- Pre-acceptance rejection is explicitly labelled by Convex. Web clears uncertain state for that outcome only; transport failures keep tracking the original request. X also surfaces a definite rejection immediately.
- Web and X share the image-source allowlist, including the constrained Google thumbnail used for TEST. Concurrent image downloads are coalesced; later signing verification reads fresh bytes.
- Preparation shares duplicate contract calls pinned to the same block within that preparation. Latest head, canonical block rechecks, balances, nonce, fees and simulations remain fresh. The cache does not persist across requests or signatures.
- Registry consumers paginate beyond 500 verified launches, including creator discovery. Repeated cursors fail instead of looping.
- How to Launch is gated in production while preparation is disabled. Public launch execution remains disabled. Coordinated release instructions are in `release-checklist.md`.

## Second launch

- Name/ticker: test / TEST; same supplied Google thumbnail.
- Creator: Personal2, `0x2ce720a19394C3Ab5387Dd5d8c72a6f3E77b3565`.
- Token: `0xd2D5CaE3d1d852879f60B0810C73ba3Ec5d250cF`.
- Transaction: `0x0ebef7fc277836686dd0559d125657a1a4a88ebb55aff241b25aeb41dd6904e8`.
- Portal 7; USDC pair; 1% buy/sell taxes; 100% creator allocation; zero creator buy.
- Confirmed block: 21079260. Gas paid: 0.059045740002952287 USDC.
- Completed and verified on the first execution. The journal is completed/released.
- Independent post-test verification passed. Personal2: 2.177917666619095426 USDC; not busy; zero reservations. Token excluded from catalog and absent from deployed bot launch directory.

## Final review and validation

- 413 distinct tests passed across 33 selected launch, X, web/API, creator-fee and directory suites. Three legacy tests initially expected the old Grok-specific rejection while execution is disabled; they now verify the current earlier disabled boundary, still asserting no wallet action or publication.
- Convex TypeScript and production build passed. Existing unrelated unused-variable warnings remain. The build with the system certificate store did not reproduce the earlier certificate fetch warnings.
- Reviewed pause and signature recovery ordering, worker lease fencing, replay identity, allocation binding, gas accounting, creator/payout verification, web rejection semantics, image handling and catalog provenance.
- No further blocking defect was identified in the repaired paths under these checks.
- Remaining validation limits: the second launch was another operator test. It does not prove an actual customer web/X launch/reply, funded creator-buy setup recovery, dividend distributions or a paired ARGUS/ARCASH launch. Concurrent-user latency has not been benchmarked; the changes reduce duplicate reads, not guarantee a latency target. Recorded contract fingerprints are consistency checks, not an independent contract-source audit.

Rollout verified: Convex deployment completed, and Vercel production `dpl_BLAVYgybkjYwCgb7kEU2RxDRsXL3` is READY with `www.argosbot.io` assigned. The paginated registry query responded successfully during the independent test review. Live checks returned 404 for `/wallet/launch`, `/api/wallet/launches`, `/tokens` and `/how-to-launch`. Public admission remains disabled. No live social post was made.
