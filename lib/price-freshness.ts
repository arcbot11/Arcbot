/** Display prices expire by source time, never by the time a cache was read. */
export const DISPLAY_PRICE_MAX_AGE_MS = 5 * 60_000;
export function freshDisplayPrice(pricedAt: string | null | undefined, now = Date.now()): boolean {
  if (!pricedAt) return false;
  const at = Date.parse(pricedAt);
  return Number.isFinite(at) && at <= now + 30_000 && now - at < DISPLAY_PRICE_MAX_AGE_MS;
}
export function currentValuation<T extends { usdValue?: number | null; pricedAt?: string | null }>(value: T, now = Date.now()): T {
  return value.usdValue != null && !freshDisplayPrice(value.pricedAt, now) ? { ...value, usdValue: null, pricedAt: null } : value;
}
