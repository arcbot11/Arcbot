import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ native: vi.fn(), tokens: vi.fn() }));
vi.mock("../lib/arc/wallet-balance", () => ({ arcWalletBalance: m.native }));
vi.mock("../lib/arc/wallet-tokens", () => ({ arcTokenBalances: m.tokens }));
import { GET } from "../app/api/wallet/public/[address]/route";
const address = "0x1111111111111111111111111111111111111111";
const request = (owner = address) => GET(new Request(`https://www.argosbot.io/api/wallet/public/${owner}`), { params: Promise.resolve({ address: owner }) });
beforeEach(() => { vi.clearAllMocks(); m.native.mockResolvedValue({ balanceWei: "10000000000000000000", block: "1" }); m.tokens.mockResolvedValue({ tokens: [], partial: false, block: "1" }); });
it("returns public chain balances without authentication or private records", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ walletAddress: address, balanceWei: "10000000000000000000", tokens: [], partial: false });
  expect(m.native).toHaveBeenCalledWith(address); expect(m.tokens).toHaveBeenCalledWith(address);
});
it("rejects invalid addresses before reading the chain", async () => {
  expect((await request("invalid")).status).toBe(400); expect(m.native).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
});
it("preserves USDC balances when token discovery fails", async () => {
  m.tokens.mockRejectedValue(Error("private provider URL"));
  expect(await (await request()).json()).toEqual({ walletAddress: address, balanceWei: "10000000000000000000", tokens: [], partial: true });
});
it("does not report a failed native read as a zero balance", async () => {
  m.native.mockRejectedValue(Error("unavailable"));
  expect(await (await request()).json()).toMatchObject({ balanceWei: null, partial: true });
});
