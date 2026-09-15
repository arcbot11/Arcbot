import {ConvexHttpClient} from "convex/browser";
import {makeFunctionReference} from "convex/server";
import { createHash } from "node:crypto";
import { decodeFunctionResult, encodeFunctionData, getAddress, type Address } from "viem";
import { arcConfigFromEnv } from "../arc/config";
import { checkArcRpc, createArcRpc } from "../arc/rpc";
import { prepareCall, advanceTransaction } from "../otc/runtime";
import { repository } from "../otc/repository";
import type { Transaction } from "../otc/model";
import { FeeClaimError, feeAbi, verifyCreatorToken } from "./fees";
import { PORTAL7 } from "./contracts";

export async function creatorTokens(wallet:Address,diagnostics?:{incomplete?:boolean}) {
  const discoveries=await Promise.allSettled([
    fetch("https://arguspad.io/api/tokens",{cache:"no-store",signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error("Creator discovery unavailable.");const rows:unknown=await r.json();if(!Array.isArray(rows))throw Error("Creator discovery unavailable.");return rows;}),
    process.env.NEXT_PUBLIC_CONVEX_URL?new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL).query(makeFunctionReference<"query">("launchExecution:creatorTokens"),{address:wallet}):Promise.resolve([]),
  ]);
  const rows:unknown[]=discoveries.flatMap(r=>r.status==="fulfilled"&&Array.isArray(r.value)?r.value:[]);
  if(discoveries[0].status==="rejected"&&!(rows as unknown[]).length)throw Error("Creator discovery unavailable. Retry shortly.");
  const candidates=rows.filter((r):r is {address:string;symbol:string;creator:string}=>!!r&&typeof r==="object"&&"creator" in r&&"address" in r&&"symbol" in r&&typeof r.creator==="string"&&r.creator.toLowerCase()===wallet.toLowerCase()&&typeof r.address==="string"&&/^0x[\da-f]{40}$/i.test(r.address));
  if(!candidates.length)return [];
  const config=arcConfigFromEnv(),rpc=createArcRpc(config),head=await checkArcRpc(rpc,config);
  let failures=0;
  const result:Array<{token:string;symbol:string}>=[];
  for(const candidate of [...new Map(candidates.map(c=>[c.address.toLowerCase(),c])).values()]){
    try{const verified=await verifyCreatorToken(wallet,getAddress(candidate.address),rpc,head.number);result.push({token:verified.token,symbol:typeof candidate.symbol==="string"?candidate.symbol.slice(0,32):"Token"});}
    catch(error){if(!(error instanceof FeeClaimError))failures++;}
  }
  if(diagnostics)diagnostics.incomplete=failures>0||discoveries.some(r=>r.status==="rejected");
  if(failures&&!result.length)throw Error("Creator tokens could not be verified. Retry shortly.");
  return result;
}
export async function prepareCreatorClaim(wallet:Address,token:Address) {
  const config=arcConfigFromEnv(),rpc=createArcRpc(config),head=await checkArcRpc(rpc,config);
  const launch=await verifyCreatorToken(wallet,token,rpc,head.number);
  const names=launch.portal.toLowerCase()===PORTAL7.toLowerCase()?["claimableQuote6","claimableToken18","claimableUsdc6"] as const:["claimableQuote6","claimableToken18"] as const;
  const credits=await Promise.all(names.map(async functionName=>decodeFunctionResult({abi:feeAbi,functionName,data:await rpc.call({from:wallet,to:launch.splitter,value:0n,data:encodeFunctionData({abi:feeAbi,functionName,args:[wallet]})},head.number)})));
  if(credits.every(value=>value===0n))throw new FeeClaimError("No credited fees to claim for this token.");
  const prepared=await prepareCall(5042,{from:wallet,to:launch.splitter,value:0n,data:encodeFunctionData({abi:feeAbi,functionName:"claim",args:[wallet]})});
  return {...prepared,leg:"claim" as const,creatorClaim:{token,splitter:launch.splitter}};
}
/** Persist before signing; retries and the normal worker recover the same transaction. */
export async function runCreatorClaim(owner:string,wallet:Address,requestId:string,token?:Address,sourceRequestId?:string,allowStart=true) {
  const repo=repository(),id="claim:"+createHash("sha256").update(JSON.stringify([owner,wallet.toLowerCase(),requestId])).digest("hex");
  let tx=await repo.read<Transaction|null>({id});
  if(tx&&(tx.id!==id||tx.leg!=="claim"||tx.owner!==owner||tx.wallet.toLowerCase()!==wallet.toLowerCase()||token&&tx.creatorClaim?.token.toLowerCase()!==token.toLowerCase()))throw new FeeClaimError("Claim request changed. Start a new request.");
  if(!tx){
    if(!allowStart)throw new FeeClaimError("Claim authorization expired. Submit a new request.");
    if(!token){const tokens=await creatorTokens(wallet);if(tokens.length!==1)throw new FeeClaimError(tokens.length?"Specify a token ticker or contract to claim its fees.":"No supported creator tokens found for this wallet.");token=getAddress(tokens[0].token);}
    const p=await prepareCreatorClaim(wallet,token);
    tx=await repo.command<Transaction>("prepare",{id,owner,wallet,chainId:5042,leg:"claim",creatorClaim:p.creatorClaim,unsigned:p.unsigned,reserveWei:p.reserveWei,balanceWei:p.snapshot.balanceWei,block:p.snapshot.block,...(sourceRequestId?{sourceRequestId}:{})});
  }
  if(!["completed","reverted","cancelled"].includes(tx.status)){try{tx=await advanceTransaction(id);}catch{tx=await repo.read<Transaction>({id});}}
  return {id:tx.id,status:tx.status,hash:tx.hash,pending:!["completed","reverted","cancelled"].includes(tx.status),ok:tx.status==="completed",message:tx.status==="completed"?"Fees claimed.":tx.status==="reverted"?"Fee claim reverted. No fees received.":tx.status==="cancelled"?"Fee claim cancelled before submission.":"Claim processing."};
}
