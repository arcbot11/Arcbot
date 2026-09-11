import {afterEach,expect,it,vi} from "vitest";
import {formatTokenUsd,tokenUsdEstimate} from "../lib/arc/token-value";
afterEach(()=>vi.unstubAllGlobals());
let counter=50;
const address=()=>`0x${(++counter).toString(16).padStart(40,"0")}`;
it("uses verified balance quantities and coalesces explorer prices",async()=>{
  const token=address(),fetch=vi.fn(async()=>({ok:true,json:async()=>({address:token,priceUsd:2,pricedAt:"2026-09-10T18:29:00.000Z"})}));vi.stubGlobal("fetch",fetch);
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
