import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  value: vi.fn(), base: vi.fn(), price: vi.fn(), balance: vi.fn(), block: vi.fn(), check: vi.fn(), tokens: vi.fn(), selected: vi.fn(),
}));
vi.mock("../lib/otc/runtime",()=>({balanceSnapshot:mocks.base,ethPrice:mocks.price}));
vi.mock("../lib/arc/wallet-balance", () => ({ arcDisplayConfig: () => ({}) }));
vi.mock("../lib/arc/rpc", () => ({ checkArcRpc: mocks.check, createArcRpc: () => ({ balance: mocks.balance, block: mocks.block }) }));
vi.mock("../lib/arc/wallet-tokens", () => ({ arcTokenBalances: mocks.tokens, arcSelectedTokenBalance: mocks.selected }));
vi.mock("../lib/arc/token-info", () => ({ arcTokenInfo: mocks.selected }));
vi.mock("../lib/arc/token-value",()=>({tokenUsdEstimate:mocks.value}));
import { arcSocialBalance } from "../lib/arc/social-balance";
import { balanceRequestSchema } from "../lib/wallet-signer/policy";
const owner = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.value.mockResolvedValue({usdValue:null});
  mocks.check.mockResolvedValue({ number: 12n, hash: "0xabc" });
  mocks.block.mockResolvedValue({ hash: "0xabc" });
  mocks.balance.mockResolvedValue(10_500_000_000_000_000_000n);
  mocks.tokens.mockResolvedValue({ tokens: [], partial: false });
  mocks.base.mockResolvedValue({balanceWei:"0"});mocks.price.mockResolvedValue({ethUsdMicros:"2000000000"});
});
it("accepts Arc balance reads and rejects unrelated chain IDs", () => {
  const request = { chainId: 5042, walletRef: owner, expectedAddress: owner, ownerReference: "x:123" };
  expect(balanceRequestSchema.parse(request).chainId).toBe(5042);
  expect(balanceRequestSchema.safeParse({ ...request, chainId: 8453 }).success).toBe(false);
});
it("labels Arc native balance as USDC with 18 decimals", async () => {
  expect(await arcSocialBalance(owner, "USDC")).toMatchObject({ display: "10.50 USDC ($10.50)", symbol: "USDC", decimals: 18 });
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

it("includes positive Base ETH with its USD value",async()=>{
 mocks.base.mockResolvedValue({balanceWei:"10000000000000000"});
 const result=await arcSocialBalance(owner);expect(result.display).toContain("0.01 Base ETH ($20.00)");expect(mocks.base).toHaveBeenCalledWith(8453,owner);
});
it("keeps tiny ETH balances visible and does not require a price",async()=>{
 mocks.base.mockResolvedValue({balanceWei:"1"});mocks.price.mockRejectedValue(Error("offline"));
 expect((await arcSocialBalance(owner)).display).toContain("0.000000000000000001 Base ETH");
});
it("does not lose Arc balances when Base is unavailable",async()=>{
 mocks.base.mockRejectedValue(Error("offline"));const result=await arcSocialBalance(owner);expect(result.display).toContain("10.50 USDC ($10.50)");expect(result.display).toContain("Base balance unavailable.");
});
it("does not fetch Base for a specific Arc token query",async()=>{
 await arcSocialBalance(owner,"USDC");expect(mocks.base).not.toHaveBeenCalled();
});

it("formats holdings as whole tokens with USD beside the amount",async()=>{
 mocks.tokens.mockResolvedValue({tokens:[{balance:"12345.987654",symbol:"ARGOS",address:owner,usdValue:45.678}],partial:false});
 const result=await arcSocialBalance(owner);
 expect(result.display).toContain("12,345 ARGOS ($45.68)");expect(result.display).not.toContain("987654");
});
it("formats a requested token with a price based on its full balance",async()=>{
 mocks.selected.mockResolvedValue({raw:"3999999",decimals:6,symbol:"TOKEN"});mocks.value.mockResolvedValue({usdValue:12.34});
 expect((await arcSocialBalance(owner,owner)).display).toBe("3 TOKEN ($12.34)");
 expect(mocks.value).toHaveBeenCalledWith(owner,"3.999999");
});
it("preserves tiny nonzero tokens instead of showing zero",async()=>{
 mocks.tokens.mockResolvedValue({tokens:[{balance:"0.000123456",symbol:"SMALL",address:owner,usdValue:0.5}],partial:false});
 expect((await arcSocialBalance(owner)).display).toContain("0.000123 SMALL ($0.50)");
});
