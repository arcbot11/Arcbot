import type { MutationCtx } from "./_generated/server";
import { ARC_TOKEN_CATALOG, canIndexArcToken, compareArcTokenPriority } from "../lib/arc/token-catalog";
import excluded from "../lib/arc/excluded-catalog-addresses.json";
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** Operator-only bounded refresh; callers resume the returned offset until complete. */
export const refreshBatch = internalMutation({
  args: { offset: v.number() },
  handler: async (ctx, { offset }) => refreshCatalogBatch(ctx, offset),
});

export async function refreshCatalogBatch(ctx: MutationCtx, offset: number) {
  const total = excluded.length + ARC_TOKEN_CATALOG.length;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total) throw new Error("Invalid catalog offset.");
  if (ARC_TOKEN_CATALOG.some(t => t.chainId !== 5042 || !canIndexArcToken(t.address, t.symbol))) throw new Error("Invalid Arc token catalog.");
  const end = Math.min(offset + 25, total);
  let deleted = 0;
  for (let i = offset; i < end; i++) {
    if (i < excluded.length) {
      const address = excluded[i];
      for (const table of ["tokenRegistry", "walletTokenIndex"] as const) {
        const rows = table === "tokenRegistry"
          ? await ctx.db.query(table).withIndex("by_normalized_address", q => q.eq("normalizedAddress", address)).take(100 - deleted)
          : await ctx.db.query(table).withIndex("by_token", q => q.eq("normalizedTokenAddress", address)).take(100 - deleted);
        for (const row of rows) { await ctx.db.delete(row._id); deleted++; }
        if (deleted >= 100) return { complete: false, nextOffset: i };
      }
      continue;
    }
    const token = ARC_TOKEN_CATALOG[i - excluded.length];
    const record = { address: token.address, normalizedAddress: token.address, symbol: token.symbol,
      name: token.name, decimals: token.decimals, chainId: 5042, active: true,
      pairCandidate: false, pairApproved: false, updatedAt: Date.now() };
    const existing = await ctx.db.query("tokenRegistry").withIndex("by_normalized_address", q => q.eq("normalizedAddress", token.address)).unique();
    if (existing) await ctx.db.patch(existing._id, record);
    else await ctx.db.insert("tokenRegistry", record);
  }
  return { complete: end === total, nextOffset: end };
}

/** Only public Arc registry metadata; never includes wallet-specific holdings. */
export const searchCatalog = query({ args: {}, handler: async ctx => {
  const rows = await ctx.db.query("tokenRegistry").withIndex("by_chain_active", q => q.eq("chainId", 5042).eq("active", true)).collect();
  return rows.filter(t => canIndexArcToken(t.address, t.symbol)).map(t => ({ address: t.address, symbol: t.symbol, name: t.name, chainId: 5042 })).sort(compareArcTokenPriority);
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
