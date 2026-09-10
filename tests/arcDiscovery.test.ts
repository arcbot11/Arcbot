import { describe, expect, it, vi } from "vitest";
import { discoverArcV3Pools } from "../lib/arc/discovery.ts";
import { V3_FACTORY } from "../lib/arc/quotes.ts";
const a = "0x0000000000000000000000000000000000000010";
const b = "0x0000000000000000000000000000000000000020";
const c = "0x0000000000000000000000000000000000000030";
const now = 1800000000000;
const item = { protocol: "v3", address: c, factoryAddress: V3_FACTORY, feeTier: 3000, token0: { address: a }, token1: { address: b } };
const response = (items: unknown[], timestamp = now) => Response.json({ items, updatedAt: new Date(timestamp).toISOString() });
describe("Arc explorer discovery", () => {
  it("deduplicates exact-address candidates without contacting other market providers", async () => {
    const fetcher = vi.fn<typeof fetch>(async url => {
      expect(new URL(String(url)).origin).toBe("https://www.arcexplorer.org");
      expect([a, b]).toContain(new URL(String(url)).searchParams.get("q"));
      return response([item]);
    });
    const result = await discoverArcV3Pools(a, b, fetcher, now);
    expect(result.pools).toHaveLength(1); expect(result.executionVerified).toBe(false);
  });
  it("ignores unsupported factories, malformed records and unrelated pools", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response([{ ...item, factoryAddress: c }, { protocol: "v4" }, { ...item, token0: { address: c }, token1: { address: "0x0000000000000000000000000000000000000040" } }]));
    expect((await discoverArcV3Pools(a, b, fetcher, now)).pools).toEqual([]);
  });
  it("rejects stale data and conflicting pool identities", async () => {
    await expect(discoverArcV3Pools(a, b, async () => response([item], now - 121000), now)).rejects.toThrow(/stale/);
    await expect(discoverArcV3Pools(a, b, async () => response([item, { ...item, feeTier: 500 }]), now)).rejects.toThrow(/conflicting/);
  });
});
