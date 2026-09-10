import {describe,expect,it,vi} from "vitest";
import {decodeAbiParameters,decodeFunctionData,encodeFunctionResult,parseAbiParameters,type Hex} from "viem";
import {encodeArcSwap,poolId,routerAbi,v4MultiParameters,type Route,type V4Pool} from "../lib/arc/routing";
import {quoteRoutes,quoteAbi,v4MultiQuoteAbi} from "../lib/arc/quotes";
import type {ArcRpc} from "../lib/arc/rpc";
import {arcConfig} from "../lib/arc/config";
const a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222",usd="0x3600000000000000000000000000000000000000";
const hook1="0x4444444444444444444444444444444444444444",hook2="0x5555555555555555555555555555555555555555";
const pools:V4Pool[]=[{protocol:"v4",currency0:a,currency1:usd,fee:10000,tickSpacing:200,hooks:hook1},{protocol:"v4",currency0:b,currency1:usd,fee:10000,tickSpacing:200,hooks:hook2}];
const route:Route={tokenIn:a,tokenOut:b,pools};
describe("atomic hooked V4 token-to-token swaps",()=>{
 it("encodes both hook keys and a single bounded input and output",()=>{
   const tx=encodeArcSwap(route,100n,90n,1000n,pools.map(poolId));
   const {args}=decodeFunctionData({abi:routerAbi,data:tx.data});
   expect(args[0]).toBe("0x10");expect(tx.value).toBe(0n);
   const [actions,params]=decodeAbiParameters(parseAbiParameters("bytes,bytes[]"),args[1][0]);
   expect(actions).toBe("0x070c0f");
   const [swap]=decodeAbiParameters(v4MultiParameters,params[0]);
   expect(swap.path.map(p=>p.hooks)).toEqual([hook1,hook2]);
   expect(swap.path.map(p=>p.intermediateCurrency)).toEqual([usd,b]);
   expect(swap.amountIn).toBe(100n);expect(swap.amountOutMinimum).toBe(90n);
   expect(decodeAbiParameters(parseAbiParameters("address,uint256"),params[1])).toEqual([a,100n]);
   expect(decodeAbiParameters(parseAbiParameters("address,uint256"),params[2])).toEqual([b,90n]);
 });
 it("rejects an unverified second hook",()=>{expect(()=>encodeArcSwap(route,100n,90n,1000n,[poolId(pools[0])])).toThrow("Hook");});
 it("quotes the whole path together and verifies liquidity for both pools",async()=>{
   const hash=`0x${"11".repeat(32)}` as Hex;
   const config=arcConfig({rpcUrl:"https://example.com",checkpointNumber:"1",checkpointHash:hash});
   const call=vi.fn(async({data}:{data:Hex})=>{
     try{const d=decodeFunctionData({abi:v4MultiQuoteAbi,data});expect(d.args[0].path.map(p=>p.hooks)).toEqual([hook1,hook2]);return encodeFunctionResult({abi:v4MultiQuoteAbi,functionName:"quoteExactInput",result:[200n,100000n]});}catch(e){if(!(e instanceof Error)||!e.message.includes("not found"))throw e;}
     const d=decodeFunctionData({abi:quoteAbi,data});
     return d.functionName==="getSlot0"?encodeFunctionResult({abi:quoteAbi,functionName:"getSlot0",result:[1n,0,0,10000]}):encodeFunctionResult({abi:quoteAbi,functionName:"getLiquidity",result:100n});
   });
   const rpc={chainId:async()=>5042,block:async(number=2n)=>({number,hash,timestamp:1000n}),code:async()=>"0x6000",call} as unknown as ArcRpc;
   const q=await quoteRoutes([route],100n,100,a,rpc,config,1000000);
   expect(q.quotes[0].amountOut).toBe(200n);expect(q.quotes[0].amountOutMinimum).toBe(198n);expect(call).toHaveBeenCalledTimes(5);
 });
});
