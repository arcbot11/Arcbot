# Retired network token catalog cleanup

The inherited catalog's 56 assets and two old project-token seeds have been removed. Native-ETH route presets, company-name aliases, and default wallet balance probes are removed. Old addresses remain only as exclusion tombstones, so existing records cannot repopulate the active catalog. This does not ban Arc tokens that reuse the same ticker.

The legacy catalog import and lookup are disabled. Registry initialization runs bounded cleanup batches. `registry:cleanupRetiredIndexes` also exposes the same internal mutation for explicit cleanup; repeat until it returns `complete: true`.

Cleanup deletes matching token registry entries, wallet token indexes, holding snapshots and market-state cache entries, then drains the retired network asset catalog and its sync state. It preserves wallets, transaction history, orders, reservations and fee-program records. It does not send transactions.

**Not applied to a remote database.** The local environment still points to the previous project's Convex deployment. Configure and verify a separate Arc Bot backend before deploying or running this cleanup. Do not run it against the original project's database.

The legacy pair/route catalog remains empty. The separate Arc token catalog now contains 95 tickers selected from the September 9 top-100 and Argus snapshot: canonical USDC only, then the highest-cap address per case-insensitive ticker. It is seeded as token metadata on chain 5042, with pair candidacy and approval disabled. This metadata catalog is not an executable route allowlist.
