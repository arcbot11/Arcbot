import { expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, parseAbi, parseUnits, toHex, type Hex } from "viem";
import { launchQuote } from "../lib/launches/quote";
import { encodeLaunch } from "../lib/launches/prepare";
import { parseLaunchInput } from "../lib/launches/input";
import { portalAbi } from "../lib/launches/contracts";
import { LAUNCH_PAIRS } from "../lib/launches/x-pair";
import { nativeSpend } from "../lib/otc/native-spend";
const abi=parseAbi(["function getPool(address,address,uint24) view returns(address)","function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)","function liquidity() view returns(uint128)"]);
it.each(["ARGUS","ARCASH"] as const)("converts dollar valuations and developer buy into %s raw units",async pair=>{
  const rpc={decimals:vi.fn(async()=>18),code:vi.fn(),call:vi.fn(async(tx:{data:Hex})=>{
    const fn=decodeFunctionData({abi,data:tx.data}).functionName;
    if(fn==="getPool")return encodeFunctionResult({abi,functionName:fn,result:"0x1111111111111111111111111111111111111111"});
    if(fn==="liquidity")return encodeFunctionResult({abi,functionName:fn,result:100n});
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
  const rpc={call:vi.fn(),code:vi.fn(),decimals:vi.fn()};
  expect(await launchQuote("USDC",1_000_000n,rpc,50n)).toMatchObject({devBuy:"1000000",decimals:6});
  expect(rpc.call).not.toHaveBeenCalled();
});
it("refuses a changed paired token decimal scale",async()=>{
  await expect(launchQuote("ARCASH",1n,{call:vi.fn(),code:vi.fn(),decimals:async()=>6},1n)).rejects.toThrow("decimals changed");
});
