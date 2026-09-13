"use node";
import {createHmac} from "node:crypto";
import {generateJwt} from "@coinbase/cdp-sdk/auth";
import {makeFunctionReference} from "convex/server";
import {v} from "convex/values";
import {action,internalAction,type ActionCtx} from "./_generated/server";
import {exportFail} from "../lib/key-export/errors";
import type {ExportProvider} from "../lib/key-export/policy";

type Owner={provider:ExportProvider;userId:string};
type Candidate={enrolled:true}|{enrolled:false;address:string;bindingId:string;projectId:string};
// Match the original signer naming scheme. Read only; never creates CDP accounts.
export function customerAccountName(owner:Owner,secret:string){
  if(!secret||!/^\d{1,30}$/.test(owner.userId))exportFail("UNAVAILABLE");
  const message=owner.provider==="telegram"?`argos:telegram-wallet:v1:tg:${owner.userId}`:`arcbot:legacyNetwork:4663:x:${owner.userId}`;
  const digest=createHmac("sha256",secret).update(message).digest("hex").slice(0,25);
  return `${owner.provider==="telegram"?"argos-tg":"arcbot-rh"}-${digest}`;
}
async function ensure(ctx:ActionCtx,owner:Owner){
  const current=await ctx.runQuery(makeFunctionReference<"query">("walletExports:enrollmentCandidate"),owner) as Candidate;
  if(current.enrolled)return {eligible:true};
  const name=customerAccountName(owner,process.env.WALLET_SIGNER_IDEMPOTENCY_SECRET??"");
  const apiKeyId=process.env.CDP_API_KEY_ID,apiKeySecret=process.env.CDP_API_KEY_SECRET;
  if(!apiKeyId||!apiKeySecret)exportFail("UNAVAILABLE");
  const host="api.cdp.coinbase.com",path=`/platform/v2/evm/accounts/by-name/${name}`;
  const jwt=await generateJwt({apiKeyId,apiKeySecret,requestMethod:"GET",requestHost:host,requestPath:path});
  const response=await fetch(`https://${host}${path}`,{headers:{authorization:`Bearer ${jwt}`},redirect:"error",signal:AbortSignal.timeout(8000)});
  if(response.status===401||response.status===403)exportFail("CDP_LOOKUP_AUTH");
  if(response.status===404)exportFail("ELIGIBILITY");
  if(!response.ok)exportFail("PROVIDER_RETRY");
  const account=await response.json() as {name?:unknown;address?:unknown};
  if(account.name!==name||typeof account.address!=="string"||account.address.toLowerCase()!==current.address)exportFail("ELIGIBILITY");
  await ctx.runMutation(makeFunctionReference<"mutation">("walletExports:enrollVerifiedCustomer"),{...owner,address:current.address,bindingId:current.bindingId,projectId:current.projectId,cdpAccountName:name});
  return {eligible:true};
}
export const website=action({args:{secret:v.string(),provider:v.union(v.literal("x"),v.literal("telegram")),userId:v.string()},handler:async(ctx,a)=>{
  const secret=process.env.WEB_AUTH_SECRET;
  if(!secret||secret.length<32||a.secret!==secret)throw Error("Unauthorized.");
  return ensure(ctx,{provider:a.provider,userId:a.userId});
}});
export const telegram=internalAction({args:{updateId:v.string()},handler:async(ctx,a)=>{
  const owner=await ctx.runQuery(makeFunctionReference<"query">("walletExports:telegramEnrollmentOwner"),a) as Owner;
  return ensure(ctx,owner);
}});
