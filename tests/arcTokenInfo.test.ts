import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ check: vi.fn(), block: vi.fn(), decimals: vi.fn(), balance: vi.fn(), read: vi.fn() }));
vi.mock("../lib/arc/wallet-balance", () => ({ arcDisplayConfig: () => ({}) }));
vi.mock("../lib/arc/transport", () => ({ arcTransport: () => ({}) }));
vi.mock("../lib/arc/rpc", () => ({ checkArcRpc: mocks.check, createArcRpc: () => ({ block: mocks.block, decimals: mocks.decimals, tokenBalance: mocks.balance }) }));
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(), createPublicClient: () => ({ readContract: mocks.read }) }));
import { arcTokenInfo } from "../lib/arc/token-info";
const token = "0x1111111111111111111111111111111111111111";
const owner = "0x2222222222222222222222222222222222222222";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.check.mockResolvedValue({ number: 40n, hash: "0xabc" });
  mocks.block.mockResolvedValue({ hash: "0xabc" });
  mocks.decimals.mockResolvedValue(6);
  mocks.balance.mockResolvedValue(1_500_000n);
  mocks.read.mockImplementation(async ({ functionName }) => functionName === "symbol" ? "TOKEN" : 100_000_000n);
});
it("pins metadata and owner balances to a verified Arc block", async () => {
  expect(await arcTokenInfo(token, owner)).toMatchObject({ symbol: "TOKEN", decimals: 6, raw: "1500000", totalSupplyRaw: "100000000", display: "1.5 TOKEN" });
  expect(mocks.balance).toHaveBeenCalledWith(token, owner, 40n);
  expect(mocks.decimals).toHaveBeenCalledWith(token, 40n);
  expect(mocks.read.mock.calls.every(([input]) => input.blockNumber === 40n)).toBe(true);
});
it("rejects a changed block rather than returning mixed state", async () => {
  mocks.block.mockResolvedValue({ hash: "0xother" });
  await expect(arcTokenInfo(token, owner)).rejects.toThrow("block changed");
});
it("does not read token state on an unverified network", async () => {
  mocks.check.mockRejectedValue(Error("Wrong chain"));
  await expect(arcTokenInfo(token)).rejects.toThrow("Wrong chain");
  expect(mocks.read).not.toHaveBeenCalled();
});
