import { CdpClient } from "@coinbase/cdp-sdk";
import { formatUnits, getAddress, isAddress, parseAbi } from "viem";
import { balanceSnapshot, chainClient } from "../otc/runtime";
import { retainTokenBalances } from "../token-balance-display";
import { BASE_USDC } from "./usdc";

export type BaseTokenBalance = {address:string;symbol:string;name:string;balance:string;stale?:boolean};
export type BaseTokenSnapshot = {tokens:BaseTokenBalance[];partial:boolean;discoveryPartial:boolean;balancePartial:boolean;verifiedAddresses:string[];block:string};
export const baseTokenAbi = parseAbi(["function balanceOf(address) view returns(uint256)","function decimals() view returns(uint8)","function symbol() view returns(string)","function name() view returns(string)"]);
const excluded = new Set([BASE_USDC.toLowerCase(),"0x0000000000000000000000000000000000000000","0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]);
const cache = new Map<string,{at:number;value:BaseTokenSnapshot}>();
const pending = new Map<string,Promise<BaseTokenSnapshot>>();
export const baseTokenLabel = (value:string,fallback:string,max=64) => value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,"").trim().slice(0,max)||fallback;

async function bounded<T>(work:Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Base token discovery timed out.")),15000);})]);}
  finally{if(timer)clearTimeout(timer);}
}

/** The indexer supplies candidates only; displayed balances come from Base RPC. */
export function baseTokenBalances(address:string):Promise<BaseTokenSnapshot>{
  const owner=getAddress(address),key=owner.toLowerCase(),hit=cache.get(key);
  const active=pending.get(key);if(active)return active;
  if(hit&&Date.now()-hit.at<15000)return Promise.resolve(hit.value);
  const work=readBalances(owner,hit?.value).then(value=>{
    if(cache.size>=100&&!cache.has(key))cache.delete(cache.keys().next().value!);
    cache.set(key,{at:Date.now(),value});return value;
  }).finally(()=>pending.delete(key));
  pending.set(key,work);return work;
}

async function readBalances(owner:`0x${string}`,previous?:BaseTokenSnapshot):Promise<BaseTokenSnapshot>{
  const candidates=new Set(previous?.tokens.map(t=>t.address.toLowerCase())??[]);
  let discoveryPartial=false,pageToken:string|undefined;
  const cursors=new Set<string>(),deadline=Date.now()+30000;
  try{
    const cdp=new CdpClient();
    for(let page=0;page<10;page++){
      const result=await bounded(cdp.evm.listTokenBalances({address:owner,network:"base",pageSize:100,...(pageToken?{pageToken}:{})}));
      for(const item of result.balances){
        const token=item.token.contractAddress;
        if(item.token.network!=="base"||!isAddress(token,{strict:false})){discoveryPartial=true;continue;}
        if(!excluded.has(token.toLowerCase()))candidates.add(token.toLowerCase());
      }
      pageToken=result.nextPageToken;
      if(!pageToken)break;
      if(cursors.has(pageToken)||Date.now()>deadline||page===9){discoveryPartial=true;break;}
      cursors.add(pageToken);
    }
  }catch{discoveryPartial=true;}
  const snapshot=await balanceSnapshot(8453,owner),client=chainClient(8453),blockNumber=BigInt(snapshot.block);
  const block=await client.getBlock({blockNumber}),tokens:BaseTokenBalance[]=[],verifiedAddresses:string[]=[];
  let balancePartial=false;
  const queue=[...candidates].filter(t=>!excluded.has(t));
  if(queue.length>500){queue.length=500;discoveryPartial=true;}
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
    while(queue.length){const address=getAddress(queue.shift()!);
      try{
        const read=<F extends "balanceOf"|"decimals"|"symbol"|"name">(functionName:F)=>client.readContract({address,abi:baseTokenAbi,functionName,args:functionName==="balanceOf"?[owner]:undefined,blockNumber} as Parameters<typeof client.readContract>[0]);
        const raw=await read("balanceOf") as bigint;
        if(raw===0n){verifiedAddresses.push(address);continue;}
        const [decimals,symbol,name]=await Promise.all([read("decimals"),read("symbol").catch(()=>"Token"),read("name").catch(()=>"Base token")]);
        if(typeof decimals!=="number"||!Number.isInteger(decimals)||decimals<0||decimals>255||typeof raw!=="bigint"||raw<0n)throw Error("Invalid token metadata");
        tokens.push({address,symbol:baseTokenLabel(String(symbol),"Token"),name:baseTokenLabel(String(name),"Base token",128),balance:formatUnits(raw,decimals)});
        verifiedAddresses.push(address);
      }catch{balancePartial=true;}
    }
  }));
  if((await client.getBlock({blockNumber})).hash!==block.hash)throw Error("Base token balance block changed.");
  const partial=discoveryPartial||balancePartial;
  const merged=retainTokenBalances(previous??null,{tokens,partial,verifiedAddresses});
  return {tokens:merged.sort((a,b)=>a.symbol.localeCompare(b.symbol)),partial:partial||merged.some(t=>t.stale),discoveryPartial,balancePartial:balancePartial||merged.some(t=>t.stale),verifiedAddresses,block:snapshot.block};
}
