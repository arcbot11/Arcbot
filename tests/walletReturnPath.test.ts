import { expect, it } from "vitest";
import { walletReturnPath } from "../lib/wallet-return-path";
it("returns to the specific wallet or OTC market", () => {
  const path = "/wallet/0x1111111111111111111111111111111111111111";
  expect(walletReturnPath(path)).toBe(path);
  expect(walletReturnPath("/otc")).toBe("/otc");
});
it.each([null, undefined, "https://evil.example", "//evil.example", "/\\evil.example", "/wallet/invalid", "/wallet/0x1111111111111111111111111111111111111111/../../api", "/wallet?returnTo=https://evil.example", "/terminal"])("rejects unsafe or obsolete return paths: %s", value => {
  expect(walletReturnPath(value)).toBe("/wallet");
});
