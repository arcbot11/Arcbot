import { afterEach, expect, it, vi } from "vitest";
import { effectiveXIntakeFilters, intakeSourceTransition, restrictedXSearchQuery, restrictedXIntakeEnabled } from "../lib/x-intake-filter";
import { advanceXIntakeSpikeGuard, X_INTAKE_SPIKE_HOLD_MS } from "../lib/x-intake-spike-guard";
afterEach(() => vi.unstubAllEnvs());
it("ignores retired manual filters and automatic wallet exclusions", () => {
  for (const key of ["X_READ_EXCLUDE_WALLET_BALANCE", "X_READ_EXCLUDE_SHOW_MY_WALLET", "X_READ_VERIFIED_ONLY"]) vi.stubEnv(key, "true");
  vi.stubEnv("X_READ_EXCLUDED_COUNTRIES", "US,CA");
  expect(restrictedXIntakeEnabled()).toBe(false);
  expect(effectiveXIntakeFilters({ excludeWalletBalance: true, verifiedOnly: false })).toEqual({excludeWalletBalance:false,excludeShowMyWallet:false,verifiedOnly:false,countries:[],restricted:false});
  vi.stubEnv("X_BOT_USERNAME", "ArcChainBot");
  expect(restrictedXSearchQuery(true, false, ["US"], true)).toBe("(@ArcChainBot OR to:ArcChainBot)");
});
it("keeps the emergency overlay and releases it after expiry", () => {
  const now = Date.now();
  const ids = Array.from({ length: 60 }, (_, i) => (((BigInt(now - 1000) - 1288834974657n) << 22n) + BigInt(i)).toString());
  const guard = advanceXIntakeSpikeGuard(undefined, now, ids, true, { excludeWalletBalance: false, verifiedOnly: false });
  expect(effectiveXIntakeFilters(guard.filters)).toMatchObject({verifiedOnly:true,excludeWalletBalance:false,restricted:true});
  const released = advanceXIntakeSpikeGuard(guard.state, now + X_INTAKE_SPIKE_HOLD_MS + 1, [], true, { excludeWalletBalance: false, verifiedOnly: false });
  expect(effectiveXIntakeFilters(released.filters).restricted).toBe(false);
  vi.stubEnv("X_BOT_USERNAME", "ArcChainBot");
  expect(restrictedXSearchQuery(true, true, ["CA"], true)).toBe("(@ArcChainBot OR to:ArcChainBot) is:verified");
});
it("resets page tokens when entering or leaving emergency search", () => {
  const on = intakeSourceTransition("mentions", false, Date.now(), true)!;
  expect(on.intakeSource).toBe("emergency_premium");
  expect(on.backlogPaginationToken).toBeUndefined();
  expect(intakeSourceTransition("emergency_premium", false, Date.now(), true)).toBeUndefined();
  expect(intakeSourceTransition("emergency_premium", false, Date.now(), false)?.intakeSource).toBe("mentions");
  expect(intakeSourceTransition("filtered_wallet_balance", false, Date.now(), false)?.intakeSource).toBe("mentions");
});
