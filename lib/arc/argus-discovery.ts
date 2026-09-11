import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { ARC_USDC } from "./config";
import type { ArcRpc } from "./rpc";
import { poolId, type V4Pool } from "./routing";

export const ARGUS_PORTALS = [
  {address:"0xa5628a11c412596e1f63b75a2c0284f843c549d6",words:11},
  {address:"0x07a688a001f416cc433c68ff56aa26bc5131cc6e",words:10},
  {address:"0xa36c443a797771df82533b8b4a86f0affd970862",words:10},
  {address:"0x7a17ab0106c46c0be30623f3eb7f299cc0058338",words:9},
] as const;
const manager="0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const discoveryAbi=parseAbi([
 "function LAUNCH_STRUCT_WORDS() view returns(uint8)",
 "function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256,int24)",
 "function poolId() view returns(bytes32)","function token() view returns(address)",
 "function portal() view returns(address)","function splitter() view returns(address)",
 "function poolManager() view returns(address)","function quoteAsset() view returns(address)",
 "function poolFee() view returns(uint24)","function tickSpacing() view returns(int24)",
]);
export const quotedLaunchAbi=parseAbi(["function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256,int24,address)"]);
const oldAbi=parseAbi(["function launches(address) view returns(address,int24,bool,address,address,address,uint16,uint16,uint256)"]);
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
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
  const locker=record[3],hook=record[4],splitter=record[5];
  for(const address of [hook,locker,splitter]){const code=await rpc.code(address,block);if(address===zeroAddress||!code||code==='0x')throw new Error('Argus token contract code missing.');}
  const [hookToken,hookPortal,hookSplitter,hookManager,quote,fee,spacing,id]=await Promise.all(['token','portal','splitter','poolManager','quoteAsset','poolFee','tickSpacing','poolId'].map(name=>read(hook,name as Parameters<typeof read>[1])));
  if(!same(String(hookToken),token)||!same(String(hookPortal),portal.address)||!same(String(hookSplitter),splitter)||!same(String(hookManager),manager))throw new Error('Argus hook identity mismatch.');
  if(portal.words===11&&(typeof record[10]!=="string"||!same(record[10],String(quote))))throw new Error('Argus launch quote asset mismatch.');
  // USDC may be the native or ERC-20 pool currency; never assume its representation.
  if(typeof quote!=='string'||(!same(quote,ARC_USDC)&&quote!==zeroAddress)||fee!==10000||spacing!==200)throw new Error('Unsupported Argus pool configuration.');
  const [currency0,currency1]=[quote as Address,token].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  const pool:V4Pool={protocol:'v4',currency0,currency1,fee:10000,tickSpacing:200,hooks:hook};
  if(poolId(pool)!==id)throw new Error('Argus pool ID mismatch.');
  return {pool,portal:portal.address,hook,splitter,locker,poolId:id,block};
 }
 return null;
}
