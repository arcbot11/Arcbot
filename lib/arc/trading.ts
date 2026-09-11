import {discoverArcV3Pools} from "./discovery";
import {createRouteHint,readRouteHint} from "./route-hint";
import { createPublicClient, encodeFunctionData, getAddress, zeroAddress, parseAbi, keccak256, formatUnits, type Address } from "viem";
import { arcTransport } from "./transport";
import { arcConfigFromEnv, ARC_USDC } from "./config";
import { createArcRpc, checkArcRpc } from "./rpc";
import { discoverArgusPool } from "./argus-discovery";
import { V3_FACTORY, quoteAbi, quoteRoutes, type RouteQuote } from "./quotes";
import { ARC_ROUTER, ARC_ROUTER_CODE_HASH, ARC_DEAD_ADDRESS, encodeArcSwap, guardArcSwap, mixedRouteSupported, findRoutes, poolId, type ArcPool, type V3Pool, type V4Pool, type Route } from "./routing";
import {inputTransferTax,tokenDebit} from "./transfer-tax";
import { exactAmount } from "./amounts";
import { ARC_TOKEN_CATALOG } from "./token-catalog";
import { estimatedTradeGasBudget } from "./trade-flow";
import { prepareCall, type Call } from "../otc/runtime";

export const PERMIT2=getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
const allowanceAbi=parseAbi(["function allowance(address,address) view returns (uint256)","function approve(address,uint256) returns (bool)"]);
const permitAbi=parseAbi(["function allowance(address,address,address) view returns (uint160,uint48,uint48)","function approve(address,address,uint160,uint48)"]);
const discoveryCache=new Map<string,{expires:number;block:bigint;hash:string;result:Awaited<ReturnType<typeof discoverArgusPool>>}>();
const v3Candidates=new Map<string,{expires:number;address:Address}>();
const explorerCandidates=new Map<string,{expires:number;request:Promise<V3Pool[]>}>();
const routeCache=new Map<string,{expires:number;cacheExpires:number;route:Route;verifiedHookPoolIds:string[];block:bigint;hash:string}>();
export function clearTradeDiscoveryCache(){discoveryCache.clear();v3Candidates.clear();routeCache.clear();explorerCandidates.clear();}
export type TradeInput={tokenIn:string;tokenOut:string;amount:string;slippageBps:number;routeHint?:string};
const native=(a:string)=>a==="native"||a.toLowerCase()===ARC_USDC.toLowerCase()||a===zeroAddress;

/** Exact-input routes only. Candidate pool identities are verified on chain by quoteRoutes. */
async function quoteArcTrade(wallet:Address,input:TradeInput){
  const config=arcConfigFromEnv(),transport=arcTransport(config),rpc=createArcRpc(config,transport),client=createPublicClient({transport});
  const head=await checkArcRpc(rpc,config);
  const code=await rpc.code(ARC_ROUTER,head.number);
  if(!code||keccak256(code)!==ARC_ROUTER_CODE_HASH)throw new Error("Arc router code does not match the reviewed deployment.");
  if(native(input.tokenIn)&&native(input.tokenOut))throw new Error("Choose different assets.");
  const groups:RouteQuote[]=[];
  const scope=JSON.stringify([config.rpcUrl,String(config.checkpointNumber),config.checkpointHash]);
  const routeKey=scope+JSON.stringify([wallet.toLowerCase(),native(input.tokenIn)?"native":input.tokenIn.toLowerCase(),native(input.tokenOut)?"native":input.tokenOut.toLowerCase()]);
  const hintContext={wallet,tokenIn:input.tokenIn,tokenOut:input.tokenOut,scope};
  const memoryRoute=routeCache.get(routeKey);
  const cachedRoute=readRouteHint(input.routeHint,hintContext)??(memoryRoute&&memoryRoute.cacheExpires>Date.now()?memoryRoute:undefined);
  if(cachedRoute&&cachedRoute.expires>Date.now()&&cachedRoute.block<=head.number&&(await rpc.block(cachedRoute.block)).hash===cachedRoute.hash){
    // Reuse identities only. The chosen pool is revalidated and repriced for
    // this exact amount and sender, never reuse a previous execution price.
    const decimals=cachedRoute.route.tokenIn===zeroAddress?18:await rpc.decimals(cachedRoute.route.tokenIn,head.number);
    const result=await quoteRoutes([cachedRoute.route],exactAmount(input.amount,decimals),input.slippageBps,wallet,rpc,config,Date.now(),head);
    const q=result.quotes[0];
    if(q&&q.expiresAt>Date.now()){
      const first=q.route.pools[0];
      const inputTaxBps=first.protocol==="v3"?await inputTransferTax(rpc,q.route.tokenIn,wallet,head.number,first.address):0;
      return {q,rpc,client,head,verifiedHookPoolIds:cachedRoute.verifiedHookPoolIds,inputTaxBps,routeHint:createRouteHint(cachedRoute,hintContext)};
    }
    routeCache.delete(routeKey);
  }
  const discoveries:NonNullable<Awaited<ReturnType<typeof discoverArgusPool>>>[]=[];
  const tokens=[...new Set([input.tokenIn,input.tokenOut].filter(a=>!native(a)).map(a=>getAddress(a)))];
  await Promise.all(tokens.map(async token=>{
    const key=scope+token,cached=discoveryCache.get(key);
    let result:Awaited<ReturnType<typeof discoverArgusPool>>;
    if(cached&&cached.expires>Date.now()&&cached.block<=head.number&&(await rpc.block(cached.block)).hash===cached.hash)result=cached.result;
    else{
      result=await discoverArgusPool(token,rpc,head.number);
      if((await rpc.block(head.number)).hash!==head.hash)throw new Error("Discovery block changed.");
      if(discoveryCache.size>=500)discoveryCache.delete(discoveryCache.keys().next().value!);
      discoveryCache.set(key,{expires:Date.now()+(result?60000:15000),block:head.number,hash:head.hash,result});
    }
    if(result)discoveries.push(result);
  }));
  const discovered=discoveries[0];
  const verifiedHookPoolIds:string[]=discoveries.map(d=>d.poolId);
  const allPools: ArcPool[] = [];
  for(const protocol of ["v3","v4"] as const){
    const resolve=(a:string)=>native(a)?getAddress(protocol==="v3"?ARC_USDC:discovered?(discovered.pool.currency0.toLowerCase()===getAddress(native(input.tokenIn)?input.tokenOut:input.tokenIn).toLowerCase()?discovered.pool.currency1:discovered.pool.currency0):zeroAddress):getAddress(a);
    const tokenIn=resolve(input.tokenIn),tokenOut=resolve(input.tokenOut);
    const decimals=tokenIn===zeroAddress?18:await rpc.decimals(tokenIn,head.number);
    const amountIn=exactAmount(input.amount,decimals);
    const routes:Route[]=[];
    if(protocol==="v3"){
      const pairs:[[Address,Address],...[Address,Address][]]=[[tokenIn,tokenOut]];
      if(tokenIn.toLowerCase()!==ARC_USDC.toLowerCase()&&tokenOut.toLowerCase()!==ARC_USDC.toLowerCase())pairs.push([tokenIn,getAddress(ARC_USDC)],[getAddress(ARC_USDC),tokenOut]);
      const candidateKey=scope+[tokenIn,tokenOut].sort().join();
      let extra=explorerCandidates.get(candidateKey);
      if(!extra||extra.expires<Date.now()){
        if(explorerCandidates.size>=100)explorerCandidates.delete(explorerCandidates.keys().next().value!);
        extra={expires:Date.now()+60000,request:discoverArcV3Pools(tokenIn,tokenOut).then(r=>r.pools.slice(0,40)).catch(()=>[])};
        explorerCandidates.set(candidateKey,extra);
      }
      const pools:V3Pool[]=[...await extra.request];
      for(const [a,b]of pairs)await Promise.all([100,500,3000,10000].map(async fee=>{
        const key=scope+[a,b].sort().join()+fee,cached=v3Candidates.get(key);
        const address=cached&&cached.expires>Date.now()?cached.address:await client.readContract({address:V3_FACTORY,abi:quoteAbi,functionName:"getPool",args:[a,b,fee],blockNumber:head.number});
        if(v3Candidates.size>=1000)v3Candidates.delete(v3Candidates.keys().next().value!);
        if(!cached||cached.expires<=Date.now())v3Candidates.set(key,{expires:Date.now()+15000,address});
        // quoteRoutes still verifies every candidate against the factory at the fresh quote block.
        const [currency0,currency1]=[a,b].sort((x,y)=>BigInt(x)<BigInt(y)?-1:1);
        if(address!==zeroAddress)pools.push({protocol,address,currency0,currency1,fee});
      }));
      allPools.push(...pools);
      routes.push(...findRoutes(tokenIn,tokenOut,pools).slice(0,32));
    }else{
      const pools:V4Pool[]=discoveries.map(d=>d.pool);
      const pairs:Array<[Address,Address]>=[[tokenIn,tokenOut]];
      if(!native(input.tokenIn)&&!native(input.tokenOut))for(const quote of [getAddress(ARC_USDC),zeroAddress]){
        pairs.push([tokenIn,quote],[quote,tokenOut]);
      }
      for(const [a,b] of pairs){
        const [currency0,currency1]=[a,b].sort((x,y)=>BigInt(x)<BigInt(y)?-1:1);
        for(const [fee,tickSpacing] of [[100,1],[500,10],[2500,25],[3000,60],[10000,200]])
          pools.push({protocol:"v4",currency0,currency1,fee,tickSpacing,hooks:zeroAddress});
      }
      allPools.push(...pools);
      const candidates=findRoutes(tokenIn,tokenOut,pools);
      const hooks=(r:Route)=>r.pools.filter(p=>p.protocol==="v4"&&p.hooks!==zeroAddress).length;
      candidates.sort((a,b)=>hooks(b)-hooks(a)||a.pools.length-b.pools.length);
      routes.push(...candidates.slice(0,32));
    }
    if(routes.length)groups.push(...(await quoteRoutes(routes,amountIn,input.slippageBps,wallet,rpc,config,Date.now(),head)).quotes.filter(q=>!q.executionBlocker||q.route.pools.every(p=>p.protocol!=="v4"||p.hooks===zeroAddress||verifiedHookPoolIds.includes(poolId(p)))));

  }
  if (!native(input.tokenIn) && !native(input.tokenOut)) {
    const routes = findRoutes(getAddress(input.tokenIn), getAddress(input.tokenOut), allPools).filter(mixedRouteSupported)
      .filter(r => r.pools.every(p => p.protocol !== "v4" || p.hooks === zeroAddress || verifiedHookPoolIds.includes(poolId(p))))
      .sort((a,b) => b.pools.filter(p => p.protocol === "v4" && p.hooks !== zeroAddress).length - a.pools.filter(p => p.protocol === "v4" && p.hooks !== zeroAddress).length).slice(0,32);
    if (routes.length) groups.push(...(await quoteRoutes(routes, exactAmount(input.amount, await rpc.decimals(getAddress(input.tokenIn),head.number)), input.slippageBps, wallet, rpc, config,Date.now(),head)).quotes);
  }
  if(!groups.length)throw new Error("No supported liquid Arc route found.");
  // USDC has 18 native decimals and 6 ERC-20 decimals, but is the same currency.
  const normalized=(q:RouteQuote)=>q.amountOut*(q.route.tokenOut.toLowerCase()===ARC_USDC.toLowerCase()?10n**12n:1n);
  groups.sort((a,b)=>normalized(a)>normalized(b)?-1:normalized(a)<normalized(b)?1:0);
  const q=groups[0],first=q.route.pools[0];
  if(routeCache.size>=500)routeCache.delete(routeCache.keys().next().value!);
  const verifiedRoute={expires:Date.now()+5*60000,route:q.route,verifiedHookPoolIds,block:head.number,hash:head.hash};
  routeCache.set(routeKey,{...verifiedRoute,cacheExpires:Date.now()+60000});
  const inputTaxBps=first.protocol==="v3"?await inputTransferTax(rpc,q.route.tokenIn,wallet,head.number,first.address):0;
  return {q,rpc,client,head,verifiedHookPoolIds,inputTaxBps,routeHint:createRouteHint(verifiedRoute,hintContext)};

}

export async function estimateArcTrade(wallet:Address,input:TradeInput){
  const {q,rpc,client,head,inputTaxBps,routeHint}=await quoteArcTrade(wallet,input);
  const decimals=q.route.tokenOut===zeroAddress?18:await rpc.decimals(q.route.tokenOut,head.number);
  const indexed=ARC_TOKEN_CATALOG.find(token=>token.address.toLowerCase()===q.route.tokenOut.toLowerCase());
  const symbol=native(q.route.tokenOut)?"USDC":indexed?.symbol??await client.readContract({address:q.route.tokenOut,abi:parseAbi(["function symbol() view returns (string)"]),functionName:"symbol",blockNumber:head.number}).catch(()=>null);
  if(q.expiresAt<=Date.now())throw new Error("Quote expired. Try again.");
  const inDecimals=q.route.tokenIn===zeroAddress?18:await rpc.decimals(q.route.tokenIn,head.number);
  const inputSymbol=native(q.route.tokenIn)?"USDC":ARC_TOKEN_CATALOG.find(t=>t.address.toLowerCase()===q.route.tokenIn.toLowerCase())?.symbol??null;
  return {routeHint,amountIn:input.amount,inputSymbol,inputTaxBps,estimatedTokenDebit:formatUnits(tokenDebit(q.amountIn,inputTaxBps),inDecimals),inputTaxAmount:formatUnits(tokenDebit(q.amountIn,inputTaxBps)-q.amountIn,inDecimals),minimumOut:formatUnits(q.amountOutMinimum,decimals),amountOut:formatUnits(q.amountOut,decimals),outputSymbol:symbol?.trim().replace(/^\$+/,"")||null,outputAddress:q.route.tokenOut,expiresAt:q.expiresAt};
}

/** A value-denominated sell selects a token quantity from a fresh executable
 * reference quote. It is not an exact-output promise; the final swap quote
 * still applies price impact and slippage to that quantity. */
export async function arcSellAmountForUsdc(wallet:Address,token:Address,value:string,routeHint?:string){
  const config=arcConfigFromEnv(),rpc=createArcRpc(config,arcTransport(config));
  const head=await checkArcRpc(rpc,config);
  const [balance,decimals]=await Promise.all([rpc.tokenBalance(token,wallet,head.number),rpc.decimals(token,head.number)]);
  if(balance<=0n)throw new Error("Not enough tokens.");
  const sample=balance/1000n||balance;
  const {q}=await quoteArcTrade(wallet,{tokenIn:token,tokenOut:"native",amount:formatUnits(sample,decimals),slippageBps:100,routeHint});
  const quotedUsdc=q.route.tokenOut===zeroAddress?q.amountOut:q.amountOut*10n**12n;
  const target=exactAmount(value,6)*10n**12n;
  const units=target*sample/quotedUsdc;
  if(units<=0n)throw new Error("Use a larger sell amount.");
  const tax=await inputTransferTax(rpc,token,wallet,head.number);
  if(tokenDebit(units,tax)>balance)throw new Error("Not enough tokens for that USDC value.");
  return formatUnits(units,decimals);
}

export async function previewArcTrade(wallet:Address,input:TradeInput,delivery: boolean | Address=false){
  const outputRecipient=delivery===true?ARC_DEAD_ADDRESS:delivery?getAddress(delivery):undefined;
  if(outputRecipient&&BigInt(outputRecipient)<=2n)throw new Error("Use a valid recipient wallet.");
  if(outputRecipient&&(!native(input.tokenIn)||native(input.tokenOut)))throw new Error("Buy and burn requires USDC input and a different token output.");
  const {q,rpc,client,head,verifiedHookPoolIds,inputTaxBps,routeHint}=await quoteArcTrade(wallet,input);
  const token=q.route.tokenIn;
  const balance=token===zeroAddress?await rpc.balance(wallet,head.number):await rpc.tokenBalance(token,wallet,head.number);
  if(balance<tokenDebit(q.amountIn,inputTaxBps))throw new Error("Not enough tokens for the amount plus token tax. Use a smaller amount or 100%.");
  let call:Call,leg:"swap"|"allowance"="swap",stage="swap";
  const expiration=Math.floor(Date.now()/1000)+600;
  if(token!==zeroAddress){
    if(q.amountIn>=2n**160n)throw new Error("Amount exceeds Permit2 limits.");
    const [approved,[permitted,until]]=await Promise.all([
      client.readContract({address:token,abi:allowanceAbi,functionName:"allowance",args:[wallet,PERMIT2],blockNumber:head.number}),
      client.readContract({address:PERMIT2,abi:permitAbi,functionName:"allowance",args:[wallet,token,ARC_ROUTER],blockNumber:head.number}),
    ]);
    if(approved<q.amountIn){
      // Zero first for tokens that prohibit replacing a nonzero allowance.
      leg="allowance";stage=approved>0n?"reset token approval":"approve token";
      call={from:wallet,to:token,value:0n,data:encodeFunctionData({abi:allowanceAbi,functionName:"approve",args:[PERMIT2,approved>0n?0n:q.amountIn]})};
    }else if(permitted<q.amountIn||until<BigInt(Math.floor(Date.now()/1000)+60)){
      leg="allowance";stage="approve router";
      call={from:wallet,to:PERMIT2,value:0n,data:encodeFunctionData({abi:permitAbi,functionName:"approve",args:[token,ARC_ROUTER,q.amountIn,expiration]})};
    }else call={from:wallet,...encodeArcSwap(q.route,q.amountIn,q.amountOutMinimum,BigInt(Math.floor(Date.now()/1000)+120),verifiedHookPoolIds,delivery)};
  }else call={from:wallet,...encodeArcSwap(q.route,q.amountIn,q.amountOutMinimum,BigInt(Math.floor(Date.now()/1000)+120),verifiedHookPoolIds,delivery)};
  if (leg === "swap") {
    const checks: {owner: Address; token: Address; minimumBalance: bigint}[] = [];
    // Native USDC and its ERC-20 alias also pay gas; a token-only debit guard
    // cannot safely account for that shared balance. Non-USDC inputs are capped.
    if (!native(token)) checks.push({owner: wallet, token, minimumBalance: balance - tokenDebit(q.amountIn,inputTaxBps)});
    if (q.route.tokenOut !== zeroAddress && !native(q.route.tokenOut)) {
      const recipient = outputRecipient ?? wallet;
      const before = await rpc.tokenBalance(q.route.tokenOut,recipient,head.number);
      checks.push({owner: recipient, token: q.route.tokenOut, minimumBalance: before + q.amountOutMinimum});
    }
    call = {from: wallet, ...guardArcSwap(call, checks)};
    if ((await rpc.block(head.number)).hash !== head.hash) throw Error("Swap balance snapshot changed.");
  }
  const prepared=await prepareCall(5042,call);
  const tradeGasBudgetWei=estimatedTradeGasBudget(prepared.gasWei);
  const usdcInput=leg==="swap"&&token.toLowerCase()===ARC_USDC.toLowerCase()?q.amountIn*10n**12n:0n;
  const outDecimals=q.route.tokenOut===zeroAddress?18:await rpc.decimals(q.route.tokenOut,head.number);
  return {...prepared,routeHint,tradeGasBudgetWei,reserveWei:(BigInt(prepared.reserveWei)+usdcInput).toString(),leg,stage,swapOutput:leg==="swap"?{token:q.route.tokenOut,minimum:q.amountOutMinimum.toString(),...(outputRecipient?{recipient:outputRecipient}:{})}:undefined,
    amountIn:input.amount,amountOut:formatUnits(q.amountOut,outDecimals),minimumOut:formatUnits(q.amountOutMinimum,outDecimals),
    tokenIn:input.tokenIn,tokenOut:input.tokenOut,protocol:q.route.pools.every(p=>p.protocol===q.route.pools[0].protocol)?q.route.pools[0].protocol:"v3/v4",expiresAt:q.expiresAt};
}
