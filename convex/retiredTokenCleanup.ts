import { getAddress } from "viem";
import type { MutationCtx } from "./_generated/server";
import { RETIRED_TOKEN_ADDRESSES } from "../lib/token-index-exclusions";

/** Bounded, repeatable cleanup of discovery data. Never touches funds or transaction history. */
export async function cleanupRetiredTokenIndexes(ctx: MutationCtx, limit = 200) {
  let deleted = 0;
  const legacy = await ctx.db.query("legacyNetworkAssetCatalog").take(100);
  const addresses = new Set([...RETIRED_TOKEN_ADDRESSES, ...legacy.map(row => row.normalizedAddress.toLowerCase())]);
  for (const address of addresses) {
    const queries = [
      () => ctx.db.query("tokenRegistry").withIndex("by_normalized_address", q => q.eq("normalizedAddress", address)).take(limit - deleted),
      () => ctx.db.query("walletTokenIndex").withIndex("by_token", q => q.eq("normalizedTokenAddress", address)).take(limit - deleted),
      () => ctx.db.query("tokenMarketState").withIndex("by_normalized_token", q => q.eq("normalizedTokenAddress", address)).take(limit - deleted),
      ...[...new Set([address, getAddress(address), ...legacy.filter(row => row.normalizedAddress.toLowerCase() === address).map(row => row.address)])].map(cased =>
        () => ctx.db.query("walletHoldingSnapshots").withIndex("by_token_address", q => q.eq("tokenAddress", cased)).take(limit - deleted)),
    ];
    for (const query of queries) {
      if (deleted >= limit) return { deleted, complete: false };
      for (const row of await query()) { await ctx.db.delete(row._id); deleted++; }
    }
    // Keep the source row until its dependent indexes are drained, so a later
    // batch can still identify dynamically imported legacy assets.
    for (const row of legacy.filter(row => row.normalizedAddress.toLowerCase() === address)) {
      if (deleted >= limit) return { deleted, complete: false };
      await ctx.db.delete(row._id); deleted++;
    }
  }
  if (legacy.length === 100) return { deleted, complete: false };
  for (const row of await ctx.db.query("legacyNetworkAssetCatalogState").take(limit - deleted)) {
    await ctx.db.delete(row._id); deleted++;
  }
  return { deleted, complete: deleted < limit };
}
