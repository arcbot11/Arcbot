import { internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { ARC_BOT_SITE_URL } from "../lib/project-config";
// Separate read-only history worker: never calls the transaction executor.
export const history=internalAction({args:{id:v.string(),attempt:v.optional(v.number())},handler:async(ctx,a)=>{
  if(!/^fee-history:0x[0-9a-f]{40}$/.test(a.id))throw Error("Invalid fee history ID");
  const secret=process.env.OTC_SERVICE_SECRET;
  if(!secret)throw Error("Fee history configuration missing");
  let pending=true,progressed=false;
  try {
    const r=await fetch(new URL("/api/fees/worker",ARC_BOT_SITE_URL),{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({id:a.id}),signal:AbortSignal.timeout(250000)});
    if(r.ok){const result=await r.json();pending=result.pending===true;progressed=result.progressed===true;}
  }catch{/* Preserve the last complete checkpoint and retry bounded work. */}
  const attempt=progressed?0:(a.attempt??0)+1;
  if(pending&&attempt<120)await ctx.scheduler.runAfter(15000,makeFunctionReference<"action">("feeWorker:history"),{id:a.id,attempt});
}});
export const run=internalAction({args:{id:v.string(),attempt:v.optional(v.number())},handler:async(ctx,a)=>{
  const secret=process.env.OTC_SERVICE_SECRET,origin=ARC_BOT_SITE_URL;
  if(!secret||!origin)throw Error("Fee worker configuration missing.");
  let pending=true;
  try{
    const r=await fetch(new URL("/api/fees/worker",origin),{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({id:a.id}),signal:AbortSignal.timeout(250000)});
    if(r.ok)pending=(await r.json()).pending===true;
  }catch{/* Existing transaction journals recover independently; never replace them. */}
  const attempt=(a.attempt??0)+1;
  if(pending&&attempt<120)await ctx.scheduler.runAfter(Math.min(60000,5000*attempt),makeFunctionReference<"action">("feeWorker:run"),{id:a.id,attempt});
}});
