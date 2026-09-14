import {decodeFunctionResult,encodeFunctionData,getAddress,keccak256,parseAbi,zeroAddress,type Address} from "viem";
import type {ArcRpc} from "./rpc";

// Reviewed legacy Argus implementation. Its transfer surcharge is paid by the
// sender in addition to the requested transfer; currentTaxes can only decrease.
const LEGACY_IMPLEMENTATION_HASH="0x46b01b3c45ac40c07d1104fb0f0a87f4cddda4eba4de5bff1ca3a03a3c2932f2";
// ARCASH's implementation has identical executable bytecode to the reviewed
// legacy implementation; only its Solidity metadata trailer differs. Pin the
// complete hash rather than accepting arbitrary code with matching tax getters.
const ARCASH_IMPLEMENTATION_HASH="0x7ee51ac03f824643a98fe84cdc4816553a4f98f75ba619a5dd4f0bff7240cccf";
const legacyImplementations=new Set([LEGACY_IMPLEMENTATION_HASH,ARCASH_IMPLEMENTATION_HASH]);
const abi=parseAbi(["function currentTaxes() view returns(uint16,uint16)","function isExempt(address) view returns(bool)"]);
export function tokenDebit(amount:bigint,bps:number){return amount+amount*BigInt(bps)/10000n;}
export function maximumSell(budget:bigint,bps:number){
  if(budget<0n||!Number.isInteger(bps)||bps<0||bps>10000)throw new Error("Invalid token tax or balance.");
  let amount=budget*10000n/BigInt(10000+bps);
  if(tokenDebit(amount+1n,bps)<=budget)amount++;
  return amount;
}
async function legacyTransferTax(rpc:ArcRpc,token:Address,owner:Address,block:bigint,recipient?:Address,buy=false){
  if(token===zeroAddress||token.toLowerCase()==="0x3600000000000000000000000000000000000000")return 0;
  const code=await rpc.code(token,block);
  const clone=/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code??"");
  const implementation=clone?await rpc.code(getAddress(`0x${clone[1]}`),block):code;
  if(!implementation||!legacyImplementations.has(keccak256(implementation)))return 0;
  const read=async(functionName:"currentTaxes"|"isExempt",args:readonly Address[]=[])=>decodeFunctionResult({abi,functionName,data:await rpc.call({from:owner,to:token,value:0n,data:encodeFunctionData({abi,functionName,args} as never)},block)});
  const [rates,exempt,toExempt]=await Promise.all([read("currentTaxes"),read("isExempt",[owner]),recipient?read("isExempt",[recipient]):false]);
  if(exempt||toExempt)return 0;
  const bps=(rates as readonly [number,number])[buy?0:1];
  if(!Number.isInteger(bps)||bps<0||bps>10000)throw new Error("Invalid on-chain token tax.");
  return bps;
}
export const inputTransferTax=(rpc:ArcRpc,token:Address,owner:Address,block:bigint,recipient?:Address)=>legacyTransferTax(rpc,token,owner,block,recipient);
/** V3 pool output for the reviewed legacy token deducts the buy tax from delivery. */
export const outputTransferTax=(rpc:ArcRpc,token:Address,pool:Address,recipient:Address,block:bigint)=>legacyTransferTax(rpc,token,pool,block,recipient,true);
