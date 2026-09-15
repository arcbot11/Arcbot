import {expect,it,vi} from "vitest";
import {toHex} from "viem";
import {launchPriceBlocks,stableLaunchPrice} from "../lib/launches/price-history";
const block=(number=10000n)=>Promise.resolve({number,hash:toHex(number,{size:32}),timestamp:number*2n});
it("finds pinned 5, 15 and 30 minute observations without assuming block time",async()=>{
  const rpc={block:vi.fn(block)},result=await launchPriceBlocks(rpc,10000n);
  expect(result.blocks.map(b=>result.head.timestamp-b.timestamp)).toEqual([300n,900n,1800n]);
  expect(rpc.block.mock.calls.length).toBeLessThan(50);
});
it("rejects missing, sparse or inconsistent history",async()=>{
  await expect(launchPriceBlocks({block:async()=>{throw Error("archive unavailable");}},10000n)).rejects.toThrow("archive unavailable");
  await expect(launchPriceBlocks({block:async(number=100n)=>({number,hash:toHex(number,{size:32}),timestamp:number*3600n})},100n)).rejects.toThrow("too sparse");
  await expect(launchPriceBlocks({block:async()=>({number:1n,hash:toHex(1,{size:32}),timestamp:1000n})},100n)).rejects.toThrow("could not be verified");
});
it("uses the historical median and rejects a transient spot manipulation",()=>{
  expect(stableLaunchPrice(102n,[100n,101n,100n])).toBe(100n);
  expect(()=>stableLaunchPrice(120n,[100n,100n,100n])).toThrow("changed too much");
  expect(()=>stableLaunchPrice(100n,[100n,150n,100n])).toThrow("changed too much");
  expect(()=>stableLaunchPrice(100n,[])).toThrow("incomplete");
});
