import { beforeEach, expect, it, vi } from "vitest";
const discovery=vi.hoisted(()=>vi.fn());
vi.mock("../lib/arc/argus-discovery",()=>({discoverArgusPool:discovery}));
beforeEach(()=>discovery.mockReset().mockResolvedValue(null));
import { decodeFunctionData, encodeFunctionResult, parseAbi, parseUnits, toHex, type Hex } from "viem";
import { launchQuote } from "../lib/launches/quote";
import { encodeLaunch } from "../lib/launches/prepare";
import { parseLaunchInput } from "../lib/launches/input";
import { portalAbi } from "../lib/launches/contracts";
import { LAUNCH_PAIRS } from "../lib/launches/x-pair";
import { nativeSpend } from "../lib/otc/native-spend";
const historicalBlock=vi.fn(async(number=100n)=>({number,hash:toHex(number,{size:32}),timestamp:number*60n}));
const abi=parseAbi(["function getPool(address,address,uint24) view returns(address)","function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)","function liquidity() view returns(uint128)"]);
it.each(["ARGUS","ARCASH"] as const)("converts dollar valuations and developer buy into %s raw units",async pair=>{
  const rpc={block:historicalBlock,decimals:vi.fn(async()=>18),code:vi.fn(),call:vi.fn(async(tx:{data:Hex})=>{
    const fn=decodeFunctionData({abi,data:tx.data}).functionName;
    if(fn==="getPool")return encodeFunctionResult({abi,functionName:fn,result:"0x1111111111111111111111111111111111111111"});
    if(fn==="liquidity")return encodeFunctionResult({abi,functionName:fn,result:10_000_000_000n});
    // Exactly one atomic unit per other atomic unit, to test 6 vs 18 conversion without floating point.
    return encodeFunctionResult({abi,functionName:"slot0",result:[1n<<96n,0,0,0,0,0,true]});
  })};
  const quote=await launchQuote(pair,25_000_000n,rpc,100n);
  expect(quote).toMatchObject({address:LAUNCH_PAIRS[pair].address,decimals:18,start:"2500000000",bond:"45000000000",devBuy:"25000000",block:"100"});
  const input=parseLaunchInput({name:"Example",symbol:"EX",imageURI:"https://pbs.twimg.com/media/example.jpg",pairToken:pair,devBuyUSDC:"25"});
  const data=encodeLaunch(input,toHex(1,{size:32}),toHex(2,{size:32}),quote);
  const decoded=decodeFunctionData({abi:portalAbi,data});
  if(decoded.functionName!=="launch")throw Error();
  expect(decoded.args[0].quoteAsset.toLowerCase()).toBe(LAUNCH_PAIRS[pair].address);expect(decoded.args[0].devBuyQuote).toBe(25_000_000n);
  expect(nativeSpend(5042,{to:"0xA5628A11c412596E1f63b75a2C0284F843C549d6",data,value:0n})).toBe(0n);
});
it("reserves ERC-20 USDC pulled by the launch in addition to native gas",()=>{
  const input=parseLaunchInput({name:"Example",symbol:"EX",imageURI:"https://pbs.twimg.com/media/example.jpg",devBuyUSDC:"25"});
  const data=encodeLaunch(input,toHex(1,{size:32}),toHex(2,{size:32}));
  expect(nativeSpend(5042,{to:"0xA5628A11c412596E1f63b75a2C0284F843C549d6",data,value:0n})).toBe(parseUnits("25",18));
  expect(nativeSpend(8453,{to:"0xA5628A11c412596E1f63b75a2C0284F843C549d6",data,value:0n})).toBe(0n);
});
it("USDC needs no external price or duplicate token-balance lookup",async()=>{
  const rpc={block:historicalBlock,call:vi.fn(),code:vi.fn(),decimals:vi.fn()};
  expect(await launchQuote("USDC",1_000_000n,rpc,50n)).toMatchObject({devBuy:"1000000",decimals:6});
  expect(rpc.call).not.toHaveBeenCalled();
});
it("refuses a changed paired token decimal scale",async()=>{
  await expect(launchQuote("ARCASH",1n,{block:historicalBlock,call:vi.fn(),code:vi.fn(),decimals:async()=>6},1n)).rejects.toThrow("decimals changed");
});
it.each(["dust", "conflict", "empty"])("checks V4 even with a V3 pool: %s",async mode=>{
  const v4abi=parseAbi(["function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)","function getLiquidity(bytes32) view returns(uint128)"]);
  const combined=[...abi,...v4abi];
  discovery.mockResolvedValue({pool:{currency0:LAUNCH_PAIRS.ARGUS.address,currency1:LAUNCH_PAIRS.USDC.address},poolId:toHex(1,{size:32})});
  const rpc={block:historicalBlock,decimals:async()=>18,code:vi.fn(),call:vi.fn(async(tx:{data:Hex})=>{
    const fn=decodeFunctionData({abi:combined,data:tx.data}).functionName;
    if(fn==="getPool")return encodeFunctionResult({abi,functionName:fn,result:"0x1111111111111111111111111111111111111111"});
    if(fn==="liquidity")return encodeFunctionResult({abi,functionName:fn,result:mode==="conflict"?10_000_000_000n:1n});
    if(fn==="slot0")return encodeFunctionResult({abi,functionName:fn,result:[1n<<96n,0,0,0,0,0,true]});
    if(fn==="getLiquidity")return encodeFunctionResult({abi:v4abi,functionName:fn,result:mode==="empty"?1n:10_000_000_000n});
    return encodeFunctionResult({abi:v4abi,functionName:"getSlot0",result:[2n<<96n,0,0,0]});
  })};
  if(mode==="conflict")await expect(launchQuote("ARGUS",25_000_000n,rpc,100n)).rejects.toThrow("disagree");
  else if(mode==="empty")await expect(launchQuote("ARGUS",25_000_000n,rpc,100n)).rejects.toThrow("sufficiently liquid");
  else {
    const quote=await launchQuote("ARGUS",25_000_000n,rpc,100n);
    const expected=BigInt(LAUNCH_PAIRS.ARGUS.address)<BigInt(LAUNCH_PAIRS.USDC.address)?6_250_000n:100_000_000n;
    expect(quote.devBuy).toBe(String(expected));
  }
  expect(discovery).toHaveBeenCalledTimes(1);
});

it.each(["stable","spike","thin-history","archive-down","reorg"])("paired quote historical guard: %s",async mode=>{
 let headReads=0;
 const rpc={decimals:async()=>18,code:vi.fn(),block:async(number=100n)=>{
   const b=await historicalBlock(number);if(number===100n&&++headReads>1&&mode==="reorg")return {...b,hash:toHex(999,{size:32})};return b;
 },call:vi.fn(async(tx:{data:Hex},at:bigint)=>{
   const fn=decodeFunctionData({abi,data:tx.data}).functionName;
   if(fn==="getPool")return encodeFunctionResult({abi,functionName:fn,result:"0x1111111111111111111111111111111111111111"});
   if(at<100n&&mode==="archive-down")throw Error("Historical state unavailable");
   if(fn==="liquidity")return encodeFunctionResult({abi,functionName:fn,result:at<100n&&mode==="thin-history"?1n:10_000_000_000n});
   const sqrt=at===100n?(1n<<96n)*(mode==="spike"?120n:102n)/100n:1n<<96n;
   return encodeFunctionResult({abi,functionName:"slot0",result:[sqrt,0,0,0,0,0,true]});
 })};
 const result=launchQuote("ARGUS",25_000_000n,rpc,100n);
 if(mode==="stable")expect((await result).devBuy).toBe("25000000");
 else await expect(result).rejects.toThrow(mode==="spike"?"changed too much":mode==="thin-history"?"sufficient liquidity":mode==="reorg"?"block changed":"Historical state unavailable");
});
