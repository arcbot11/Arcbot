import { describe, expect, it } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import { cleanupRetiredTokenIndexes } from "../convex/retiredTokenCleanup";
import { RETIRED_TOKEN_ADDRESSES, isTokenIndexExcluded } from "../lib/token-index-exclusions";
import { walletBalanceTokens, parseExplorerHoldings, mergeWalletTokenHoldings } from "../lib/wallet-holdings";

type Row = { _id: string; [key: string]: unknown };
function fixture(tables: Record<string, Row[]>) {
  const ctx = { db: {
    query(table: string) {
      let predicates: Array<[string, unknown]> = [];
      const query = {
        withIndex(_name: string, build: (q: unknown) => unknown) {
          const q = { eq(field: string, value: unknown) { predicates.push([field, value]); return q; } };
          build(q); return query;
        },
        async take(count: number) { return (tables[table] || []).filter(row => predicates.every(([key, value]) => row[key] === value)).slice(0, count); },
      };
      return query;
    },
    async delete(id: string) { for (const key of Object.keys(tables)) tables[key] = tables[key].filter(row => row._id !== id); },
  } } as unknown as MutationCtx;
  return ctx;
}
const retired = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
const arc = "0x1111111111111111111111111111111111111111";

describe("retired network catalog cleanup", () => {
  it("removes only retired discovery rows, retaining same-ticker Arc assets and financial history", async () => {
    const tables = {
      tokenRegistry: [{ _id: "old", normalizedAddress: retired, symbol: "NVDA" }, { _id: "arc", normalizedAddress: arc, symbol: "NVDA" }],
      walletTokenIndex: [{ _id: "index", normalizedTokenAddress: retired }],
      walletHoldingSnapshots: [{ _id: "holding", tokenAddress: retired }],
      tokenMarketState: [{ _id: "market", normalizedTokenAddress: retired }],
      walletTransactions: [{ _id: "tx", tokenAddress: retired, status: "pending" }],
      otcRecords: [{ _id: "hold", amount: "10000000" }],
    };
    const ctx = fixture(tables);
    expect(await cleanupRetiredTokenIndexes(ctx)).toEqual({ deleted: 4, complete: true });
    expect(tables.tokenRegistry.map(row => row._id)).toEqual(["arc"]);
    expect(tables.walletTransactions).toHaveLength(1);
    expect(tables.otcRecords).toHaveLength(1);
    expect(await cleanupRetiredTokenIndexes(ctx)).toEqual({ deleted: 0, complete: true });
  });
  it("resumes bounded cleanup without losing dynamically imported addresses", async () => {
    const tables = {
      legacyNetworkAssetCatalog: [{ _id: "source", address: arc, normalizedAddress: arc }],
      legacyNetworkAssetCatalogState: [{ _id: "state" }],
      walletTokenIndex: Array.from({ length: 9 }, (_, i) => ({ _id: `index${i}`, normalizedTokenAddress: arc })),
    };
    const ctx = fixture(tables);
    expect((await cleanupRetiredTokenIndexes(ctx, 4)).complete).toBe(false);
    expect(tables.legacyNetworkAssetCatalog).toHaveLength(1);
    for (let i = 0; i < 5; i++) { if ((await cleanupRetiredTokenIndexes(ctx, 4)).complete) break; }
    expect(tables.walletTokenIndex).toEqual([]);
    expect(tables.legacyNetworkAssetCatalog).toEqual([]);
    expect(tables.legacyNetworkAssetCatalogState).toEqual([]);
  });
  it("excludes retired addresses, not tickers, from discovery and cached holdings", () => {
    expect(RETIRED_TOKEN_ADDRESSES.size).toBe(58);
    expect(isTokenIndexExcluded(retired.toUpperCase())).toBe(true);
    expect(isTokenIndexExcluded(arc)).toBe(false);
    expect(walletBalanceTokens([{ address: retired, symbol: "NVDA" }, { address: arc, symbol: "NVDA" }]).map(t => t.address)).toEqual([arc]);
    const holding = { address: retired, symbol: "NVDA", name: "NVIDIA", balance: "1" };
    expect(mergeWalletTokenHoldings([holding], { holdings: [holding], zeroAddresses: [], complete: true }, [])).toEqual([]);
    expect(parseExplorerHoldings({ items: [{ value: "1", token: { address_hash: retired, decimals: 18, symbol: "NVDA" } }], next_page_params: null })).toEqual({ holdings: [], complete: true });
  });
});
