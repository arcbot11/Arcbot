import { expect, it } from "vitest";
import { listingCostPercent } from "../lib/otc/listing-cost";
import { SERVICE_FEE_BPS, usdcPrice } from "../lib/otc/model";

it.each([0, 1, 7400, 1_000_000])("matches quoted USDC pricing at %i premium basis points", premium => {
  // Large enough to represent fractional percentage points without payment rounding.
  const amount=10_000_000_000n;
  const quote=usdcPrice(amount,premium,SERVICE_FEE_BPS);
  const cost=listingCostPercent(premium);
  expect(cost.total).toBeCloseTo(Number(quote.totalWei)/Number(amount)*100,6);
  expect(cost.aboveFaceValue).toBeCloseTo(cost.total-100,6);
});
it("applies the service fee on top of the premium",()=>{
  expect(listingCostPercent(7400)).toEqual({total:176.61,aboveFaceValue:76.61});
});
