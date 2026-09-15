import { expect, it } from "vitest";
import { currentValuation, DISPLAY_PRICE_MAX_AGE_MS, freshDisplayPrice } from "../lib/price-freshness";
const now=Date.parse("2026-09-14T20:00:00Z");
it("rejects unknown, invalid, expired and future source timestamps",()=>{
  for(const time of [null,undefined,"invalid",new Date(now-DISPLAY_PRICE_MAX_AGE_MS).toISOString(),new Date(now+60_000).toISOString()])expect(freshDisplayPrice(time,now)).toBe(false);
  expect(freshDisplayPrice(new Date(now-299_999).toISOString(),now)).toBe(true);
});
it("removes only a stale estimate, retaining the actual token balance",()=>{
  const token={balance:"100",usdValue:42,pricedAt:new Date(now-300_000).toISOString()};
  expect(currentValuation(token,now)).toEqual({balance:"100",usdValue:null,pricedAt:null});
  expect(token.usdValue).toBe(42);
});
