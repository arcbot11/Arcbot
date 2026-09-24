import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import {ARC_USDC} from "./config";
import type { ArcRpc } from "./rpc";
import { poolId, type V4Pool } from "./routing";

export const ARGUS_PORTALS = [
  {address:"0xa5628a11c412596e1f63b75a2c0284f843c549d6",words:11},
  {address:"0x07a688a001f416cc433c68ff56aa26bc5131cc6e",words:10},
  {address:"0xa36c443a797771df82533b8b4a86f0affd970862",words:10},
  {address:"0x7a17ab0106c46c0be30623f3eb7f299cc0058338",words:9},
  {address:"0xb021be536808f551b31789422fd28a6c9c6e97da",words:11,registry:"0xfa4552dd491acc08051725fe522f4cfeaec8edc6"},
] as const;
const manager="0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const discoveryAbi=parseAbi([
 "function LAUNCH_STRUCT_WORDS() view returns(uint8)",
 "function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256,int24)",
 "function poolId() view returns(bytes32)","function token() view returns(address)",
 "function portal() view returns(address)","function splitter() view returns(address)",
 "function poolManager() view returns(address)","function quoteAsset() view returns(address)",
 "function poolFee() view returns(uint24)","function tickSpacing() view returns(int24)",
 "function registry() view returns(address)",
]);
export const quotedLaunchAbi=parseAbi(["function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256,int24,address)"]);
const oldAbi=parseAbi(["function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256)"]);
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
// New Argus launch family: seven fields, shared registry, dynamic V4 fee flag.
// Kept separate: its first field is the hook, not the creator used by older Portals.
export const ARGUS_DYNAMIC_PORTAL = "0xeed7559b8a6abf64427dc41cb5cc6400109c5d93" as const;
export const ARGUS_DYNAMIC_REGISTRY = "0x58398c03c7a6240d8aa1ced42592933ad857843a" as const;
export const dynamicLaunchAbi=parseAbi(["function launches(address) view returns(address hook,address splitter,address locker,uint256 positionId,int24 initialTick,int24 targetTick,uint256 flags)"]);
async function discoverDynamicArgusPool(token:Address,rpc:ArcRpc,block:bigint){
 const raw=await rpc.call({from:zeroAddress,to:ARGUS_DYNAMIC_PORTAL,data:encodeFunctionData({abi:dynamicLaunchAbi,functionName:'launches',args:[token]}),value:0n},block);
 if(raw==='0x')return null;
 if(raw.length!==2+7*64)throw Error('Unexpected dynamic Argus token record length.');
 const [hook,splitter,locker]=decodeFunctionResult({abi:dynamicLaunchAbi,functionName:'launches',data:raw});
 if(hook===zeroAddress)return null;
 const read=async(to:Address,name:typeof discoveryAbi[number]['name'])=>decodeFunctionResult({abi:discoveryAbi,functionName:name,data:await rpc.call({from:zeroAddress,to,data:encodeFunctionData({abi:discoveryAbi,functionName:name} as never),value:0n},block)});
 if(!same(String(await read(ARGUS_DYNAMIC_PORTAL,'registry')),ARGUS_DYNAMIC_REGISTRY))throw Error('Dynamic Argus registry mismatch.');
 for(const address of [ARGUS_DYNAMIC_PORTAL,ARGUS_DYNAMIC_REGISTRY,hook,splitter,locker]){
  if(address===zeroAddress||!(await rpc.code(address,block))?.replace(/^0x$/,''))throw Error('Dynamic Argus contract code missing.');
 }
 const [hookToken,hookPortal,hookSplitter,hookManager,quote,spacing,id]=await Promise.all(['token','portal','splitter','poolManager','quoteAsset','tickSpacing','poolId'].map(name=>read(hook,name as Parameters<typeof read>[1])));
 if(!same(String(hookToken),token)||!same(String(hookPortal),ARGUS_DYNAMIC_PORTAL)||!same(String(hookSplitter),splitter)||!same(String(hookManager),manager))throw Error('Dynamic Argus hook identity mismatch.');
 if(typeof quote!=='string'||same(quote,token)||spacing!==200)throw Error('Unsupported dynamic Argus pool configuration.');
 if(quote!==zeroAddress&&!same(quote,ARC_USDC)&&!(await rpc.code(quote as Address,block))?.replace(/^0x$/,''))throw Error('Dynamic Argus quote token code missing.');
 const [currency0,currency1]=[quote as Address,token].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
 const pool:V4Pool={protocol:'v4',currency0,currency1,fee:0x800000,tickSpacing:200,hooks:hook};
 if(poolId(pool)!==id)throw Error('Dynamic Argus pool ID mismatch.');
 return {pool,portal:ARGUS_DYNAMIC_PORTAL,hook,splitter,locker,poolId:id as `0x${string}`,block};
}
/** Reads deployed per-token addresses, never the Portal's mutable implementation pointers. */
export async function discoverArgusPool(token:Address,rpc:ArcRpc,block:bigint){
 const read=async(to:Address,name:typeof discoveryAbi[number]['name'])=>decodeFunctionResult({abi:discoveryAbi,functionName:name,data:await rpc.call({from:zeroAddress,to,data:encodeFunctionData({abi:discoveryAbi,functionName:name} as never),value:0n},block)});
 for(const portal of ARGUS_PORTALS){
  const raw=await rpc.call({from:zeroAddress,to:portal.address,data:encodeFunctionData({abi:discoveryAbi,functionName:'launches',args:[token]}),value:0n},block);
  if(raw==='0x')continue;
  if(raw.length!==2+portal.words*64)throw new Error('Unexpected Argus token record length.');
  const record=decodeFunctionResult({abi:portal.words===11?quotedLaunchAbi:portal.words===10?discoveryAbi:oldAbi,functionName:'launches',data:raw});
  if(record[0]===zeroAddress)continue;
  if(portal.words>=10&&await read(portal.address,'LAUNCH_STRUCT_WORDS')!==portal.words)throw new Error('Unexpected Argus Portal format.');
  if('registry' in portal&&!same(String(await read(portal.address,'registry')),portal.registry))throw new Error('Argus Portal registry mismatch.');
  const locker=record[3],hook=record[4],splitter=record[5];
  for(const address of [hook,locker,splitter]){const code=await rpc.code(address,block);if(address===zeroAddress||!code||code==='0x')throw new Error('Argus token contract code missing.');}
  const [hookToken,hookPortal,hookSplitter,hookManager,quote,fee,spacing,id]=await Promise.all(['token','portal','splitter','poolManager','quoteAsset','poolFee','tickSpacing','poolId'].map(name=>read(hook,name as Parameters<typeof read>[1])));
  if(!same(String(hookToken),token)||!same(String(hookPortal),portal.address)||!same(String(hookSplitter),splitter)||!same(String(hookManager),manager))throw new Error('Argus hook identity mismatch.');
  if(portal.words===11&&(typeof record[10]!=="string"||!same(record[10],String(quote))))throw new Error('Argus launch quote asset mismatch.');
  // The deployed launch record and hook, not a global quote-currency default,
  // determine this pool. New Portals also permit ERC-20 quoted launches.
  if(typeof quote!=='string'||same(quote,token)||fee!==10000||spacing!==200)throw new Error('Unsupported Argus pool configuration.');
  if(quote!==zeroAddress&&!same(quote,ARC_USDC)){const code=await rpc.code(quote as Address,block);if(!code||code==='0x')throw new Error('Argus quote token code missing.');}
  const [currency0,currency1]=[quote as Address,token].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  const pool:V4Pool={protocol:'v4',currency0,currency1,fee:10000,tickSpacing:200,hooks:hook};
  if(poolId(pool)!==id)throw new Error('Argus pool ID mismatch.');
  return {pool,portal:portal.address,hook,splitter,locker,poolId:id,block};
 }
 return discoverDynamicArgusPool(token,rpc,block);
}
