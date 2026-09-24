import { verifyPortal8Claim, type Portal8Claim } from './portal8-claims';
import { decodeFunctionResult, decodeFunctionData, encodeFunctionData, parseAbi, parseEventLogs, zeroAddress, type Address, type Hex } from "viem";
import type { ArcRpc } from "../arc/rpc";
import { quotedLaunchAbi } from "../arc/argus-discovery";
import { PORTAL6, PORTAL7 } from "./contracts";

export const feeAbi = parseAbi([
  "function claim(address account)",
  "function creator() view returns(address)",
  "function token() view returns(address)",
  "function quoteAsset() view returns(address)",
  "function claimableQuote6(address account) view returns(uint256)",
  "function claimableToken18(address account) view returns(uint256)",
  "function claimableUsdc6(address account) view returns(uint256)",
  "event Claimed(address indexed to,address indexed currency,uint256 amount)",
]);
const implementations = ["0x6c8f50b8895d5a22c97e611b8f9678a09d045b16", "0xd9578dd861b2fe59675c2c4b09b026fcb0df37fc"];
const same = (a:string,b:string) => a.toLowerCase() === b.toLowerCase();
export class FeeClaimError extends Error {}
export type CreatorFeeToken = {token:Address;portal:Address;splitter:Address;quote:Address;portal8?:Portal8Claim};
/** API metadata is only a discovery hint. Authority comes from the launch record and deployed clone. */
export async function verifyCreatorToken(wallet:Address, token:Address, rpc:ArcRpc, block:bigint):Promise<CreatorFeeToken> {
  let readFailure:unknown;
  for (const [index,portal] of [PORTAL6,PORTAL7].entries()) {
    let data:Hex;
    try{data=await rpc.call({from:zeroAddress,to:portal,data:encodeFunctionData({abi:quotedLaunchAbi,functionName:"launches",args:[token]}),value:0n},block);}catch(error){readFailure=error;continue;}
    if(data==="0x")continue;
    if(data.length!==706)throw new FeeClaimError("Unexpected creator record. Claim not prepared.");
    const record=decodeFunctionResult({abi:quotedLaunchAbi,functionName:"launches",data});
    if(same(record[0],zeroAddress))continue;
    if(!same(record[0],wallet))throw new FeeClaimError("This wallet is not the token creator.");
    const splitter=record[5],code=await rpc.code(splitter,block);
    const expected=`0x363d3d373d3d3d363d73${implementations[index].slice(2)}5af43d82803e903d91602b57fd5bf3`;
    if(!code||!same(code,expected))throw new FeeClaimError("This fee contract needs a reviewed adapter.");
    const read=async(functionName:"creator"|"token"|"quoteAsset")=>decodeFunctionResult({abi:feeAbi,functionName,data:await rpc.call({from:zeroAddress,to:splitter,value:0n,data:encodeFunctionData({abi:feeAbi,functionName})},block)});
    const [creator,actualToken,quote]=await Promise.all([read("creator"),read("token"),read("quoteAsset")]);
    if(!same(creator,wallet)||!same(actualToken,token)||!same(quote,record[10]))throw new FeeClaimError("Creator fee contract identity mismatch.");
    return {token,portal,splitter,quote};
  }
  const current=await verifyPortal8Claim(wallet,token,rpc,block);
  if(current)return current;
  if(readFailure)throw Error("Creator record could not be read. Retry shortly.");
  throw new FeeClaimError("No supported creator launch found for this token.");
}
export function assertClaimCall(wallet:string, splitter:string, call:{to?:string|null;data?:Hex;value?:bigint}) {
  if(!call.to||!same(call.to,splitter)||(call.value??0n)!==0n||!call.data)throw new FeeClaimError("Invalid fee claim transaction.");
  const decoded=decodeFunctionData({abi:feeAbi,data:call.data});
  if(decoded.functionName!=="claim"||!same(decoded.args[0],wallet)||call.data.toLowerCase()!==encodeFunctionData({abi:feeAbi,functionName:"claim",args:[wallet as Address]}).toLowerCase())throw new FeeClaimError("Invalid fee claim recipient.");
}
export function claimedAmounts(wallet:string,splitter:string,logs:Parameters<typeof parseEventLogs>[0]["logs"]) {
  const amounts:Record<string,bigint>={};
  for(const event of parseEventLogs({abi:feeAbi,eventName:"Claimed",logs,strict:true})) {
    if(!same(event.address,splitter))continue;
    if(!same(event.args.to,wallet))throw new FeeClaimError("Fee claim recipient mismatch.");
    const currency=event.args.currency.toLowerCase();amounts[currency]=(amounts[currency]??0n)+event.args.amount;
  }
  // A successful zero-value claim is valid if credits were already claimed elsewhere.
  return Object.entries(amounts).filter(([,amount])=>amount>0n).map(([token,amount])=>({token,raw:amount.toString()}));
}
