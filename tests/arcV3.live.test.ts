import { expect, it } from "vitest";
import { keccak256, zeroAddress } from "viem";
import { chainClient } from "../lib/otc/runtime";
import { previewArcTrade } from "../lib/arc/trading";
import { ARC_ROUTER, ARC_ROUTER_CODE_HASH, encodeArcSwap } from "../lib/arc/routing";
import { V3_FACTORY, quoteAbi } from "../lib/arc/quotes";
import { ARC_USDC } from "../lib/arc/config";

const wallet="0x96145386E08123F311EBe5c3548EBe706f0d85Dc" as const;
const argus="0xece5ca8bf9220718e5727754026757512212cb3c" as const;
it.skipIf(process.env.ARC_RPC_LIVE!=="1")("simulates deployed V3 encoding at the verified approval block without signing",async()=>{
  const client=chainClient(5042),blockNumber=20161748n;
  const block=await client.getBlock({blockNumber});
  const code=await client.getCode({address:ARC_ROUTER,blockNumber});
  expect(code&&keccak256(code)).toBe(ARC_ROUTER_CODE_HASH);
  const address=await client.readContract({address:V3_FACTORY,abi:quoteAbi,functionName:"getPool",args:[ARC_USDC,argus,10000],blockNumber});
  expect(address).not.toBe(zeroAddress);
  const call=encodeArcSwap({tokenIn:ARC_USDC,tokenOut:argus,pools:[{protocol:"v3",address,currency0:ARC_USDC,currency1:argus,fee:10000}]},10000000n,9500n*10n**18n,block.timestamp+120n);
  await expect(client.call({account:wallet,...call,blockNumber})).resolves.toBeDefined();
},90000);

it.skipIf(process.env.ARC_RPC_LIVE!=="1")("prepares a current ARGUS trade without signing and reports RPC work",async()=>{
  const original=globalThis.fetch,started=Date.now();let calls=0;
  globalThis.fetch=async(input,init)=>{calls++;return original(input,init);};
  try{
    const result=await previewArcTrade(wallet,{tokenIn:"native",tokenOut:argus,amount:"10",slippageBps:100});
    expect(Number(result.minimumOut)).toBeGreaterThan(0);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    console.log("ARGUS read-only preview",{elapsedMs:Date.now()-started,rpcRequests:calls,stage:result.stage,protocol:result.protocol});
  }finally{globalThis.fetch=original;}
},90000);
