import { afterEach, expect, it, vi } from "vitest";
import { ARC_TOKEN_CATALOG, CANONICAL_ARC_USDC, canIndexArcToken, isArcUsdcSymbol } from "../lib/arc/token-catalog";
import { seedArcTokenCatalog } from "../convex/arcTokenCatalog";
import type { MutationCtx } from "../convex/_generated/server";

vi.mock("../convex/_generated/server", () => ({ internalMutation: (definition: unknown) => definition, internalQuery: (definition: unknown) => definition }));
import { upsertDiscoveredPairCandidate, updatePairVerification } from "../convex/registry";
const fake = "0x1111111111111111111111111111111111111111";
const size = ARC_TOKEN_CATALOG.length;
afterEach(() => { ARC_TOKEN_CATALOG.splice(size); });

it.each(["USDC", "usdc", " USDC ", "$USDC", "$$usdc", "ＵＳＤＣ", "US\u200bDC", "US DC"])("reserves %s for native Arc USDC", async symbol => {
  expect(isArcUsdcSymbol(symbol)).toBe(true);
  expect(canIndexArcToken(fake, symbol)).toBe(false);
  expect(canIndexArcToken(CANONICAL_ARC_USDC, symbol)).toBe(true);
  const query = vi.fn(() => { throw new Error("Rejected token must not touch the database"); });
  for (const mutation of [upsertDiscoveredPairCandidate, updatePairVerification]) {
    const definition = mutation as unknown as { handler: (ctx: unknown, args: unknown) => Promise<unknown> };
    await definition.handler({ db: { query } }, { address: fake, symbol, name: "USD Coin", decimals: 6, approved: true, verifiedAt: 1 });
  }
  expect(query).not.toHaveBeenCalled();
});

it("rejects a future fake-USDC seed before touching any records", async () => {
  ARC_TOKEN_CATALOG.push({ ...ARC_TOKEN_CATALOG[0], address: fake, symbol: "$USDC" });
  await expect(seedArcTokenCatalog({} as MutationCtx)).rejects.toThrow("Invalid Arc token catalog");
});

it("preserves unrelated token symbols and explicit contract identifiers", () => {
  expect(isArcUsdcSymbol(fake)).toBe(false);
  expect(isArcUsdcSymbol("USDCBULL")).toBe(false);
  expect(canIndexArcToken(fake, "UNIQUE_TOKEN")).toBe(true);
});
