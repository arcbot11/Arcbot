import { getAddress, type Address } from "viem";
import { z } from "zod";
import { V3_FACTORY } from "./quotes.ts";
import { poolId, validatePool, type V3Pool } from "./routing.ts";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => getAddress(value));
const itemSchema = z.object({ protocol: z.literal("v3"), address, factoryAddress: address,
  feeTier: z.number().int().min(0).max(1000000), token0: z.object({ address }), token1: z.object({ address }),
});
const responseSchema = z.object({ items: z.array(z.unknown()).max(100), updatedAt: z.string().datetime({ offset: true }) });
const endpoint = "https://www.arcexplorer.org/api/v1/dex/pools";

/** Explorer data proposes candidates only. quoteRoutes verifies factory membership and live state. */
export async function discoverArcV3Pools(tokenIn: Address, tokenOut: Address, fetcher: typeof fetch = fetch, now = Date.now()) {
  const tokens = [...new Set([getAddress(tokenIn), getAddress(tokenOut)])];
  const candidates = new Map<string, V3Pool>();
  const responses = await Promise.all(tokens.map(async token => {
    const url = new URL(endpoint); url.searchParams.set("q", token); url.searchParams.set("limit", "50");
    const response = await fetcher(url, { signal: AbortSignal.timeout(12000), redirect: "error" });
    if (!response.ok) throw new Error("Arc explorer unavailable");
    const payload = responseSchema.parse(await response.json());
    const age = now - Date.parse(payload.updatedAt);
    if (age < -5000 || age > 120000) throw new Error("Arc explorer market index is stale");
    return payload;
  }));
  let ignored = 0;
  for (const response of responses) for (const raw of response.items) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) { ignored++; continue; }
    const item = parsed.data;
    if (item.factoryAddress.toLowerCase() !== V3_FACTORY || !tokens.some(token => token === item.token0.address || token === item.token1.address)) { ignored++; continue; }
    const pool: V3Pool = { protocol: "v3", address: item.address, currency0: item.token0.address, currency1: item.token1.address, fee: item.feeTier };
    try { validatePool(pool); } catch { ignored++; continue; }
    const id = poolId(pool);
    const previous = candidates.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(pool)) throw new Error("Explorer returned conflicting pool identities");
    candidates.set(id, pool);
  }
  return { pools: [...candidates.values()], ignored, source: endpoint, coverage: "bounded-v3-candidates" as const, executionVerified: false };
}
