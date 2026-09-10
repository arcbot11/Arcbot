import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeWalletTokenHoldings, parseExplorerHoldings, walletBalanceTokens } from "../lib/wallet-holdings";
const arcToken = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({ readContract: vi.fn(), rpcFetch: vi.fn(), query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = mocks.query; } }));
vi.mock("@/convex/_generated/api", () => ({ api: { site: { getWallet: "wallet" } } }));
vi.mock("../lib/public-display-cache", () => ({ readPublicMarketStates: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/token-market-cap", () => ({ tokenUnitPriceUsd: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/wallet-signer/pricing", () => ({ ethUsdPrice: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rpc-http", () => ({ reliableHttp: vi.fn(), retryingRpcFetch: mocks.rpcFetch }));
vi.mock("viem", async importOriginal => ({ ...await importOriginal<typeof import("viem")>(), createPublicClient: () => ({ readContract: mocks.readContract }) }));
import { getWalletHoldings } from "../lib/site-data";

const wallet = "0x94613D7B572d03B280cdab84318c778B320acD77";
const usdg = "0x3333333333333333333333333333333333333333";
const other = `0x${"1".repeat(40)}`;
const rawBalance = "6235726516564749138350510";
const entry = (address = arcToken, value = rawBalance, decimals = "18") => ({ value, token: { address_hash: address, name: "Arc Bot", symbol: "TOKEN1", decimals, type: "ERC-20" } });
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
    if (functionName === "name") return "Arc Bot";
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

describe("actual wallet page loader, mocked providers only", () => {
  const load = () => getWalletHoldings(wallet, { address: wallet, createdAt: 1, username: "MEADGod", tokens: [{address: arcToken, symbol: "TOKEN1", isArcBotLaunch: true}, {address: usdg, symbol: "TOKEN2"}] });
  it("shows MEADGod's TOKEN1 from explicitly supplied wallet token entries", async () => {
    const result = await load();
    expect(result).toMatchObject({ available: true, username: "MEADGod", holdings: [{ address: arcToken, symbol: "TOKEN1", isArcBotLaunch: true }] });
    expect(mocks.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: arcToken, functionName: "balanceOf", args: [wallet] }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("https://legacy-explorer.invalid/api/v2/addresses/"), expect.anything());
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("caldera.xyz"), expect.anything());
  });
  it("shows TOKEN1 through RPC when the explorer returns 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    const result = await load();
    expect(result.available).toBe(true); expect(result.holdings[0].symbol).toBe("TOKEN1");
  });
  it.each(["empty", "unavailable", "stale"])("shows tracked token from liquidity returns when explorer is %s", async explorer => {
    mocks.readContract.mockImplementation(async ({ address, functionName }) => {
      if (functionName === "balanceOf") return address === usdg ? 37017891n : 0n;
      if (functionName === "decimals") return 6;
      if (functionName === "symbol") return "TOKEN2";
      if (functionName === "name") return "Second Token";
      throw new Error("Unexpected RPC read");
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (explorer === "unavailable") return new Response("unavailable", { status: 503 });
      if (url.includes("/tokens?")) return Response.json(page(explorer === "stale" ? [entry(usdg, "1000000", "6")] : []));
      return Response.json({ coin_balance: "0", assets: [] });
    }));
    const result = await load();
    expect(result.available).toBe(true);
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0]).toMatchObject({ address: usdg, symbol: "TOKEN2", name: "Second Token", balance: "37.017891" });
    expect(mocks.readContract.mock.calls.filter(([call]) => call.address === usdg && call.functionName === "balanceOf")).toHaveLength(1);
  });
  it("shows externally received untracked tokens when RPC fails", async () => {
    mocks.readContract.mockRejectedValue(new Error("RPC timeout"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/tokens?") ? Response.json(page([entry(other)])) : Response.json({ coin_balance: "0", assets: [] })));
    const result = await load();
    expect(result.available).toBe(true); expect(result.holdings[0].address).toBe(other);
  });
  it.each([404, 503])("does not show No holdings yet for explorer HTTP %s and zero ETH", async status => {
    mocks.readContract.mockResolvedValue(0n);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status })));
    expect(await load()).toMatchObject({ available: false, holdings: [] });
    expect(mocks.readContract).toHaveBeenCalledTimes(2); // TOKEN1 + TOKEN2; no metadata reads for zero balances.
  });
  it("does not show an empty wallet after the token RPC fails", async () => {
    mocks.readContract.mockRejectedValue(new Error("RPC timeout"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/tokens?") ? Response.json(page([])) : Response.json({ coin_balance: "0", assets: [] })));
    expect(await load()).toMatchObject({ available: false, holdings: [] });
  });
  it("allows the empty state only after successful discovery and zero balances", async () => {
    mocks.readContract.mockResolvedValue(0n);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/tokens?") ? Response.json(page([])) : Response.json({ coin_balance: "0", assets: [] })));
    expect(await load()).toMatchObject({ available: true, holdings: [] });
  });
});
