import { createPublicClient, formatUnits, getAddress, isAddress, parseAbi } from "viem";
import {inputTransferTax,maximumSell} from "./transfer-tax";
import { tokenUsdEstimate } from "./token-value";
import { arcDisplayConfig } from "./wallet-balance";
import { arcTransport } from "./transport";
import { checkArcRpc, createArcRpc } from "./rpc";
import { ARC_TOKEN_CATALOG, CANONICAL_ARC_USDC, isArcUsdcSymbol } from "./token-catalog";

export type ArcTokenBalance={address:string;symbol:string;name:string;balance:string;usdValue?:number|null;pricedAt?:string|null};
type Result={tokens:ArcTokenBalance[];partial:boolean;block:string};
const cache=new Map<string,{expires:number;request:Promise<Result>}>();
const metadataAbi=parseAbi(["function symbol() view returns (string)","function name() view returns (string)"]);

export async function arcSelectedTokenBalance(ownerAddress:string,tokenAddress:string){
  const owner=getAddress(ownerAddress),token=getAddress(tokenAddress);
  const config=arcDisplayConfig(),transport=arcTransport(config),rpc=createArcRpc(config,transport);
  const head=await checkArcRpc(rpc,config);
  const [raw,decimals]=await Promise.all([rpc.tokenBalance(token,owner,head.number),rpc.decimals(token,head.number)]);
  if((await rpc.block(head.number)).hash!==head.hash)throw Error("Token balance block changed");
  const sellTaxBps=await inputTransferTax(rpc,token,owner,head.number);
  if((await rpc.block(head.number)).hash!==head.hash)throw Error("Token balance block changed");
  const maxSellRaw=maximumSell(raw,sellTaxBps).toString();
  const balance=formatUnits(raw,decimals);
  return {address:token,balance,raw:raw.toString(),decimals,maxSellRaw,sellTaxBps,...await tokenUsdEstimate(token,balance)};
}

export function arcTokenBalances(address:string,known:string[]=[],fresh=false):Promise<Result>{
  const owner=getAddress(address),key=owner+known.sort().join();
  const hit=cache.get(key);if(!fresh&&hit&&hit.expires>Date.now())return hit.request;
  const request=readBalances(owner,known).catch(error=>{cache.delete(key);throw error;});
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  cache.set(key,{expires:Date.now()+15_000,request});return request;
}
async function readBalances(owner:`0x${string}`,known:string[]):Promise<Result>{
  const candidates=new Map<string,{symbol?:string;name?:string}>();let partial=false;
  try{
    const response=await fetch(`https://www.arcexplorer.org/api/v1/addresses/${owner}/tokens`,{cache:"no-store",signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error("Token discovery unavailable");
    const data=await response.json();if(!Array.isArray(data.items))throw Error("Invalid token discovery");
    for(const item of data.items)if(typeof item.address==="string"&&isAddress(item.address))candidates.set(item.address.toLowerCase(),{symbol:typeof item.symbol==="string"?item.symbol:undefined,name:typeof item.name==="string"?item.name:undefined});
  }catch{
    partial=true;
    for(const token of ARC_TOKEN_CATALOG)candidates.set(token.address.toLowerCase(),token);
  }
  for(const address of known)if(isAddress(address)&&!candidates.has(address.toLowerCase()))candidates.set(address.toLowerCase(),ARC_TOKEN_CATALOG.find(t=>t.address.toLowerCase()===address.toLowerCase())??{});
  candidates.delete(CANONICAL_ARC_USDC);candidates.delete("0x0000000000000000000000000000000000000000");
  const config=arcDisplayConfig(),transport=arcTransport(config),rpc=createArcRpc(config,transport),client=createPublicClient({transport});
  const head=await checkArcRpc(rpc,config),tokens:ArcTokenBalance[]=[],queue=[...candidates.entries()];
  // Bound public discovery and RPC fan-out; incomplete discovery is never displayed as an empty wallet.
  if(queue.length>250){queue.length=250;partial=true;}
  await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
    while(queue.length){const [raw,metadata]=queue.shift()!;const token=getAddress(raw);
      try{
        const balance=await rpc.tokenBalance(token,owner,head.number);if(balance===0n)continue;
        const [decimals,symbol]=await Promise.all([rpc.decimals(token,head.number),metadata.symbol?Promise.resolve(metadata.symbol):client.readContract({address:token,abi:metadataAbi,functionName:"symbol",blockNumber:head.number})]);
        if(isArcUsdcSymbol(symbol))continue;
        tokens.push({address:token,symbol:symbol.trim().replace(/^\$+/,""),name:metadata.name??symbol,balance:formatUnits(balance,decimals),...await tokenUsdEstimate(token,formatUnits(balance,decimals))});
      }catch{partial=true;}
    }
  }));
  if((await rpc.block(head.number)).hash!==head.hash)throw Error("Token balance block changed");
  return {tokens:tokens.sort((a,b)=>a.symbol.localeCompare(b.symbol)),partial,block:head.number.toString()};
}
