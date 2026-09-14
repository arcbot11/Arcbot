import { decodeFunctionResult,encodeFunctionData,getAddress,parseAbi,zeroAddress,type Address } from "viem";
import { ARC_USDC, arcConfigFromEnv, type ArcConfig } from "./config";
import { createArcRpc, checkArcRpc, type ArcRpc, type ArcBlock } from "./rpc";
import { discoverArgusPool } from "./argus-discovery";
import { ARC_TOKEN_CATALOG,isArcUsdcSymbol } from "./token-catalog";

export type QuoteAsset = { address: Address; symbol: string; decimals: number };
const symbolAbi=parseAbi(['function symbol() view returns(string)']);
export type TradeMarket = {token: Address; quote: QuoteAsset; paired: boolean; poolId?: string; portal?: string};
const cache = new Map<string, {expires: number; head: ArcBlock; result: Awaited<ReturnType<typeof discoverArgusPool>>}>();
const pending = new Map<string,Promise<Awaited<ReturnType<typeof discoverArgusPool>>>>();
export function clearMarketCache() { cache.clear(); pending.clear(); }
export const marketScope = (config: ArcConfig) => JSON.stringify([config.rpcUrl, String(config.checkpointNumber), config.checkpointHash]);
export async function cachedArgusPool(token: Address, rpc: ArcRpc, head: ArcBlock, scope: string) {
  const key=scope+token.toLowerCase(), hit=cache.get(key);
  if(hit && hit.expires>Date.now() && hit.head.number<=head.number && (await rpc.block(hit.head.number)).hash===hit.head.hash) return hit.result;
  const pendingKey=key+':'+head.number+':'+head.hash;
  const existing=pending.get(pendingKey);if(existing)return existing;
  const request=(async()=>{
  const result=await discoverArgusPool(token,rpc,head.number);
  if((await rpc.block(head.number)).hash!==head.hash) throw Error("Discovery block changed.");
  if(cache.size>=500) cache.delete(cache.keys().next().value!);
  cache.set(key,{expires:Date.now()+(result?60000:15000),head,result});
  return result;
  })();
  pending.set(pendingKey,request);
  try{return await request;}finally{if(pending.get(pendingKey)===request)pending.delete(pendingKey);}
}
export async function tradeMarket(tokenAddress: string): Promise<TradeMarket> {
  const token=getAddress(tokenAddress), config=arcConfigFromEnv(),rpc=createArcRpc(config),head=await checkArcRpc(rpc,config);
  const launch=await cachedArgusPool(token,rpc,head,marketScope(config));
  const address=launch ? (launch.pool.currency0.toLowerCase()===token.toLowerCase()?launch.pool.currency1:launch.pool.currency0) : ARC_USDC;
  // Discover candidates from the verified deployed launch, never from a symbol
  // or the Portal's current defaults. Admission is not proof of executability:
  // routing, code checks, full simulation and exact delivery remain mandatory.
  const quoteAddress=address===zeroAddress?ARC_USDC:getAddress(address);
  const decimals=await rpc.decimals(quoteAddress,head.number);
  if(!Number.isInteger(decimals)||decimals<0||decimals>255||quoteAddress===ARC_USDC&&decimals!==6)throw Error('Quote asset decimals changed. Try again.');
  const indexed=ARC_TOKEN_CATALOG.find(t=>t.address.toLowerCase()===quoteAddress.toLowerCase());
  let symbol=quoteAddress===ARC_USDC?'USDC':indexed?.symbol;
  if(!symbol)try{symbol=decodeFunctionResult({abi:symbolAbi,functionName:'symbol',data:await rpc.call({from:zeroAddress,to:quoteAddress,data:encodeFunctionData({abi:symbolAbi,functionName:'symbol'}),value:0n},head.number)});}catch{/* Optional metadata must not block a contract-address trade. */}
  symbol=symbol?.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim().replace(/^\$+/,'');
  if(!symbol||symbol.length>32||/[<>\[\]{}:/\\@]/.test(symbol)||quoteAddress!==ARC_USDC&&isArcUsdcSymbol(symbol))symbol='paired token';
  const quote:QuoteAsset={address:quoteAddress,symbol,decimals};
  if((await rpc.block(head.number)).hash!==head.hash) throw Error("Discovery block changed.");
  return {token,quote,paired:quote.address!==ARC_USDC,...(launch?{poolId:launch.poolId,portal:launch.portal}:{})};
}
