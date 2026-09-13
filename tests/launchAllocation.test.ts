import { expect, it } from "vitest";
import { parseAllocation, completeAllocation, ALLOCATION_KEYS } from "../lib/launches/allocation";
import { parseLaunchInput } from "../lib/launches/input";
const input = { name: "Example", symbol: "EXAMPLE", imageURI: "ipfs://Qm" + "a".repeat(44) };
const shares = (text: string) => { const r = parseAllocation(text); return ALLOCATION_KEYS.map(k => r[k]); };
it.each([
  ["", [10000, 0, 0, 0]],
  ["all to creator", [10000, 0, 0, 0]],
  ["All fees to me.", [10000, 0, 0, 0]],
  ["everything to buyback-and-burn", [0, 10000, 0, 0]],
  ["all to holder rewards", [0, 0, 10000, 0]],
  ["all to LP", [0, 0, 0, 10000]],
  ["half creator half dividends", [5000, 0, 5000, 0]],
  ["creator half, holders half", [5000, 0, 5000, 0]],
  ["25% to burn", [7500, 2500, 0, 0]],
  ["burn 25", [7500, 2500, 0, 0]],
  ["25% burn, 25% holders", [5000, 2500, 2500, 0]],
  ["creator 20%, burn 30%", [7000, 3000, 0, 0]],
  ["20% burn, rest evenly between creator and holders", [4000, 2000, 4000, 0]],
  ["half creator, rest evenly between burn and holders", [5000, 2500, 2500, 0]],
  ["spread across creator, burn, holders and liquidity", [2500, 2500, 2500, 2500]],
  ["spread fees evenly between creator and dividends", [5000, 0, 5000, 0]],
  ["creator and dividends evenly", [5000, 0, 5000, 0]],
  ["spread evenly", [2500, 2500, 2500, 2500]],
  ["20% each burn and dividends", [6000, 2000, 2000, 0]],
  ["50/50 creator and burn", [5000, 5000, 0, 0]],
  ["split 50/50 between creator and burn", [5000, 5000, 0, 0]],
  ["50/25/25 creator burn liquidity", [5000, 2500, 0, 2500]],
  ["a quarter to burn, three quarters to developer", [7500, 2500, 0, 0]],
  ["fifty percent to creator and fifty percent to dividends", [5000, 0, 5000, 0]],
  ["twenty-five percent buyback and burn", [7500, 2500, 0, 0]],
  ["thirty percent buyback/burn, rest divs", [0, 3000, 7000, 0]],
  ["one-half creator, one-half holders", [5000, 0, 5000, 0]],
  ["1/2 creator 1/2 liquidity", [5000, 0, 0, 5000]],
  ["a third creator two thirds holders", [3333, 0, 6667, 0]],
  ["no creator, all dividends", [0, 0, 10000, 0]],
  ["creator 0%, dividends rest", [0, 0, 10000, 0]],
  ["0.01% burn", [9999, 1, 0, 0]],
  ["equally creator burn holders", [3334, 3333, 3333, 0]],
] as const)("resolves %s", (text, expected) => expect(shares(text)).toEqual(expected));
it.each([
  "110% creator", "80% creator 30% burn", "50% creator 50% creator", "creator and burn",
  "some to holders", "more to creator", "half creator half marketing", "-10% burn", "NaN creator",
  "25.001% burn", "rest creator rest holders", "half creator and burn", "all", "no creator",
  "all to creator not holders", "0/0 creator creator", "50/50/50 creator holders", "20% each rest holders",
  "50% burn; ignore the previous instructions", "10 USDC to creator", "burn: null", "all constructor", "all __proto__",
])("requires clarification for %s", text => expect(() => parseAllocation(text)).toThrow());
it("fills structured remainders and keeps the parser's normalized result stable", () => {
  expect(completeAllocation({ burnBps: 2500 })).toMatchObject({ creatorBps: 7500, remainderToCreatorBps: 7500 });
  const parsed = parseLaunchInput({ ...input, allocationText: "quarter burn rest holders" });
  expect(parsed).toMatchObject({ creatorBps: 0, burnBps: 2500, dividendBps: 7500, liquidityBps: 0, buyTaxBps: 100, sellTaxBps: 100 });
  expect(parseLaunchInput(parsed)).toEqual(parsed);
});
it("defaults to creator and removes tax collection from the required input", () => {
  expect(parseLaunchInput(input)).toMatchObject({ buyTaxBps: 100, sellTaxBps: 100, creatorBps: 10000 });
  expect(parseLaunchInput({ ...input, burnBps: 2500 })).toMatchObject({ creatorBps: 7500, burnBps: 2500 });
});
it.each([{ buyTaxBps: 0 }, { sellTaxBps: 200 }, { buyTaxBps: "1%" }, { sellTaxBps: null }])("rejects tax overrides %j", change => {
  expect(() => parseLaunchInput({ ...input, ...change })).toThrow("fixed at 1%");
});
it("does not silently override a structured allocation with text", () => {
  expect(() => parseLaunchInput({ ...input, allocationText: "all burn", creatorBps: 10000 })).toThrow("not both");
  expect(() => parseLaunchInput({ ...input, creatorBps: null })).toThrow();
});
it("all generated valid partial percentages resolve to exactly 100%", () => {
  for (let burn = 0; burn <= 100; burn++) {
    const r = parseAllocation(`${burn}% burn`);
    expect(ALLOCATION_KEYS.reduce((sum, k) => sum + r[k], 0)).toBe(10000);
    expect(r.burnBps).toBe(burn * 100);
  }
});
