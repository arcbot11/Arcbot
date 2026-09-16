import { describe, expect, it } from "vitest";
import { ARC_TOKEN_CATALOG, canIndexArcToken } from "../lib/arc/token-catalog";
import snapshot from "../docs/research/arc-index-selection-2026-09-13.json";
import additions from "../docs/research/argus-index-additions-2026-09-14.json";
import refresh from "../docs/research/argus-index-additions-2026-09-16.json";
import excluded from "../lib/arc/excluded-catalog-addresses.json";
import { RETIRED_TOKEN_ADDRESSES } from "../lib/token-index-exclusions";
import { seedArcTokenCatalog } from "../convex/arcTokenCatalog";
import type { MutationCtx } from "../convex/_generated/server";

describe("Arc snapshot index selection", () => {
  it("keeps the refreshed unique tickers and Argus launches, with no retired addresses", () => {
    expect(ARC_TOKEN_CATALOG).toHaveLength(refresh.catalogCount);
    expect(new Set(ARC_TOKEN_CATALOG.map(t => t.symbol.normalize("NFKC").toUpperCase())).size).toBe(refresh.catalogCount);
    expect(ARC_TOKEN_CATALOG.filter(t => t.argus)).toHaveLength(refresh.argusCount);
    for (const t of ARC_TOKEN_CATALOG) {
      expect(t.chainId).toBe(5042);
      expect(Number.isInteger(t.decimals)).toBe(true);
      expect(RETIRED_TOKEN_ADDRESSES.has(t.address)).toBe(false);
    }
  });
  it("retains the highest-cap contract for each ticker in the combined snapshot", () => {
    const contracts = new Map<string, { address: string; symbol: string; marketCapUsd: number }>();
    // Fresh source valuations include on-chain fallbacks for unpriced old tokens.
    for (const t of snapshot.candidates) contracts.set(t.address.toLowerCase(), t);
    for (const selected of ARC_TOKEN_CATALOG.filter(t => t.symbol !== "USDC" && contracts.has(t.address))) {
      const candidates = [...contracts.values()].filter(t => t.symbol.normalize("NFKC").toUpperCase() === selected.symbol.normalize("NFKC").toUpperCase());
      expect(selected.marketCapUsd).toBe(Math.max(...candidates.map(t => t.marketCapUsd)));
    }
  });
  it("adds verified recent launches once and excludes their rejected duplicates", () => {
    expect(additions.added).toHaveLength(63);
    for (const token of additions.added) {
      if (refresh.replaced.some(t => t.previous === token.address)) continue;
      expect(ARC_TOKEN_CATALOG.filter(t => t.address === token.address)).toEqual([token]);
      const candidates = additions.candidates.filter(t => t.symbol === token.symbol);
      expect(token.marketCapUsd).toBe(Math.max(...candidates.map(t => t.marketCapUsd)));
      expect(candidates.find(t => t.address === token.address)?.portal).toMatch(/^0x[0-9a-f]{40}$/);
    }
    for (const token of additions.skipped) {
      expect(ARC_TOKEN_CATALOG.some(t => t.address === token.address)).toBe(false);
      expect(canIndexArcToken(token.address, token.symbol)).toBe(false);
      expect(canIndexArcToken(token.address, "RENAMED")).toBe(false);
    }
  });
  it("admits only screened, on-chain verified additions and retires replaced ticker addresses", () => {
    for (const token of refresh.added) {
      expect(ARC_TOKEN_CATALOG.find(t => t.address === token.address)).toEqual(token);
      const evidence = refresh.verified.find(t => t.address === token.address)!;
      expect(evidence.portal).toMatch(/^0x[0-9a-f]{40}$/);
      expect(evidence.volume24h).toBeGreaterThanOrEqual(refresh.screen.minVolume24hUsd);
      expect(evidence.liquidityUsd).toBeGreaterThanOrEqual(refresh.screen.minLiquidityUsd);
      expect(evidence.trades).toBeGreaterThanOrEqual(refresh.screen.minTrades);
      expect(evidence.volume24h / evidence.marketCap).toBeGreaterThanOrEqual(refresh.screen.minVolumeToMarketCap);
    }
    for (const token of refresh.replaced) {
      expect(ARC_TOKEN_CATALOG.some(t => t.address === token.previous)).toBe(false);
      expect(canIndexArcToken(token.previous, token.symbol)).toBe(false);
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
  it("keeps the reviewed near-empty pools out of indexing even with renamed metadata", () => {
    const rejected = [
      ["KTEST", "0x7555a09d2a6798fd863c014d54226e15b45b5085"],
      ["SGR", "0xffa9d1836bd073855e15788d0ca3d645b6f68018"],
      ["BARC", "0x4753c45fb550fecaa143a47968659117e6ffc2ce"],
    ];
    for (const [symbol, address] of rejected) {
      expect(ARC_TOKEN_CATALOG.some(t => t.address === address)).toBe(false);
      expect(canIndexArcToken(address, symbol)).toBe(false);
      expect(canIndexArcToken(address.toUpperCase(), "RENAMED")).toBe(false);
    }
    expect(ARC_TOKEN_CATALOG[0].symbol).toBe("ARGOS");
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
    expect(tables.tokenRegistry).toHaveLength(refresh.catalogCount);
    expect(tables.walletTokenIndex).toEqual([]);
    expect(tables.walletTransactions).toHaveLength(1);
    for (const token of tables.tokenRegistry) expect(token).toMatchObject({ chainId: 5042, active: true, pairCandidate: false, pairApproved: false });
  });
});
