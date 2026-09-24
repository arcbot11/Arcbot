import { v, ConvexError } from "convex/values";
import { mutation, query, internalAction, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { authorize } from "./launchDrafts";
import { assertLaunchEnabled, assertLaunchAuthorization, assertLaunchPortal } from "../lib/launches/execution-checks";
import { LAUNCH_AUTHORIZATION_MS } from "../lib/launches/policy";
import type { LaunchRun } from "../lib/launches/execution-types";
import type { Transaction } from "../lib/otc/model";
import { canIndexArcToken } from "../lib/arc/token-catalog";
import { otcWorkerUrl } from "../lib/project-config";
import { PORTAL8 } from '../lib/launches/portal8';
const args={secret:v.string(),owner:v.string(),address:v.string(),requestId:v.string()};
function rejectAcceptance(message:string):never{throw new ConvexError({acceptance:"rejected",message});}
type Args={secret:string;owner:string;address:string;requestId:string};
const find=(ctx:QueryCtx|MutationCtx,a:Args)=>ctx.db.query("launchRuns").withIndex("by_owner_request",q=>q.eq("owner",a.owner).eq("requestId",a.requestId)).unique();
async function finishDraft(ctx:MutationCtx,a:Args,run:LaunchRun){
  if(run.status!=="completed"&&run.status!=="blocked")return;
  const draft=await ctx.db.query("launchDrafts").withIndex("by_owner_request",q=>q.eq("owner",a.owner).eq("requestId",a.requestId)).unique();
  if(draft)await ctx.db.patch(draft._id,{status:run.status==="completed"?"completed":"cancelled",prepareToken:undefined,preparingUntil:undefined,updatedAt:Date.now()});
}
export const read=query({args,handler:async(ctx,a)=>{await authorize(ctx,a,false);const row=await find(ctx,a);return row&&row.address.toLowerCase()===a.address.toLowerCase()?JSON.parse(row.json) as LaunchRun:null;}});
export const accept=mutation({args:{...args,revision:v.number(),sourceRequestId:v.optional(v.string())},handler:async(ctx,a)=>{
  assertLaunchEnabled();const identity=await authorize(ctx,a),existing=await find(ctx,a);if(existing)return JSON.parse(existing.json) as LaunchRun;
  const draft=await ctx.db.query("launchDrafts").withIndex("by_owner_request",q=>q.eq("owner",a.owner).eq("requestId",a.requestId)).unique();
  if(!draft||draft.address!==identity.address||draft.status!=="prepared"||draft.revision!==a.revision||(draft.preparingUntil??0)>Date.now()||draft.expiresAt<=Date.now()||!draft.previewJson)rejectAcceptance("Launch review changed. Prepare again.");
  const preview=JSON.parse(draft.previewJson),input=JSON.parse(draft.inputJson);
  try{assertLaunchPortal(preview.portal);}catch{rejectAcceptance("Launch settings have changed. Prepare your token again.");}
  if(preview.portal.toLowerCase()!==PORTAL8.toLowerCase())rejectAcceptance('Launch settings have changed. Prepare your token again for the current portal.');
  if(preview.expiresAt<=Date.now()||!preview.image?.sha256||preview.image.imageURI!==input.imageURI||!preview.quote||preview.fingerprint!==draft.fingerprint)rejectAcceptance("Launch review expired or lacks verified evidence.");
  if(await ctx.db.query("launchRuns").withIndex("by_address_status",q=>q.eq("address",identity.address).eq("status","running")).first())rejectAcceptance("A launch is already processing for this wallet.");
  let authorizationExpiresAt=Date.now()+LAUNCH_AUTHORIZATION_MS;
  if(a.sourceRequestId){
    const request=await ctx.db.query("walletRequests").withIndex("by_request_id",q=>q.eq("requestId",a.sourceRequestId!)).unique();
    if(!request||request.source!=="x"||request.ownerXUserId!==a.owner||request.kind!=="launch")throw Error("Launch command authorization changed.");
    authorizationExpiresAt=Math.min(authorizationExpiresAt,Math.floor(request._creationTime)+LAUNCH_AUTHORIZATION_MS);
  }
  const run:LaunchRun={requestId:a.requestId,owner:a.owner,address:identity.address,input,preview,authorizationExpiresAt,status:"running",steps:[],...(a.sourceRequestId?{sourceRequestId:a.sourceRequestId}:{})};
  try{assertLaunchAuthorization(run);}catch{rejectAcceptance("Launch authorization expired. Review a new draft before continuing.");}
  await ctx.db.insert("launchRuns",{requestId:a.requestId,owner:a.owner,address:identity.address,status:run.status,json:JSON.stringify(run),updatedAt:Date.now()});
  await ctx.db.patch(draft._id,{status:"executing",revision:draft.revision+1,prepareToken:undefined,preparingUntil:undefined,updatedAt:Date.now()});
  await ctx.scheduler.runAfter(0,makeFunctionReference<"action">("launchExecution:recover"),{owner:a.owner,address:a.address,requestId:a.requestId});
  return run;
}});
/** CAS step registration precedes transaction preparation. A lost response reuses the same ID. */
export const step=mutation({args:{...args,index:v.number(),id:v.string()},handler:async(ctx,a)=>{
  assertLaunchEnabled();await authorize(ctx,a,false);const row=await find(ctx,a);if(!row)throw Error("Launch missing.");
  const run=JSON.parse(row.json) as LaunchRun;
  if(run.status!=="running"||a.index<0||!Number.isInteger(a.index)||a.index>=6||a.id!==`launch:${a.owner}:${a.requestId}:${a.index}`)throw Error("Invalid launch step.");
  if(run.steps[a.index]){if(run.steps[a.index]!==a.id)throw Error("Launch step changed.");return run;}
  assertLaunchAuthorization(run);
  if(run.steps.length!==a.index)throw Error("Launch step changed.");
  if(a.index){const previous=await ctx.db.query("otcRecords").withIndex("by_key",q=>q.eq("key",run.steps[a.index-1])).unique();if(!previous||previous.status!=="completed")throw Error("Previous launch step is not verified.");}
  run.steps.push(a.id);await ctx.db.patch(row._id,{json:JSON.stringify(run),updatedAt:Date.now()});return run;
}});
export const reconcile=mutation({args,handler:async(ctx,a)=>{
  await authorize(ctx,a,false);const row=await find(ctx,a);if(!row)throw Error("Launch missing.");const run=JSON.parse(row.json) as LaunchRun;
  if(run.status==="completed"||run.status==="blocked"){await finishDraft(ctx,a,run);return run;}
  const id=run.steps.at(-1);if(!id)return run;
  const record=await ctx.db.query("otcRecords").withIndex("by_key",q=>q.eq("key",id)).unique();const tx=record?JSON.parse(record.json) as Transaction:null;
  if(!tx)return run;
  if(tx.owner!==run.owner||tx.wallet.toLowerCase()!==run.address.toLowerCase()||tx.launchStep?.requestId!==run.requestId)throw Error("Launch transaction identity mismatch.");
  if(["cancelled","reverted"].includes(tx.status)){run.status="blocked";run.note=tx.status==="reverted"?"Launch step reverted. No further transaction will be sent.":"Launch stopped before signing. Review before starting a new draft.";}
  if(tx.status==="completed"&&tx.launchStep.kind==="launch"){
    const result=tx.settlement?.launch;
    if(!result||result.hash!==tx.hash||result.portal.toLowerCase()!==run.preview.portal.toLowerCase()||result.creator.toLowerCase()!==run.address.toLowerCase()
      ||result.hook.toLowerCase()!==run.preview.predictedHook.toLowerCase()||result.splitter.toLowerCase()!==run.preview.predictedSplitter.toLowerCase()
      ||(run.preview.portal.toLowerCase()!==PORTAL8.toLowerCase()&&result.token.toLowerCase()!==run.preview.predictedToken.toLowerCase()))throw Error("Verified launch outcome missing.");
    run.result=result;run.status="completed";delete run.note;
    const address=result.token.toLowerCase(),now=Date.now();
    const metadata={address,creator:run.address.toLowerCase(),portal:result.portal,feeDestination:run.input.feeDestination,name:run.input.name,symbol:run.input.symbol,image:run.input.imageURI,description:run.input.description,pair:run.input.pairToken,featured:false,launchHash:result.hash};
    if(!await ctx.db.query("verifiedBotLaunches").withIndex("by_address",q=>q.eq("address",address)).unique())await ctx.db.insert("verifiedBotLaunches",{address,creator:run.address.toLowerCase(),symbol:run.input.symbol,json:JSON.stringify(metadata),createdAt:now});
    const indexed=await ctx.db.query("tokenRegistry").withIndex("by_normalized_address",q=>q.eq("normalizedAddress",address)).unique();
    const duplicate=await ctx.db.query("tokenRegistry").withIndex("by_symbol",q=>q.eq("symbol",run.input.symbol)).first();
    if(!indexed&&!duplicate&&canIndexArcToken(address,run.input.symbol))await ctx.db.insert("tokenRegistry",{address,normalizedAddress:address,name:run.input.name,symbol:run.input.symbol,decimals:18,chainId:5042,active:true,pairCandidate:false,pairApproved:false,verifiedAt:now,updatedAt:now});
  }
  await ctx.db.patch(row._id,{status:run.status,json:JSON.stringify(run),updatedAt:Date.now()});
  await finishDraft(ctx,a,run);
  return run;
}});
export const directory=query({args:{},handler:async ctx=>(await ctx.db.query("verifiedBotLaunches").order("desc").take(500)).map(r=>JSON.parse(r.json))});
export const stopUnstarted=mutation({args:{...args,note:v.string()},handler:async(ctx,a)=>{
  await authorize(ctx,a,false);const row=await find(ctx,a);if(!row)throw Error("Launch missing.");const run=JSON.parse(row.json) as LaunchRun;
  if(run.status!=="running"){await finishDraft(ctx,a,run);return run;}
  for(const id of run.steps){const record=await ctx.db.query("otcRecords").withIndex("by_key",q=>q.eq("key",id)).unique();
    if(record){const tx=JSON.parse(record.json) as Transaction;
      if(!["completed","reverted","cancelled"].includes(tx.status)||tx.status==="completed"&&tx.launchStep?.kind==="launch")return run;
    }
  }
  run.status="blocked";run.note=a.note.slice(0,300);await ctx.db.patch(row._id,{status:run.status,json:JSON.stringify(run),updatedAt:Date.now()});await finishDraft(ctx,a,run);return run;
}});
export const creatorTokens=query({args:{address:v.string()},handler:async(ctx,a)=>(await ctx.db.query("verifiedBotLaunches").withIndex("by_creator",q=>q.eq("creator",a.address.toLowerCase())).take(500)).map(r=>({address:r.address,symbol:r.symbol,creator:r.creator}))});
export const recover=internalAction({args:{owner:v.string(),address:v.string(),requestId:v.string()},handler:async(ctx,a)=>{
  const lease=await ctx.runMutation(makeFunctionReference<"mutation">("launchExecution:claimRecovery"),a);
  if(!lease)return;
  let finished=false;
  try{const url=new URL(otcWorkerUrl());url.searchParams.set("launch",a.requestId);url.searchParams.set("owner",a.owner);url.searchParams.set("address",a.address);
    const response=await fetch(url,{method:"POST",headers:{authorization:`Bearer ${process.env.OTC_SERVICE_SECRET}`},signal:AbortSignal.timeout(250000)});
    if(response.ok){const body=await response.json();finished=["completed","blocked"].includes(body.status);}
    else console.warn("launch_recovery_retry",{status:response.status});
  }catch{console.warn("launch_recovery_retry",{reason:"worker_unavailable"});}
  await ctx.runMutation(makeFunctionReference<"mutation">("launchExecution:releaseRecovery"),{...a,lease});
  return {finished};
}});
const recoveryArgs={owner:v.string(),address:v.string(),requestId:v.string()};
export const claimRecovery=internalMutation({args:recoveryArgs,handler:async(ctx,a)=>{
  const row=await find(ctx,{...a,secret:""}),now=Date.now();
  if(!row||row.status!=="running"||row.address.toLowerCase()!==a.address.toLowerCase()||(row.recoveryUntil??0)>now)return false;
  const lease=crypto.randomUUID();
  await ctx.db.patch(row._id,{recoveryUntil:now+300000,recoveryLease:lease,updatedAt:now});return lease;
}});
export const releaseRecovery=internalMutation({args:{...recoveryArgs,lease:v.string()},handler:async(ctx,a)=>{
  const row=await find(ctx,{...a,secret:""});
  if(row?.recoveryLease===a.lease)await ctx.db.patch(row._id,{recoveryUntil:0,recoveryLease:undefined,updatedAt:Date.now()});
}});
export const directoryPage=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,a)=>{
  const result=await ctx.db.query("verifiedBotLaunches").order("desc").paginate({...a.paginationOpts,numItems:Math.min(a.paginationOpts.numItems,200)});
  return {...result,page:result.page.map(r=>({...JSON.parse(r.json),creator:r.creator}))};
}});
export const creatorTokensPage=query({args:{address:v.string(),paginationOpts:paginationOptsValidator},handler:async(ctx,a)=>{
  const result=await ctx.db.query("verifiedBotLaunches").withIndex("by_creator",q=>q.eq("creator",a.address.toLowerCase())).paginate({...a.paginationOpts,numItems:Math.min(a.paginationOpts.numItems,200)});
  return {...result,page:result.page.map(r=>({address:r.address,symbol:r.symbol,creator:r.creator}))};
}});
/** Oldest running jobs rotate forward even when their worker cannot be reached. */
export const sweep=internalMutation({args:{},handler:async ctx=>{
  const now=Date.now();
  const rows=await ctx.db.query("launchRuns").withIndex("by_status_updated",q=>q.eq("status","running").lt("updatedAt",now-30000)).take(20);
  for(const row of rows){
    await ctx.db.patch(row._id,{updatedAt:now});
    if((row.recoveryUntil??0)>now)continue;
    await ctx.scheduler.runAfter(0,makeFunctionReference<"action">("launchExecution:recover"),{owner:row.owner,address:row.address,requestId:row.requestId});
  }
  return rows.length;
}});
