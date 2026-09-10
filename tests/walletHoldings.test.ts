import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeWalletTokenHoldings, parseExplorerHoldings, walletBalanceTokens } from "../lib/wallet-holdings";
const arcToken = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({ readContract: vi.fn(), rpcFetch: vi.fn(), query: vi.fn(), native: vi.fn(), tokens: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = mocks.query; } }));
vi.mock("@/convex/_generated/api", () => ({ api: { site: { getWallet: "wallet" } } }));
vi.mock("../lib/public-display-cache", () => ({ readPublicMarketStates: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/token-market-cap", () => ({ tokenUnitPriceUsd: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/wallet-signer/pricing", () => ({ ethUsdPrice: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rpc-http", () => ({ reliableHttp: vi.fn(), retryingRpcFetch: mocks.rpcFetch }));
vi.mock("viem", async importOriginal => ({ ...await importOriginal<typeof import("viem")>(), createPublicClient: () => ({ readContract: mocks.readContract }) }));
vi.mock("../lib/arc/wallet-balance", () => ({ arcWalletBalance: mocks.native }));
vi.mock("../lib/arc/wallet-tokens", () => ({ arcTokenBalances: mocks.tokens }));
import { getWalletHoldings } from "../lib/site-data";

const wallet = "0x94613D7B572d03B280cdab84318c778B320acD77";
const usdg = "0x3333333333333333333333333333333333333333";
const other = `0x${"1".repeat(40)}`;
const rawBalance = "6235726516564749138350510";
const entry = (address = arcToken, value = rawBalance, decimals = "18") => ({ value, token: { address_hash: address, name: "Arctos Bot", symbol: "TOKEN1", decimals, type: "ERC-20" } });
const page = (items: unknown[], next_page_params: unknown = null) => ({ items, next_page_params });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpcFetch.mockResolvedValue(new Response('{"result":"0x0"}'));
  mocks.query.mockResolvedValue(null);
  mocks.readContract.mockImplementation(async ({ address, functionName }) => {
    if (address === usdg && functionName === "balanceOf") return 0n;
    if (functionName === "balanceOf") return BigInt(rawBalance);
    if (functionName === "decimals") return 18;
    if (functionName === "symbol") return "TOKEN1";
    if (functionName === "name") return "Arctos Bot";
    throw new Error("Unexpected RPC read");
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/tokens?")) return Response.json(page([entry()]));
    if (url.includes("/addresses/")) return Response.json({ coin_balance: "0" });
    if (url.includes("/rhj/assets")) return Response.json({ assets: [] });
    throw new Error("Unexpected endpoint");
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("wallet token discovery and reconciliation", () => {
  it("has no inherited balance probes", () => expect(walletBalanceTokens()).toEqual([]));
  it("deduplicates explicitly tracked tokens", () => {
    const token = { address: arcToken, symbol: "TOKEN", iconUrl: "/art.png", isArcBotLaunch: true };
    expect(walletBalanceTokens([token, token])).toEqual([token]);
  });
  it("reads the modern paginated response and exact token units", () => {
    expect(parseExplorerHoldings(page([entry()]))).toMatchObject({ complete: true, holdings: [{ balance: "6235726.51656474913835051" }] });
  });
  it("still accepts legacy arrays and zero-decimal tokens", () => {
    expect(parseExplorerHoldings([entry(other, "12", "0")])).toMatchObject({ complete: true, holdings: [{ balance: "12" }] });
  });
  it.each([null, {}, { error: "not found" }, { items: null }])("does not interpret invalid payload %j as an empty wallet", payload => {
    expect(parseExplorerHoldings(payload).complete).toBe(false);
  });
  it("retains valid later entries after a malformed token", () => {
    expect(parseExplorerHoldings(page([{ bad: true }, entry()]))).toMatchObject({ complete: false, holdings: [{ symbol: "TOKEN1" }] });
  });
  it("does not claim complete discovery when another page exists", () => {
    expect(parseExplorerHoldings(page([], { id: 1 })).complete).toBe(false);
  });
  it("removes stale explorer balances when RPC confirms zero", () => {
    expect(mergeWalletTokenHoldings(parseExplorerHoldings(page([entry()])).holdings, { holdings: [], zeroAddresses: [arcToken], complete: true }, walletBalanceTokens())).toEqual([]);
  });
});

describe("Arc wallet holdings loader", () => {
  const load = () => getWalletHoldings(wallet, { address: wallet, createdAt: 1, username: "ArcUser", tokens: [{ address: arcToken, symbol: "TOKEN1" }] });
  beforeEach(() => {
    mocks.native.mockResolvedValue({ balanceWei: "10500000000000000000" });
    mocks.tokens.mockResolvedValue({ tokens: [{ name: "Arc Token", symbol: "TOKEN1", address: arcToken, balance: "12" }], partial: false });
  });
  it("uses native USDC and verified Arc token holdings", async () => {
    expect(await load()).toMatchObject({ available: true, username: "ArcUser", holdings: [{ symbol: "USDC", balance: "10.5", usdValue: 10.5 }, { symbol: "TOKEN1", balance: "12" }] });
    expect(mocks.tokens).toHaveBeenCalledWith(wallet, [arcToken]);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpcFetch).not.toHaveBeenCalled();
  });
  it("preserves partial balances without claiming complete discovery", async () => {
    mocks.tokens.mockResolvedValue({ tokens: [], partial: true });
    expect(await load()).toMatchObject({ available: false, holdings: [{ symbol: "USDC" }] });
  });
  it("does not turn failed RPC reads into zero balances", async () => {
    mocks.native.mockRejectedValue(Error("RPC unavailable"));
    mocks.tokens.mockRejectedValue(Error("RPC unavailable"));
    expect(await load()).toMatchObject({ available: false, holdings: [] });
  });
  it("shows a confirmed zero native balance", async () => {
    mocks.native.mockResolvedValue({ balanceWei: "0" });
    mocks.tokens.mockResolvedValue({ tokens: [], partial: false });
    expect(await load()).toMatchObject({ available: true, holdings: [{ symbol: "USDC", balance: "0" }] });
  });
});
