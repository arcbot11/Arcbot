import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({balance:vi.fn(),decimals:vi.fn(),block:vi.fn(),fetch:vi.fn()}));
vi.mock("../lib/arc/wallet-balance",()=>({arcDisplayConfig:()=>({})}));
vi.mock("../lib/arc/transport",()=>({arcTransport:()=>()=>({})}));
vi.mock("../lib/arc/rpc",()=>({createArcRpc:()=>({code:async()=>"0x",tokenBalance:m.balance,decimals:m.decimals,block:m.block}),checkArcRpc:async()=>({number:100n,hash:"canonical"})}));
vi.mock("../lib/arc/token-value",()=>({tokenUsdEstimate:async()=>({usdValue:24.69,pricedAt:null})}));
import { arcTokenBalances, arcSelectedTokenBalance } from "../lib/arc/wallet-tokens";
const token="0xece5ca8bf9220718e5727754026757512212cb3c";
let counter=1;
const owner=()=>`0x${(counter++).toString(16).padStart(40,"0")}`;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",m.fetch);m.fetch.mockResolvedValue({ok:true,json:async()=>({items:[{address:token,symbol:"ARGUS",name:"Argus",balance:"999"}]})});m.balance.mockResolvedValue(12345n);m.decimals.mockResolvedValue(3);m.block.mockResolvedValue({hash:"canonical"});});
afterEach(()=>vi.unstubAllGlobals());
describe("Arc token balance display",()=>{
  it("reads a selected contract directly without relying on explorer discovery",async()=>{
    m.balance.mockResolvedValue(123456789012345678901234567n);m.decimals.mockResolvedValue(18);
    const result=await arcSelectedTokenBalance(owner(),token);
    expect(result).toMatchObject({balance:"123456789.012345678901234567",raw:"123456789012345678901234567",decimals:18});
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("returns a verified zero for a selected token and rejects failed reads",async()=>{
    m.balance.mockResolvedValue(0n);expect(await arcSelectedTokenBalance(owner(),token)).toMatchObject({balance:"0",raw:"0"});
    m.balance.mockRejectedValue(Error("RPC unavailable"));await expect(arcSelectedTokenBalance(owner(),token)).rejects.toThrow("RPC unavailable");
  });
  it("rejects a selected balance if its block changed",async()=>{
    m.block.mockResolvedValue({hash:"changed"});await expect(arcSelectedTokenBalance(owner(),token)).rejects.toThrow("block changed");
  });
  it("uses RPC balances instead of stale explorer amounts and coalesces refreshes",async()=>{
    const address=owner();const [a,b]=await Promise.all([arcTokenBalances(address),arcTokenBalances(address)]);
    expect(a.tokens[0]).toMatchObject({symbol:"ARGUS",balance:"12.345",usdValue:24.69});expect(a.partial).toBe(false);expect(a).toEqual(b);expect(m.fetch).toHaveBeenCalledTimes(1);
  });
  it("includes a traded token before the explorer indexes the transfer",async()=>{
    m.fetch.mockResolvedValue({ok:true,json:async()=>({items:[]})});const result=await arcTokenBalances(owner(),[token]);expect(result.tokens[0].symbol).toBe("ARGUS");
  });
  it("does not duplicate native USDC or list imitation USDC",async()=>{
    m.fetch.mockResolvedValue({ok:true,json:async()=>({items:[{address:"0x3600000000000000000000000000000000000000",symbol:"USDC"},{address:token,symbol:"USDC"}]})});
    expect((await arcTokenBalances(owner())).tokens).toEqual([]);expect(m.balance).toHaveBeenCalledTimes(1);
  });
  it("reports failed token reads as incomplete instead of claiming zero balances",async()=>{
    m.balance.mockRejectedValue(Error("RPC unavailable"));expect(await arcTokenBalances(owner())).toMatchObject({partial:true,tokens:[]});
  });
  it("rejects balances from a changed block",async()=>{
    m.block.mockResolvedValue({hash:"changed"});await expect(arcTokenBalances(owner())).rejects.toThrow("block changed");
  });
});
