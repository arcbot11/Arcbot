import { getAddress, zeroAddress, type Address } from "viem";
import { ARC_USDC, arcConfigFromEnv, type ArcConfig } from "./config";
import { createArcRpc, checkArcRpc, type ArcRpc, type ArcBlock } from "./rpc";
import { discoverArgusPool } from "./argus-discovery";
import { ARGUS_TOKEN_ADDRESS } from "./token-catalog";

export type QuoteAsset = { address: Address; symbol: string; decimals: number };
// Admission is by contract, not ticker or an unreviewed Portal approval. Add
// future quote assets after checking their transfer and connecting-route behavior.
export const REVIEWED_QUOTE_ASSETS: readonly QuoteAsset[] = [
  {address: ARC_USDC, symbol: "USDC", decimals: 6},
  {address: getAddress(ARGUS_TOKEN_ADDRESS), symbol: "ARGUS", decimals: 18},
];
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
  const quote=REVIEWED_QUOTE_ASSETS.find(q=>q.address.toLowerCase()===address.toLowerCase() || address===zeroAddress && q.address===ARC_USDC);
  if(!quote) throw Error("This token's quote asset is not supported yet.");
  if(await rpc.decimals(quote.address,head.number)!==quote.decimals) throw Error("Quote asset decimals changed. Try again.");
  if((await rpc.block(head.number)).hash!==head.hash) throw Error("Discovery block changed.");
  return {token,quote,paired:quote.address!==ARC_USDC,...(launch?{poolId:launch.poolId,portal:launch.portal}:{})};
}
