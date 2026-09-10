import type { MutationCtx } from "./_generated/server";
import { ARC_TOKEN_CATALOG, canIndexArcToken } from "../lib/arc/token-catalog";
import excluded from "../lib/arc/excluded-catalog-addresses.json";
import { query } from "./_generated/server";

/** Only public Arc registry metadata; never includes wallet-specific holdings. */
export const searchCatalog = query({ args: {}, handler: async ctx => {
  const rows = await ctx.db.query("tokenRegistry").withIndex("by_chain_active", q => q.eq("chainId", 5042).eq("active", true)).collect();
  return rows.filter(t => canIndexArcToken(t.address, t.symbol)).map(t => ({ address: t.address, symbol: t.symbol, name: t.name, chainId: 5042 }));
} });

export async function seedArcTokenCatalog(ctx: MutationCtx) {
  // Validate the whole input before any writes, including future catalog edits.
  if (ARC_TOKEN_CATALOG.some(token => token.chainId !== 5042 || !canIndexArcToken(token.address, token.symbol))) {
    throw new Error("Invalid Arc token catalog.");
  }
  // Drain existing rejected entries in bounded batches before seeding.
  let deleted = 0;
  for (const address of excluded) {
    for (const row of await ctx.db.query("tokenRegistry").withIndex("by_normalized_address", q => q.eq("normalizedAddress", address)).take(200 - deleted)) {
      await ctx.db.delete(row._id); deleted++;
    }
    if (deleted >= 200) return { complete: false };
    for (const row of await ctx.db.query("walletTokenIndex").withIndex("by_token", q => q.eq("normalizedTokenAddress", address)).take(200 - deleted)) {
      await ctx.db.delete(row._id); deleted++;
    }
    if (deleted >= 200) return { complete: false };
  }
  for (const token of ARC_TOKEN_CATALOG) {
    const record = { address: token.address, normalizedAddress: token.address, symbol: token.symbol,
      name: token.name, decimals: token.decimals, chainId: 5042, active: true,
      pairCandidate: false, pairApproved: false, updatedAt: Date.now() };
    const existing = await ctx.db.query("tokenRegistry").withIndex("by_normalized_address", q => q.eq("normalizedAddress", token.address)).unique();
    if (existing) await ctx.db.patch(existing._id, record);
    else await ctx.db.insert("tokenRegistry", record);
  }
  return { complete: true };
}
