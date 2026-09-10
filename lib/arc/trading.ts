import { encodeFunctionData, getAddress, zeroAddress, parseAbi, keccak256, formatUnits, type Address } from "viem";
import { arcConfigFromEnv, ARC_USDC } from "./config";
import { createArcRpc, checkArcRpc } from "./rpc";
import { discoverArgusPool } from "./argus-discovery";
import { V3_FACTORY, quoteAbi, quoteRoutes, type RouteQuote } from "./quotes";
import { ARC_ROUTER, ARC_ROUTER_CODE_HASH, encodeArcSwap, findRoutes, type V3Pool, type Route } from "./routing";
import { exactAmount } from "./amounts";
import { chainClient, prepareCall, type Call } from "../otc/runtime";

export const PERMIT2=getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
const allowanceAbi=parseAbi(["function allowance(address,address) view returns (uint256)","function approve(address,uint256) returns (bool)"]);
const permitAbi=parseAbi(["function allowance(address,address,address) view returns (uint160,uint48,uint48)","function approve(address,address,uint160,uint48)"]);
export type TradeInput={tokenIn:string;tokenOut:string;amount:string;slippageBps:number};
const native=(a:string)=>a==="native"||a.toLowerCase()===ARC_USDC.toLowerCase()||a===zeroAddress;

/** Exact-input routes only. Candidate pool identities are verified on chain by quoteRoutes. */
export async function previewArcTrade(wallet:Address,input:TradeInput){
  const config=arcConfigFromEnv(),rpc=createArcRpc(config),client=chainClient(5042);
  const head=await checkArcRpc(rpc,config);
  const code=await rpc.code(ARC_ROUTER,head.number);
  if(!code||keccak256(code)!==ARC_ROUTER_CODE_HASH)throw new Error("Arc router code does not match the reviewed deployment.");
  if(native(input.tokenIn)&&native(input.tokenOut))throw new Error("Choose different assets.");
  const groups:RouteQuote[]=[];
  const discovered = native(input.tokenIn) !== native(input.tokenOut)
    ? await discoverArgusPool(getAddress(native(input.tokenIn)?input.tokenOut:input.tokenIn),rpc,head.number) : null;
  for(const protocol of ["v3","v4"] as const){
    const resolve=(a:string)=>native(a)?getAddress(protocol==="v3"?ARC_USDC:discovered?(discovered.pool.currency0.toLowerCase()===getAddress(native(input.tokenIn)?input.tokenOut:input.tokenIn).toLowerCase()?discovered.pool.currency1:discovered.pool.currency0):zeroAddress):getAddress(a);
    const tokenIn=resolve(input.tokenIn),tokenOut=resolve(input.tokenOut);
    const decimals=tokenIn===zeroAddress?18:await rpc.decimals(tokenIn,head.number);
    const amountIn=exactAmount(input.amount,decimals);
    const [currency0,currency1]=[tokenIn,tokenOut].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
    const routes:Route[]=[];
    if(protocol==="v3"){
      const pairs:[[Address,Address],...[Address,Address][]]=[[tokenIn,tokenOut]];
      if(tokenIn.toLowerCase()!==ARC_USDC.toLowerCase()&&tokenOut.toLowerCase()!==ARC_USDC.toLowerCase())pairs.push([tokenIn,getAddress(ARC_USDC)],[getAddress(ARC_USDC),tokenOut]);
      const pools:V3Pool[]=[];
      for(const [a,b]of pairs)for(const fee of [100,500,3000,10000]){
        const address=await client.readContract({address:V3_FACTORY,abi:quoteAbi,functionName:"getPool",args:[a,b,fee],blockNumber:head.number});
        const [currency0,currency1]=[a,b].sort((x,y)=>BigInt(x)<BigInt(y)?-1:1);
        if(address!==zeroAddress)pools.push({protocol,address,currency0,currency1,fee});
      }
      routes.push(...findRoutes(tokenIn,tokenOut,pools).slice(0,32));
    }else for(const [fee,tickSpacing]of [[100,1],[500,10],[2500,25],[3000,60],[10000,200]])
      routes.push({tokenIn,tokenOut,pools:[{protocol,currency0,currency1,fee,tickSpacing,hooks:zeroAddress}]});
    if(protocol==="v4"&&discovered)routes.push({tokenIn,tokenOut,pools:[discovered.pool]});
    if(routes.length)groups.push(...(await quoteRoutes(routes,amountIn,input.slippageBps,wallet,rpc,config)).quotes.filter(q=>!q.executionBlocker || (q.route.pools.length===1&&q.route.pools[0]===discovered?.pool)));
  }
  if(!groups.length)throw new Error("No supported liquid Arc route found.");
  // USDC has 18 native decimals and 6 ERC-20 decimals, but is the same currency.
  const normalized=(q:RouteQuote)=>q.amountOut*(q.route.tokenOut.toLowerCase()===ARC_USDC.toLowerCase()?10n**12n:1n);
  groups.sort((a,b)=>normalized(a)>normalized(b)?-1:normalized(a)<normalized(b)?1:0);
  const q=groups[0],token=q.route.tokenIn;
  const balance=token===zeroAddress?await rpc.balance(wallet,head.number):await rpc.tokenBalance(token,wallet,head.number);
  if(balance<q.amountIn)throw new Error("Not enough input tokens.");
  let call:Call,leg:"swap"|"allowance"="swap",stage="swap";
  const expiration=Math.floor(Date.now()/1000)+600;
  if(token!==zeroAddress){
    if(q.amountIn>=2n**160n)throw new Error("Amount exceeds Permit2 limits.");
    const approved=await client.readContract({address:token,abi:allowanceAbi,functionName:"allowance",args:[wallet,PERMIT2],blockNumber:head.number});
    const [permitted,until]=await client.readContract({address:PERMIT2,abi:permitAbi,functionName:"allowance",args:[wallet,token,ARC_ROUTER],blockNumber:head.number});
    if(approved<q.amountIn){
      // Zero first for tokens that prohibit replacing a nonzero allowance.
      leg="allowance";stage=approved>0n?"reset token approval":"approve token";
      call={from:wallet,to:token,value:0n,data:encodeFunctionData({abi:allowanceAbi,functionName:"approve",args:[PERMIT2,approved>0n?0n:q.amountIn]})};
    }else if(permitted<q.amountIn||until<BigInt(Math.floor(Date.now()/1000)+60)){
      leg="allowance";stage="approve router";
      call={from:wallet,to:PERMIT2,value:0n,data:encodeFunctionData({abi:permitAbi,functionName:"approve",args:[token,ARC_ROUTER,q.amountIn,expiration]})};
    }else call={from:wallet,...encodeArcSwap(q.route,q.amountIn,q.amountOutMinimum,BigInt(Math.floor(Date.now()/1000)+120),discovered?.poolId)};
  }else call={from:wallet,...encodeArcSwap(q.route,q.amountIn,q.amountOutMinimum,BigInt(Math.floor(Date.now()/1000)+120),discovered?.poolId)};
  const prepared=await prepareCall(5042,call);
  if(leg==="swap"&&q.route.tokenOut===zeroAddress){
    // Native output has no ERC-20 receipt event. Require transaction-local
    // balance tracing before accepting a swap whose delivery needs that proof.
    await client.request({method:"debug_traceCall",params:[{from:wallet,to:call.to,data:call.data,value:`0x${call.value.toString(16)}`},"latest",{tracer:"prestateTracer",tracerConfig:{diffMode:true}}]} as never);
  }
  const usdcInput=leg==="swap"&&token.toLowerCase()===ARC_USDC.toLowerCase()?q.amountIn*10n**12n:0n;
  const outDecimals=q.route.tokenOut===zeroAddress?18:await rpc.decimals(q.route.tokenOut,head.number);
  return {...prepared,reserveWei:(BigInt(prepared.reserveWei)+usdcInput).toString(),leg,stage,swapOutput:leg==="swap"?{token:q.route.tokenOut,minimum:q.amountOutMinimum.toString()}:undefined,
    amountIn:input.amount,amountOut:formatUnits(q.amountOut,outDecimals),minimumOut:formatUnits(q.amountOutMinimum,outDecimals),
    tokenIn:input.tokenIn,tokenOut:input.tokenOut,protocol:q.route.pools[0].protocol,expiresAt:q.expiresAt};
}
