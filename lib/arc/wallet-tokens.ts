import { createPublicClient, formatUnits, getAddress, isAddress, parseAbi } from "viem";
import {inputTransferTax,maximumSell} from "./transfer-tax";
import { tokenUsdEstimate } from "./token-value";
import { arcDisplayConfig } from "./wallet-balance";
import { arcTransport } from "./transport";
import { checkArcRpc, createArcRpc } from "./rpc";
import { ARC_TOKEN_CATALOG, CANONICAL_ARC_USDC, isArcUsdcSymbol } from "./token-catalog";
import { balanceRetryDelay, retryBalanceRead } from "./balance-retry";
import { retainTokenBalances } from "../token-balance-display";
import pinned from "./pinned-token-addresses.json";

export type ArcTokenBalance={address:string;symbol:string;name:string;balance:string;usdValue?:number|null;pricedAt?:string|null;stale?:boolean};
type Result={tokens:ArcTokenBalance[];partial:boolean;block:string;verifiedAddresses:string[]};
const cache=new Map<string,{expires:number;request:Promise<Result>}>();
const pending=new Map<string,Promise<Result>>();
const snapshots=new Map<string,Result>();
const metadataAbi=parseAbi(["function symbol() view returns (string)","function name() view returns (string)"]);

export async function arcSelectedTokenBalance(ownerAddress:string,tokenAddress:string){
  const owner=getAddress(ownerAddress),token=getAddress(tokenAddress);
  const config=arcDisplayConfig(),transport=arcTransport(config),rpc=createArcRpc(config,transport);
  const head=await checkArcRpc(rpc,config);
  const indexed=ARC_TOKEN_CATALOG.find(item=>item.address.toLowerCase()===token.toLowerCase());
  const client=createPublicClient({transport});
  const [raw,decimals,symbol]=await Promise.all([rpc.tokenBalance(token,owner,head.number),rpc.decimals(token,head.number),
    indexed?Promise.resolve(indexed.symbol):client.readContract({address:token,abi:metadataAbi,functionName:"symbol",blockNumber:head.number}).catch(()=>"tokens")]);
  if((await rpc.block(head.number)).hash!==head.hash)throw Error("Token balance block changed");
  const sellTaxBps=await inputTransferTax(rpc,token,owner,head.number);
  if((await rpc.block(head.number)).hash!==head.hash)throw Error("Token balance block changed");
  const maxSellRaw=maximumSell(raw,sellTaxBps).toString();
  const balance=formatUnits(raw,decimals);
  return {address:token,symbol:symbol.trim().replace(/^\$+/,""),balance,raw:raw.toString(),decimals,maxSellRaw,sellTaxBps,...await tokenUsdEstimate(token,balance)};
}

export function arcTokenBalances(address:string,known:string[]=[],fresh=false):Promise<Result>{
  const owner=getAddress(address),key=owner+[...new Set(known.map(a=>a.toLowerCase()))].sort().join();
  const running=pending.get(key);if(running)return running;
  const hit=cache.get(key);if(!fresh&&hit&&hit.expires>Date.now())return hit.request;
  const previous=snapshots.get(owner);
  const request=readBalances(owner,[...known,...(previous?.tokens.map(t=>t.address)??[]),...pinned]).then(result=>{
    const tokens=retainTokenBalances(previous??null,result);
    const merged={...result,tokens,partial:result.partial||tokens.some(t=>t.stale)};
    if(snapshots.size>=100&&!snapshots.has(owner))snapshots.delete(snapshots.keys().next().value!);
    snapshots.set(owner,merged);
    if(merged.partial)cache.delete(key);
    return merged;
  }).catch(error=>{
    cache.delete(key);
    if(previous)return {...previous,partial:true,verifiedAddresses:[],tokens:previous.tokens.map(t=>({...t,stale:true}))};
    throw error;
  }).finally(()=>pending.delete(key));
  pending.set(key,request);
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  cache.set(key,{expires:Date.now()+15_000,request});return request;
}
async function readBalances(owner:`0x${string}`,known:string[]):Promise<Result>{
  const candidates=new Map<string,{symbol?:string;name?:string}>();let partial=false;
  // The explorer sometimes returns an empty successful response during indexing.
  // Retry it as well as transport failures before falling back to indexed tokens.
  let discoveryComplete=false;
  for(let attempt=0;attempt<3;attempt++){
    try{
      let query="";const cursors=new Set<string>();let malformed=false;
      for(let page=0;page<20;page++){
        const response=await fetch(`https://www.arcexplorer.org/api/v1/addresses/${owner}/tokens${query}`,{cache:"no-store",signal:AbortSignal.timeout(6000)});
        if(!response.ok)throw Error("Token discovery unavailable");
        const data=await response.json();if(!Array.isArray(data.items))throw Error("Invalid token discovery");
        for(const item of data.items){
          if(typeof item?.address!=="string"||!isAddress(item.address,{strict:false})){malformed=true;continue;}
          candidates.set(item.address.toLowerCase(),{symbol:typeof item.symbol==="string"?item.symbol:undefined,name:typeof item.name==="string"?item.name:undefined});
        }
        if(!data.next_page_params){discoveryComplete=!malformed;break;}
        if(typeof data.next_page_params!=="object"||Array.isArray(data.next_page_params))throw Error("Invalid token cursor");
        const params=new URLSearchParams();
        for(const [key,value] of Object.entries(data.next_page_params)){
          if(typeof value!=="string"&&typeof value!=="number")throw Error("Invalid token cursor");
          params.set(key,String(value));
        }
        query=`?${params}`;if(cursors.has(query))throw Error("Repeated token cursor");cursors.add(query);
      }
      if(discoveryComplete&&candidates.size)break;
    }catch{discoveryComplete=false;}
    if(attempt<2)await balanceRetryDelay(attempt);
  }
  partial=!discoveryComplete;
  if(!discoveryComplete||candidates.size===0){
    for(const token of ARC_TOKEN_CATALOG)candidates.set(token.address.toLowerCase(),token);
  }
  for(const address of known)if(isAddress(address)&&!candidates.has(address.toLowerCase()))candidates.set(address.toLowerCase(),ARC_TOKEN_CATALOG.find(t=>t.address.toLowerCase()===address.toLowerCase())??{});
  candidates.delete(CANONICAL_ARC_USDC);candidates.delete("0x0000000000000000000000000000000000000000");
  const config=arcDisplayConfig(),transport=arcTransport(config),rpc=createArcRpc(config,transport),client=createPublicClient({transport});
  const head=await retryBalanceRead(()=>checkArcRpc(rpc,config)),tokens:ArcTokenBalance[]=[],verifiedAddresses:string[]=[],queue=[...candidates.entries()];
  // Limit concurrency, not the number of holdings. Retry only the failed token.
  await Promise.all(Array.from({length:Math.min(10,queue.length)},async()=>{
    while(queue.length){const [raw,metadata]=queue.shift()!;const token=getAddress(raw);
      try{
        const balance=await retryBalanceRead(()=>rpc.tokenBalance(token,owner,head.number));if(balance===0n){verifiedAddresses.push(token);continue;}
        const [decimals,symbol]=await retryBalanceRead(()=>Promise.all([rpc.decimals(token,head.number),metadata.symbol?Promise.resolve(metadata.symbol):client.readContract({address:token,abi:metadataAbi,functionName:"symbol",blockNumber:head.number})]));
        verifiedAddresses.push(token);
        if(isArcUsdcSymbol(symbol))continue;
        const value=await tokenUsdEstimate(token,formatUnits(balance,decimals)).catch(()=>({usdValue:null,pricedAt:null}));
        tokens.push({address:token,symbol:symbol.trim().replace(/^\$+/,""),name:metadata.name??symbol,balance:formatUnits(balance,decimals),...value});
      }catch{partial=true;}
    }
  }));
  if((await retryBalanceRead(()=>rpc.block(head.number))).hash!==head.hash)throw Error("Token balance block changed");
  return {tokens:tokens.sort((a,b)=>a.symbol.localeCompare(b.symbol)),partial,block:head.number.toString(),verifiedAddresses};
}
