import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRouteHint, readRouteHint, type VerifiedRoute } from "../lib/arc/route-hint";

const token = "0x2222222222222222222222222222222222222222";
const usdc = "0x3600000000000000000000000000000000000000";
const context = { wallet: "0x1111111111111111111111111111111111111111", tokenIn: "native", tokenOut: token, scope: "provider-secret/checkpoint" };
const route = (): VerifiedRoute => ({
  route: { tokenIn: usdc, tokenOut: token, pools: [{ protocol: "v3", address: "0x4444444444444444444444444444444444444444", currency0: token, currency1: usdc, fee: 3000 }] },
  block: 123n, hash: `0x${"ab".repeat(32)}`, expires: Date.now() + 300000, verifiedHookPoolIds: [],
});
beforeEach(() => vi.stubEnv("WEB_AUTH_SECRET", "test-only-route-signing-secret"));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("preserves verified identities across servers without exposing provider credentials", () => {
  const expected = route(), hint = createRouteHint(expected, context)!;
  expect(readRouteHint(hint, context)).toEqual(expected);
  expect(readRouteHint(hint, { ...context, tokenIn: usdc })).toEqual(expected);
  const payload = Buffer.from(hint.split(".")[0], "base64url").toString();
  expect(payload).not.toContain(context.scope);
  expect(payload).not.toContain(process.env.WEB_AUTH_SECRET);
});
it("rejects tampering and mismatched wallet, assets or deployment", () => {
  const hint = createRouteHint(route(), context)!;
  expect(readRouteHint(`X${hint.slice(1)}`, context)).toBeNull();
  expect(readRouteHint(`${hint}.extra`, context)).toBeNull();
  for (const change of [{ wallet: token }, { tokenOut: usdc }, { scope: "another-checkpoint" }]) {
    expect(readRouteHint(hint, { ...context, ...change })).toBeNull();
  }
});
it("expires without extending the original discovery lifetime", () => {
  vi.useFakeTimers();
  const hint = createRouteHint(route(), context)!;
  vi.advanceTimersByTime(300000);
  expect(readRouteHint(hint, context)).toBeNull();
});
it("rejects malformed routes and works without hints when signing is unavailable", () => {
  const invalid = route(); invalid.route.pools = [];
  expect(readRouteHint(createRouteHint(invalid, context), context)).toBeNull();
  const hint = createRouteHint(route(), context);
  vi.stubEnv("WEB_AUTH_SECRET", "");
  expect(createRouteHint(route(), context)).toBeUndefined();
  expect(readRouteHint(hint, context)).toBeNull();
});
