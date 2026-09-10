import { describe, expect, it } from "vitest";
import { ARC_TOKEN_CATALOG, canIndexArcToken } from "../lib/arc/token-catalog";
import snapshot from "../docs/research/arc-token-snapshot-2026-09-09.json";
import excluded from "../lib/arc/excluded-catalog-addresses.json";
import { RETIRED_TOKEN_ADDRESSES } from "../lib/token-index-exclusions";
import { seedArcTokenCatalog } from "../convex/arcTokenCatalog";
import type { MutationCtx } from "../convex/_generated/server";

describe("Arc snapshot index selection", () => {
  it("keeps 95 unique tickers including 20 Argus tokens, with no retired addresses", () => {
    expect(ARC_TOKEN_CATALOG).toHaveLength(95);
    expect(new Set(ARC_TOKEN_CATALOG.map(t => t.symbol)).size).toBe(95);
    expect(ARC_TOKEN_CATALOG.filter(t => t.argus)).toHaveLength(20);
    for (const t of ARC_TOKEN_CATALOG) {
      expect(t.chainId).toBe(5042);
      expect(Number.isInteger(t.decimals)).toBe(true);
      expect(RETIRED_TOKEN_ADDRESSES.has(t.address)).toBe(false);
    }
  });
  it("retains the highest-cap contract for each ticker in the combined snapshot", () => {
    const contracts = new Map<string, { address: string; symbol: string; marketCapUsd: number }>();
    // Use ranking-source valuations for addresses also present on the Argus board.
    for (const t of [...snapshot.top100, ...snapshot.argusTokens]) if (!contracts.has(t.address.toLowerCase())) contracts.set(t.address.toLowerCase(), t);
    for (const selected of ARC_TOKEN_CATALOG.filter(t => t.symbol !== "USDC")) {
      const candidates = [...contracts.values()].filter(t => t.symbol.toUpperCase() === selected.symbol);
      expect(selected.marketCapUsd).toBe(Math.max(...candidates.map(t => t.marketCapUsd)));
    }
  });
  it("allows only canonical USDC and prevents rejected addresses from bypassing ticker rules", () => {
    const usdc = ARC_TOKEN_CATALOG.filter(t => t.symbol === "USDC");
    expect(usdc).toHaveLength(1);
    expect(usdc[0]).toMatchObject({ address: "0x3600000000000000000000000000000000000000", decimals: 6 });
    expect(canIndexArcToken(usdc[0].address, " usdc ")).toBe(true);
    expect(canIndexArcToken("0x1111111111111111111111111111111111111111", "USDC")).toBe(false);
    expect(canIndexArcToken(usdc[0].address, "OTHER")).toBe(false);
    for (const address of excluded) expect(canIndexArcToken(address, "OTHER")).toBe(false);
    for (const selected of ARC_TOKEN_CATALOG) {
      expect(canIndexArcToken(selected.address, selected.symbol.toLowerCase())).toBe(true);
      expect(canIndexArcToken("0x1111111111111111111111111111111111111111", selected.symbol)).toBe(false);
    }
  });
  it("seeds idempotently, removes rejected index rows, and never enables launch-pair approval", async () => {
    type Row = { _id: string; [key: string]: unknown };
    const tables: Record<string, Row[]> = {
      tokenRegistry: [{ _id: "reject", normalizedAddress: excluded[0] }],
      walletTokenIndex: [{ _id: "reject-wallet", normalizedTokenAddress: excluded[0] }],
      walletTransactions: [{ _id: "keep-transaction" }],
    };
    let id = 0;
    const ctx = { db: {
      query(table: string) {
        let field: string, value: unknown;
        const q = { withIndex(_index: string, fn: (q: unknown) => unknown) { fn({ eq(f: string, v: unknown) { field = f; value = v; } }); return q; },
          async take(n: number) { return (tables[table] || []).filter(r => r[field] === value).slice(0, n); },
          async unique() { return (await q.take(2))[0] || null; } };
        return q;
      },
      async delete(key: string) { for (const table in tables) tables[table] = tables[table].filter(r => r._id !== key); },
      async insert(table: string, row: Row) { (tables[table] ||= []).push({ ...row, _id: `new${id++}` }); },
      async patch(key: string, patch: Row) { for (const rows of Object.values(tables)) { const row = rows.find(r => r._id === key); if (row) Object.assign(row, patch); } },
    } } as unknown as MutationCtx;
    expect(await seedArcTokenCatalog(ctx)).toEqual({ complete: true });
    expect(await seedArcTokenCatalog(ctx)).toEqual({ complete: true });
    expect(tables.tokenRegistry).toHaveLength(95);
    expect(tables.walletTokenIndex).toEqual([]);
    expect(tables.walletTransactions).toHaveLength(1);
    for (const token of tables.tokenRegistry) expect(token).toMatchObject({ chainId: 5042, active: true, pairCandidate: false, pairApproved: false });
  });
});
