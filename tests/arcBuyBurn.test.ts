import {expect,it} from "vitest";
import {decodeAbiParameters,decodeFunctionData,parseAbiParameters,zeroAddress} from "viem";
import {parseWalletCommand} from "../convex/walletCommands";
import {encodeArcSwap,ARC_DEAD_ADDRESS,routerAbi,v4SingleParameters,type Route} from "../lib/arc/routing";
it.each(["buy and send 10 USDC of ARGUS to @arctos_arc","buy and send $10 of ARGUS to @arctos_arc","buy and send 10 USDC ARGUS to @arctos_arc"])("parses buy and send to an X handle: %s",text=>{
  expect(parseWalletCommand(text)).toMatchObject({kind:"buy_and_send",amount:"10",unit:"usd",token:"ARGUS",recipient:"@arctos_arc"});
});
it.each(["v3","v4"] as const)("sends purchased %s output to an explicit wallet",protocol=>{
  const tokenIn="0x3600000000000000000000000000000000000000",tokenOut="0xece5ca8bf9220718e5727754026757512212cb3c",recipient="0x1111111111111111111111111111111111111111";
  const route:Route={tokenIn,tokenOut,pools:[protocol==="v3"?{protocol,address:tokenOut,currency0:tokenIn,currency1:tokenOut,fee:10000}:{protocol,currency0:tokenIn,currency1:tokenOut,fee:10000,tickSpacing:200,hooks:zeroAddress}]};
  const tx=encodeArcSwap(route,100n,90n,123n,undefined,recipient);
  const [,inputs]=decodeFunctionData({abi:routerAbi,data:tx.data}).args;
  if(protocol==="v3")expect(decodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"),inputs[0])[0]).toBe(recipient);
  else{
    const [,params]=decodeAbiParameters(parseAbiParameters("bytes,bytes[]"),inputs[0]);
    expect(decodeAbiParameters(parseAbiParameters("address,address,uint256"),params[2])[1]).toBe(recipient);
  }
});
it.each(["buy 10 USDC of ARGUS","buy $10 of ARGUS","buy 10 USDC ARGUS"])("accepts equivalent USDC buy notation: %s",text=>{
  expect(parseWalletCommand(text)).toMatchObject({kind:"buy",amount:"10",unit:"usd",token:"ARGUS"});
});
it.each(["buy and burn 10 USDC of ARGUS","buy and burn $10 of ARGUS"])("accepts buy and burn: %s",text=>{
  expect(parseWalletCommand(text)).toMatchObject({kind:"buy_and_burn",amount:"10",unit:"usd",token:"ARGUS"});
});
it.each(["sell $10 of ARGUS","sell 10 USDC of ARGUS"])("accepts USDC-valued sells: %s",text=>{
  expect(parseWalletCommand(text)).toMatchObject({kind:"sell",amount:"10",unit:"usd",token:"ARGUS"});
});
it.each(["v3","v4"] as const)("routes only purchased %s output to the dead address",protocol=>{
  const tokenIn="0x3600000000000000000000000000000000000000",tokenOut="0xece5ca8bf9220718e5727754026757512212cb3c";
  const route:Route={tokenIn,tokenOut,pools:[protocol==="v3"?{protocol,address:tokenOut,currency0:tokenIn,currency1:tokenOut,fee:10000}:{protocol,currency0:tokenIn,currency1:tokenOut,fee:10000,tickSpacing:200,hooks:zeroAddress}]};
  const tx=encodeArcSwap(route,100n,90n,123n,undefined,true);
  const [,inputs]=decodeFunctionData({abi:routerAbi,data:tx.data}).args;
  if(protocol==="v3"){
    const [recipient,input,minimum]=decodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"),inputs[0]);
    expect(recipient).toBe(ARC_DEAD_ADDRESS);expect(input).toBe(100n);expect(minimum).toBe(90n);
  }else{
    const [actions,params]=decodeAbiParameters(parseAbiParameters("bytes,bytes[]"),inputs[0]);
    expect(actions).toBe("0x060c0e");
    expect(decodeAbiParameters(v4SingleParameters,params[0])[0].amountOutMinimum).toBe(90n);
    expect(decodeAbiParameters(parseAbiParameters("address,address,uint256"),params[2])).toEqual([expect.stringMatching(/^0xece5/i),ARC_DEAD_ADDRESS,0n]);
  }
});
