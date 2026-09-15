import { freshDisplayPrice } from "./price-freshness";
type Price = { priceUsd: number; pricedAt: string | null };
const cache = new Map<string, { expires: number; request: Promise<Price | null> }>();
const queue: (() => void)[] = [];
let active = 0;

/** Keep price loading independent of balances; limit concurrent card requests. */
export function loadTokenPrice(address: string): Promise<Price | null> {
  const key = address.toLowerCase(), hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.request.then(price => price && freshDisplayPrice(price.pricedAt) ? price : null);
  const request = (async () => {
    await new Promise<void>(resolve => { const start = () => { active++; resolve(); }; if (active < 4) start(); else queue.push(start); });
    try {
      const response = await fetch(`/api/arc/token-price?token=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (!response.ok) return null;
      const data = await response.json();
      return data.token === key && typeof data.priceUsd === "number" && Number.isFinite(data.priceUsd) && data.priceUsd > 0 && typeof data.pricedAt === "string" && freshDisplayPrice(data.pricedAt)
        ? { priceUsd: data.priceUsd, pricedAt: typeof data.pricedAt === "string" ? data.pricedAt : null } : null;
    } catch { return null; }
    finally { active--; queue.shift()?.(); }
  })().then(price => {
    if (cache.get(key)?.request === request) cache.get(key)!.expires = Date.now() + (price ? 60000 : 10000);
    return price;
  });
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Infinity, request });
  return request;
}
