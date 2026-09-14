import type { ArcConfig } from './config';

export type ArcRpcRole = 'quote' | 'execution' | 'broadcast' | 'receipt';
export function rpcRole(method:string,traceFallback:boolean):ArcRpcRole {
  if(method==='eth_sendRawTransaction')return 'broadcast';
  if(['eth_getTransactionReceipt','eth_getTransactionByHash','debug_traceTransaction'].includes(method))return 'receipt';
  return traceFallback?'quote':'execution';
}
export function roleEndpoints(config:ArcConfig,role:ArcRpcRole,method:string):string[]{
  if(role==='quote'&&config.quoteRpcUrls?.length)return [...new Set([...config.quoteRpcUrls,config.rpcUrl,...config.rpcFallbackUrls,...config.readOnlyRpcUrls])];
  const fallback=role==='broadcast'?config.rpcFallbackUrls:method==='eth_call'
    ? [...config.readOnlyRpcUrls,...config.rpcFallbackUrls]:[...config.rpcFallbackUrls,...config.readOnlyRpcUrls];
  return [...new Set([config.rpcUrl,...fallback])];
}
