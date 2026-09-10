import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  balance: vi.fn(), block: vi.fn(), check: vi.fn(), tokens: vi.fn(), selected: vi.fn(),
}));
vi.mock("../lib/arc/wallet-balance", () => ({ arcDisplayConfig: () => ({}) }));
vi.mock("../lib/arc/rpc", () => ({ checkArcRpc: mocks.check, createArcRpc: () => ({ balance: mocks.balance, block: mocks.block }) }));
vi.mock("../lib/arc/wallet-tokens", () => ({ arcTokenBalances: mocks.tokens, arcSelectedTokenBalance: mocks.selected }));
vi.mock("../lib/arc/token-info", () => ({ arcTokenInfo: mocks.selected }));
import { arcSocialBalance } from "../lib/arc/social-balance";
import { balanceRequestSchema } from "../lib/wallet-signer/policy";
const owner = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.check.mockResolvedValue({ number: 12n, hash: "0xabc" });
  mocks.block.mockResolvedValue({ hash: "0xabc" });
  mocks.balance.mockResolvedValue(10_500_000_000_000_000_000n);
  mocks.tokens.mockResolvedValue({ tokens: [], partial: false });
});
it("accepts Arc balance reads and rejects unrelated chain IDs", () => {
  const request = { chainId: 5042, walletRef: owner, expectedAddress: owner, ownerReference: "x:123" };
  expect(balanceRequestSchema.parse(request).chainId).toBe(5042);
  expect(balanceRequestSchema.safeParse({ ...request, chainId: 8453 }).success).toBe(false);
});
it("labels Arc native balance as USDC with 18 decimals", async () => {
  expect(await arcSocialBalance(owner, "USDC")).toMatchObject({ display: "10.5 USDC", symbol: "USDC", decimals: 18 });
  expect(mocks.balance).toHaveBeenCalledWith(owner, 12n);
  expect(mocks.tokens).not.toHaveBeenCalled();
});
it("includes discovered token balances and marks incomplete discovery", async () => {
  mocks.tokens.mockResolvedValue({ tokens: [{ balance: "15", symbol: "TOKEN", address: owner }], partial: true });
  const result = await arcSocialBalance(owner);
  expect(result.display).toContain("15 TOKEN");
  expect(result.display).toContain("Some token balances are unavailable");
  expect(result.display).not.toContain("ETH");
});
it("rejects an unverified chain or changed balance block", async () => {
  mocks.block.mockResolvedValue({ hash: "0xchanged" });
  await expect(arcSocialBalance(owner, "USDC")).rejects.toThrow("block changed");
  mocks.check.mockRejectedValue(Error("RPC is not Arc mainnet"));
  await expect(arcSocialBalance(owner, "USDC")).rejects.toThrow("not Arc mainnet");
});
it("requires a contract for an unresolved ticker", async () => {
  await expect(arcSocialBalance(owner, "NOTINDEXEDUNIQUE")).rejects.toThrow("contract address");
  expect(mocks.selected).not.toHaveBeenCalled();
});

it("reads arbitrary contract balances through verified Arc metadata", async () => {
  mocks.selected.mockResolvedValue({ display: "3 TOKEN", raw: "3000000", decimals: 6, symbol: "TOKEN" });
  expect(await arcSocialBalance(owner, owner)).toMatchObject({ display: "3 TOKEN", decimals: 6 });
  expect(mocks.selected).toHaveBeenCalledWith(owner, owner);
});
