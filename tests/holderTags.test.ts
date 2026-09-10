import { describe, expect, it } from "vitest";
import { holderTag, LEGACY_LAUNCH_LAUNCH_LOCKER } from "../lib/holder-tags";

describe("holder labels", () => {
  it("labels the exact Argus launch locker before generic liquidity", () => {
    expect(holderTag(LEGACY_LAUNCH_LAUNCH_LOCKER.toUpperCase(), undefined, LEGACY_LAUNCH_LAUNCH_LOCKER, "Liquidity Locker"))
      .toBe("Argus Launch Locker");
  });

  it("retains creator and versioned Uniswap liquidity labels", () => {
    expect(holderTag("0xcreator", "0xcreator", undefined)).toBe("Creator");
    expect(holderTag("0xpool", undefined, undefined, "Uniswap V4 PoolManager")).toBe("Uniswap V4 Liquidity");
  });

  it("labels the pre-graduation liquidity address as the bonding curve", () => {
    expect(holderTag("0xcurve", undefined, "0xcurve", "Argus Curve", false)).toBe("Bonding Curve");
    expect(holderTag("0xcurve", undefined, "0xcurve", "Liquidity", true)).toBe("Liquidity");
  });
});
