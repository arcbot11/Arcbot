import { expect, it } from "vitest";
import { ethUsdDisplay } from "../lib/base/eth-usd-display";
it("converts wei and decimal ETH using a micro-dollar price", () => {
  expect(ethUsdDisplay("250000000000000000", undefined, "2400000000")).toBe("$600.00");
  expect(ethUsdDisplay(undefined, "0.25", "2400000000")).toBe("$600.00");
});
it("preserves dust and exact large balances without floating point rounding", () => {
  expect(ethUsdDisplay("1", undefined, "2400000000")).toBe("$0.0000000000000024");
  expect(ethUsdDisplay("9007199254740993000000000000000000", undefined, "1000000")).toBe("$9,007,199,254,740,993.00");
});
it("does not invent a value when pricing or the amount is missing", () => {
  expect(ethUsdDisplay("1000000000000000000", undefined, null)).toBeNull();
  expect(ethUsdDisplay(undefined, "abc", "2400000000")).toBeNull();
  expect(ethUsdDisplay(null, undefined, "2400000000")).toBeNull();
  expect(ethUsdDisplay("1", undefined, "0")).toBeNull();
  expect(ethUsdDisplay("0", undefined, null)).toBe("$0.00");
});
