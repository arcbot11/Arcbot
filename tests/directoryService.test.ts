import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({registry:vi.fn(),cap:vi.fn(),fetch:vi.fn()}));
vi.mock("../lib/launches/registry-pages",()=>({launchRegistryRows:mocks.registry}));
vi.mock("../lib/launches/directory-market",()=>({directoryMarketCap:mocks.cap}));
import { loadLaunchDirectory } from "../lib/launches/directory-service";
import { ARGOS_TOKEN } from "../lib/launches/token-directory";
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("fetch",mocks.fetch);mocks.registry.mockResolvedValue([]);mocks.cap.mockResolvedValue(12345);});
it("loads individual token stats without requesting the full feed or RPC",async()=>{
  mocks.fetch.mockResolvedValue({ok:true,json:async()=>({address:ARGOS_TOKEN,marketCap:60000,volume24h:2000,holders:149})});
  const data=await loadLaunchDirectory();
  expect(mocks.fetch).toHaveBeenCalledWith(`https://arguspad.io/api/tokens/${ARGOS_TOKEN}`,expect.objectContaining({cache:"no-store"}));
  expect(data.tokens[0]).toMatchObject({marketCap:60000,volume24h:2000,holders:149});expect(data.marketAvailable).toBe(true);expect(mocks.cap).not.toHaveBeenCalled();
});
it("uses RPC market cap on indexer failure without inventing historical stats",async()=>{
  mocks.fetch.mockRejectedValue(Error("timeout"));const data=await loadLaunchDirectory();
  expect(data.tokens[0]).toMatchObject({marketCap:12345,volume24h:null,holders:null,change24h:null});expect(data.marketAvailable).toBe(true);
});
it("rejects a different token's stats",async()=>{
  mocks.fetch.mockResolvedValue({ok:true,json:async()=>({address:"0x"+"1".repeat(40),marketCap:999999,holders:400})});
  expect((await loadLaunchDirectory()).tokens[0]).toMatchObject({marketCap:12345,holders:null});
});
it("reports unavailable when both sources fail",async()=>{
  mocks.fetch.mockRejectedValue(Error());mocks.cap.mockRejectedValue(Error());const data=await loadLaunchDirectory();expect(data.marketAvailable).toBe(false);expect(data.tokens[0].marketCap).toBeNull();
});
