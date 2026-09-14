import { afterEach, expect, it, vi } from "vitest";
import { loadTokenPrice } from "../lib/load-token-price";
afterEach(()=>vi.unstubAllGlobals());
it("coalesces card prices and checks the returned contract",async()=>{
  const token="0x1111111111111111111111111111111111111111";
  const fetch=vi.fn(async()=>Response.json({token,priceUsd:0.5,pricedAt:null}));
  vi.stubGlobal("fetch",fetch);
  expect(await Promise.all([loadTokenPrice(token),loadTokenPrice(token)])).toEqual([{priceUsd:0.5,pricedAt:null},{priceUsd:0.5,pricedAt:null}]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await loadTokenPrice("0x2222222222222222222222222222222222222222")).toBeNull();
});
it("limits card price requests to four and releases the queue after failures",async()=>{
  const finish:(()=>void)[]=[];
  const fetch=vi.fn(()=>new Promise<Response>(resolve=>finish.push(()=>resolve(Response.json({priceUsd:null})))));
  vi.stubGlobal("fetch",fetch);
  const jobs=Array.from({length:6},(_,i)=>loadTokenPrice(`0x${(i+100).toString(16).padStart(40,"0")}`));
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(4));
  finish.splice(0).forEach(done=>done());
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(6));
  finish.splice(0).forEach(done=>done());
  expect(await Promise.all(jobs)).toEqual(Array(6).fill(null));
});
