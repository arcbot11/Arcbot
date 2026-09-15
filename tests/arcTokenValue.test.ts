import {afterEach,beforeEach,expect,it,vi} from "vitest";
const paired=vi.hoisted(()=>vi.fn());
vi.mock("../lib/arc/paired-token-price",()=>({pairedTokenPrice:paired}));
import {formatTokenUsd,tokenUsdEstimate} from "../lib/arc/token-value";
beforeEach(()=>paired.mockReset().mockResolvedValue(null));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
let counter=50;
const address=()=>`0x${(++counter).toString(16).padStart(40,"0")}`;
it.each([null,"invalid","2000-01-01T00:00:00Z"])("rejects an explorer valuation with stale or unknown source time %s",async pricedAt=>{
  const token=address();vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({address:token,priceUsd:2,pricedAt})})));
  expect((await tokenUsdEstimate(token,"100")).usdValue).toBeNull();
});
it("expires a cached price by source time even before its cache TTL ends",async()=>{
  const now=Date.now(),clock=vi.spyOn(Date,"now").mockReturnValue(now),token=address();
  const fetch=vi.fn(async()=>({ok:true,json:async()=>({address:token,priceUsd:2,pricedAt:new Date(now-299_000).toISOString()})}));vi.stubGlobal("fetch",fetch);
  expect((await tokenUsdEstimate(token,"2")).usdValue).toBe(4);
  clock.mockReturnValue(now+2000);
  expect((await tokenUsdEstimate(token,"2")).usdValue).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not give a paired token a fresh USD value using an expired quote-asset price",async()=>{
  const token=address(),quote=address();
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>({address:url.endsWith(quote)?quote:token,priceUsd:2,pricedAt:"2000-01-01T00:00:00Z"})})));
  paired.mockImplementation(async(key:string)=>key===token?{quoteAddress:quote,quotePerToken:2,pricedAt:new Date().toISOString()}:null);
  expect((await tokenUsdEstimate(token,"10")).usdValue).toBeNull();
});
it("uses verified balance quantities and coalesces explorer prices",async()=>{
  const token=address(),fetch=vi.fn(async()=>({ok:true,json:async()=>({address:token,priceUsd:2,pricedAt:new Date().toISOString()})}));vi.stubGlobal("fetch",fetch);
  const [a,b]=await Promise.all([tokenUsdEstimate(token,"12.345"),tokenUsdEstimate(token,"5")]);
  expect(a.usdValue).toBe(24.69);expect(b.usdValue).toBe(10);expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([null,0,-1,"2",Infinity])("does not present invalid price %s as a valuation",async priceUsd=>{
  const token=address();vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({address:token,priceUsd})})));
  expect((await tokenUsdEstimate(token,"1")).usdValue).toBeNull();
});
it("keeps missing prices separate from zero and formats tiny holdings",()=>{
  expect(formatTokenUsd(null)).toBe("");
  expect(formatTokenUsd(0)).toBe("$0.00 USD");
  expect(formatTokenUsd(0.001)).toBe("$0.001 USD");
});
it("returns unavailable on explorer failure",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(Error("offline")));
  expect((await tokenUsdEstimate(address(),"100")).usdValue).toBeNull();
});
it("converts a paired token through its quote asset's USD price",async()=>{
  const token=address(),quote=address();
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith(quote)?{address:quote,priceUsd:0.5,pricedAt:new Date().toISOString()}:{address:token,priceUsd:null}})));
  paired.mockResolvedValue({quoteAddress:quote,quotePerToken:0.2,pricedAt:new Date().toISOString()});
  expect(await tokenUsdEstimate(token,"1000")).toMatchObject({usdValue:100});
  expect(paired).toHaveBeenCalledTimes(1);
});
it("converts nested pairs and treats only canonical USDC as one dollar",async()=>{
  const token=address(),quote=address();
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>({address:url.split('/').at(-1),priceUsd:null})})));
  paired.mockImplementation(async(key:string)=>({quoteAddress:key===token?quote:"0x3600000000000000000000000000000000000000",quotePerToken:key===token?2:3,pricedAt:new Date().toISOString()}));
  expect((await tokenUsdEstimate(token,"10")).usdValue).toBe(60);
});
it("stops cyclic paired markets without inventing a USD value",async()=>{
  const token=address(),quote=address();
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:false})));
  paired.mockImplementation(async(key:string)=>({quoteAddress:key===token?quote:token,quotePerToken:2,pricedAt:new Date().toISOString()}));
  expect((await tokenUsdEstimate(token,"10")).usdValue).toBeNull();
  expect(paired).toHaveBeenCalledTimes(2);
});
