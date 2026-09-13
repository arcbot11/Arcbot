import {makeFunctionReference} from "convex/server";
import {v} from "convex/values";
import {internalMutation,internalQuery,mutation,query,type MutationCtx,type QueryCtx} from "./_generated/server";
import type {Doc} from "./_generated/dataModel";
import {EXPORT_TTL_MS,EXPORT_APPROVAL_MS,EXPORT_LEASE_MS,exportAddress,exportDigest,exportOrigin,exportOwner,type ExportProvider} from "../lib/key-export/policy";
import {OTC_FEE_RECIPIENT} from "../lib/project-config";
import {walletId,type Wallet} from "../lib/otc/model";
import {exportFail,exportErrors} from "../lib/key-export/errors";

const provider = v.union(v.literal("x"),v.literal("telegram"));
function authorize(secret:string,kind:"WEB_AUTH_SECRET"|"WALLET_EXPORT_SERVICE_SECRET") {
  const expected=process.env[kind];
  if(!expected||expected.length<32||secret!==expected)throw Error("Unauthorized.");
  if(kind==="WALLET_EXPORT_SERVICE_SECRET"&&[process.env.WEB_AUTH_SECRET,process.env.OTC_SERVICE_SECRET,process.env.WALLET_SIGNER_TOKEN].some(other=>other===expected))throw Error("Export authority must use a separate secret.");
  if(process.env.WALLET_EXPORT_ENABLED!=="true")throw Error("Key export is disabled.");
}
async function binding(ctx:MutationCtx|QueryCtx,p:ExportProvider,userId:string){
  exportOwner(p,userId);
  const migration=await ctx.db.query("walletExportMigration").withIndex("by_key",q=>q.eq("key","v1")).unique();
  if(!migration?.ready)exportFail("REGISTRY_NOT_READY");
  let candidate:{address:string;signerWalletRef:string;_id:string}|undefined;
  if(p==="x"){
    const user=await ctx.db.query("xReplyUsers").withIndex("by_x_user_id",q=>q.eq("xUserId",userId)).unique();
    const owned=await ctx.db.query("cryptoWallets").withIndex("by_owner_x_user_id",q=>q.eq("ownerXUserId",userId)).take(2);
    if(owned.length!==1||owned[0].status!=="active"||user?.walletId!==owned[0]._id)throw Error("Canonical wallet could not be verified.");
    candidate=owned[0];
  }else{
    const owned=await ctx.db.query("telegramNativeWallets").withIndex("by_user",q=>q.eq("telegramUserId",userId)).take(2);
    if(owned.length!==1||owned[0].telegramChatId!==userId)throw Error("Permanent Telegram wallet could not be verified.");
    candidate=owned[0];
  }
  const address=exportAddress(candidate.address);
  const xs=await ctx.db.query("cryptoWallets").withIndex("by_normalized_address",q=>q.eq("normalizedAddress",address)).take(2);
  const tgs=await ctx.db.query("telegramNativeWallets").withIndex("by_normalized_address",q=>q.eq("normalizedAddress",address)).take(2);
  if(exportAddress(candidate.signerWalletRef)!==address||xs.length+tgs.length!==1||String([...xs,...tgs][0]._id)!==String(candidate._id))throw Error("Wallet ownership is ambiguous.");
  if(address===OTC_FEE_RECIPIENT.toLowerCase()||(process.env.WALLET_EXPORT_PROTECTED_ADDRESSES??"").split(/[\s,]+/).some(a=>a.toLowerCase()===address))throw Error("Protected wallets cannot be exported here.");
  if((await ctx.db.query("otcRecords").withIndex("by_escrow",q=>q.eq("escrowAddress",address)).take(1)).length)throw Error("Escrow keys cannot be exported.");
  return {address,bindingId:String(candidate._id)};
}
async function accountFor(ctx:MutationCtx|QueryCtx,p:ExportProvider,userId:string){
  const current=await binding(ctx,p,userId);
  const account=await ctx.db.query("walletExportAccounts").withIndex("by_owner",q=>q.eq("provider",p).eq("userId",userId)).unique();
  if(!account?.approved||account.address!==current.address||account.bindingId!==current.bindingId||account.projectId!==process.env.WALLET_EXPORT_CDP_PROJECT_ID)exportFail("ELIGIBILITY");
  return account;
}
// Only the website server can request this, using the verified session's owner.
// Visibility is advisory; every actual export transition repeats authorization.
export const eligibility=query({args:{secret:v.string(),provider,userId:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WEB_AUTH_SECRET");
  try{await accountFor(ctx,a.provider,a.userId);return {eligible:true};}
  catch{return {eligible:false};}
}});
/** Read-only operator preflight. Never returns credentials, grants, or keys. */
export const rolloutStatus=internalQuery({args:{targets:v.array(v.object({provider,userId:v.string()}))},handler:async(ctx,a)=>{
  if(a.targets.length>10)throw Error("Inspect at most ten accounts at a time.");
  const migration=await ctx.db.query("walletExportMigration").withIndex("by_key",q=>q.eq("key","v1")).unique();
  const names=["WALLET_EXPORT_ORIGIN","WALLET_EXPORT_SERVICE_SECRET","WALLET_EXPORT_CDP_PROJECT_ID","WALLET_EXPORT_PROTECTED_ADDRESSES"];
  return {enabled:process.env.WALLET_EXPORT_ENABLED==="true",migrationReady:migration?.ready===true,
    configured:Object.fromEntries(names.map(name=>[name,Boolean(process.env[name])])),
    targets:await Promise.all(a.targets.map(async target=>{
      try{const current=await binding(ctx,target.provider,target.userId);
        const account=await ctx.db.query("walletExportAccounts").withIndex("by_owner",q=>q.eq("provider",target.provider).eq("userId",target.userId)).unique();
        return {...target,...current,eligible:!!account?.approved&&account.address===current.address&&account.bindingId===current.bindingId&&account.projectId===process.env.WALLET_EXPORT_CDP_PROJECT_ID};
      }catch{return {...target,eligible:false,bindingReady:false};}
    }))};
}});
async function audit(ctx:MutationCtx,accountId:Doc<"walletExportAccounts">["_id"],event:string,grantId?:Doc<"walletExportGrants">["_id"]){await ctx.db.insert("walletExportAudit",{accountId,event,at:Date.now(),...(grantId?{grantId}:{})});}
async function limit(ctx:MutationCtx,key:string,max:number){
  const row=await ctx.db.query("walletExportLimits").withIndex("by_key",q=>q.eq("key",key)).unique(),now=Date.now();
  if(row&&row.resetAt>now&&row.count>=max)exportFail("RATE_LIMITED");
  const data={key,count:row&&row.resetAt>now?row.count+1:1,resetAt:row&&row.resetAt>now?row.resetAt:now+3600_000};
  if(row)await ctx.db.patch(row._id,data);else await ctx.db.insert("walletExportLimits",data);
}
async function live(ctx:MutationCtx,g:Doc<"walletExportGrants">){
  if(g.state==="revoked"||g.expiresAt<=Date.now())exportFail("EXPIRED");
  const account=await accountFor(ctx,g.provider,g.userId);
  if(account._id!==g.accountId||account.revision!==g.revision)exportFail("AUTHORIZATION");
  if(g.provider==="x"){
    const session=await ctx.db.query("webWalletSessions").withIndex("by_session_hash",q=>q.eq("sessionIdHash",g.sessionHash!)).unique();
    const browser=await ctx.db.query("webAuthBrowsers").withIndex("by_browser",q=>q.eq("browserHash",g.browserFamily!)).unique();
    if(!session||session.revokedAt||session.expiresAt<=Date.now()||session.ownerXUserId!==g.userId||!browser||browser.expiresAt<=Date.now()||browser.generation!==g.generation||browser.activeSessionHash!==g.sessionHash)exportFail("AUTHORIZATION");
  }else{
    const selection=await ctx.db.query("telegramWalletSelections").withIndex("by_user",q=>q.eq("telegramUserId",g.userId)).unique();
    if(!selection||selection.selected!=="tg"||selection.pendingUpdateId||selection.updatedAt!==g.selectionAt)throw Error("Telegram wallet selection changed. Start again.");
  }
  return account;
}
async function issue(ctx:MutationCtx,args:{ticketHash:string;provider:ExportProvider;userId:string;sessionHash?:string;browserFamily?:string;generation?:number;selectionAt?:number;telegramUpdateId?:string;telegramConfirmationHash?:string}){
  exportDigest(args.ticketHash);const account=await accountFor(ctx,args.provider,args.userId);
  await limit(ctx,`owner:${exportOwner(args.provider,args.userId)}`,3);
  // Optional operator emergency ceiling; unrelated users do not share a 100/hour quota.
  const ceiling=Number(process.env.WALLET_EXPORT_HOURLY_CAP??0);
  if(Number.isSafeInteger(ceiling)&&ceiling>0)await limit(ctx,"global",ceiling);
  if(await ctx.db.query("walletExportGrants").withIndex("by_ticket",q=>q.eq("ticketHash",args.ticketHash)).unique())throw Error("Export request already exists.");
  const id=await ctx.db.insert("walletExportGrants",{...args,accountId:account._id,revision:account.revision,state:"pending",createdAt:Date.now(),expiresAt:Date.now()+EXPORT_TTL_MS});
  await live(ctx,(await ctx.db.get(id))!);await audit(ctx,account._id,"requested",id);return {grantId:id,expiresAt:Date.now()+EXPORT_TTL_MS};
}
/** Explicit operator audit required; never called by a customer route or automatically on login. */
export const approveCustomer=internalMutation({args:{provider,userId:v.string(),address:v.string(),bindingId:v.string(),projectId:v.string(),cdpAccountName:v.string(),approved:v.boolean()},handler:async(ctx,a)=>{
  const current=await binding(ctx,a.provider,a.userId);
  if(current.address!==exportAddress(a.address)||current.bindingId!==a.bindingId||!a.projectId||a.projectId!==process.env.WALLET_EXPORT_CDP_PROJECT_ID)throw Error("Audit does not match wallet binding.");
  if(!(a.provider==="x"?/^arcbot-rh-[a-f0-9]{25}$/:/^argos-tg-[a-f0-9]{25}$/).test(a.cdpAccountName))throw Error("Only reviewed customer CDP accounts are eligible.");
  const previous=await ctx.db.query("walletExportAccounts").withIndex("by_address",q=>q.eq("address",current.address)).unique();
  if(previous&&(previous.provider!==a.provider||previous.userId!==a.userId||previous.bindingId!==a.bindingId))throw Error("Registry ownership cannot change.");
  const fields={...a,address:current.address,revision:(previous?.revision??0)+1};
  const id=previous?previous._id:await ctx.db.insert("walletExportAccounts",fields);
  if(previous)await ctx.db.patch(id,fields);await audit(ctx,id,a.approved?"eligibility_approved":"eligibility_revoked");
}});
export const startX=mutation({args:{secret:v.string(),ticketHash:v.string(),userId:v.string(),sessionHash:v.string(),browserFamily:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WEB_AUTH_SECRET");exportDigest(a.sessionHash);exportDigest(a.browserFamily);
  const existing=await ctx.db.query("walletExportGrants").withIndex("by_ticket",q=>q.eq("ticketHash",a.ticketHash)).unique();
  if(existing){
    if(existing.provider!=="x"||existing.userId!==a.userId||existing.sessionHash!==a.sessionHash||existing.browserFamily!==a.browserFamily)exportFail("AUTHORIZATION");
    await live(ctx,existing);return {expiresAt:existing.expiresAt};
  }
  // Keep a digest-only tombstone through the immutable website session expiry.
  // Cleaning an expired grant must never make its old bearer ticket reusable.
  if(await ctx.db.query("walletExportAttempts").withIndex("by_ticket",q=>q.eq("ticketHash",a.ticketHash)).unique())exportFail("EXPIRED");
  const family=await ctx.db.query("webAuthBrowsers").withIndex("by_browser",q=>q.eq("browserHash",a.browserFamily)).unique();
  const issued=await issue(ctx,{ticketHash:a.ticketHash,provider:"x",userId:a.userId,sessionHash:a.sessionHash,browserFamily:a.browserFamily,generation:family?.generation});
  const session=await ctx.db.query("webWalletSessions").withIndex("by_session_hash",q=>q.eq("sessionIdHash",a.sessionHash)).unique();
  await ctx.db.insert("walletExportAttempts",{ticketHash:a.ticketHash,expiresAt:session!.expiresAt});
  return issued;
}});
async function telegramRequest(ctx:MutationCtx,updateId:string){
  if(process.env.WALLET_EXPORT_ENABLED!=="true")exportFail("UNAVAILABLE");
  const update=await ctx.db.query("telegramUpdates").withIndex("by_update_id",q=>q.eq("updateId",updateId)).unique();
  if(!update?.telegramUserId||update.telegramChatId!==update.telegramUserId||update.walletTransitionBlocked||Date.now()-update.createdAt>EXPORT_TTL_MS)throw Error("A fresh private Telegram request is required.");
  const selection=await ctx.db.query("telegramWalletSelections").withIndex("by_user",q=>q.eq("telegramUserId",update.telegramUserId!)).unique();
  if(!selection||selection.selected!=="tg"||selection.pendingUpdateId)exportFail("TG_SELECTION");
  return {update,selection};
}
const confirmationDeliveryRef=makeFunctionReference<"action">("telegram:deliverExportConfirmation");
export const requestTelegramConfirmation=internalMutation({args:{updateId:v.string()},handler:async(ctx,a)=>{
  const {update,selection}=await telegramRequest(ctx,a.updateId),account=await accountFor(ctx,"telegram",update.telegramUserId!);
  const previous=await ctx.db.query("walletExportConfirmations").withIndex("by_user",q=>q.eq("userId",update.telegramUserId!)).unique();
  // Delivery retries reuse only the same still-valid prompt for this intake.
  if(previous?.updateId===a.updateId&&previous.expiresAt>Date.now()&&!previous.consumedAt&&previous.accountId===account._id&&previous.revision===account.revision&&previous.selectionAt===selection.updatedAt)return {code:previous.code};
  if(previous?.updateId===a.updateId&&previous.consumedAt)exportFail("TG_CONFIRMATION");
  const data={userId:update.telegramUserId!,accountId:account._id,revision:account.revision,selectionAt:selection.updatedAt,code:crypto.randomUUID().slice(0,8),updateId:a.updateId,createdAt:Date.now(),expiresAt:Date.now()+EXPORT_TTL_MS,deliveryDueAt:Date.now()};
  const confirmationId=previous?previous._id:await ctx.db.insert("walletExportConfirmations",data);
  if(previous)await ctx.db.patch(previous._id,{...data,consumedAt:undefined,deliveryAttempt:undefined,deliveryLeaseUntil:undefined,deliveredAt:undefined});
  await ctx.scheduler.runAfter(0,confirmationDeliveryRef,{confirmationId,updateId:a.updateId});
  return {code:data.code};
}});

export const takeConfirmationDelivery=internalMutation({args:{confirmationId:v.id("walletExportConfirmations"),updateId:v.string()},handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.confirmationId);
  if(!c||c.updateId!==a.updateId||c.consumedAt||c.deliveredAt||c.expiresAt<=Date.now()||(c.deliveryLeaseUntil??0)>Date.now())return null;
  try{
    const {update,selection}=await telegramRequest(ctx,c.updateId),account=await accountFor(ctx,"telegram",c.userId);
    if(update.telegramUserId!==c.userId||account._id!==c.accountId||account.revision!==c.revision||selection.updatedAt!==c.selectionAt)throw Error();
  }catch{await ctx.db.patch(c._id,{deliveryDueAt:undefined});return null;}
  const attempt=crypto.randomUUID();
  await ctx.db.patch(c._id,{deliveryAttempt:attempt,deliveryLeaseUntil:Date.now()+30000,deliveryDueAt:Date.now()+30000});
  await ctx.scheduler.runAfter(30000,confirmationDeliveryRef,a);
  return {attempt,chatId:c.userId,code:c.code,expiresAt:c.expiresAt};
}});
export const finishConfirmationDelivery=internalMutation({args:{confirmationId:v.id("walletExportConfirmations"),updateId:v.string(),attempt:v.string(),delivered:v.boolean()},handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.confirmationId);
  if(!c||c.updateId!==a.updateId||c.deliveryAttempt!==a.attempt||c.deliveredAt||c.consumedAt)return;
  await ctx.db.patch(c._id,{deliveryLeaseUntil:undefined,deliveryDueAt:a.delivered?undefined:Date.now()+5000,...(a.delivered?{deliveredAt:Date.now()}:{})});
  await audit(ctx,c.accountId,a.delivered?"telegram_confirmation_delivered":"telegram_confirmation_retry");
  if(!a.delivered&&c.expiresAt>Date.now()+5000)await ctx.scheduler.runAfter(5000,confirmationDeliveryRef,{confirmationId:c._id,updateId:c.updateId});
}});
const deliveryRef=makeFunctionReference<"action">("telegram:deliverKeyExport");
const bytesHex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
const textDigest=async(text:string)=>bytesHex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
async function telegramTicket(userId:string,updateId:string,accountId:string,revision:number,selectionAt:number){
  const secret=process.env.WALLET_EXPORT_SERVICE_SECRET??"";authorize(secret,"WALLET_EXPORT_SERVICE_SECRET");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return bytesHex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(JSON.stringify(["telegram-export-delivery-v1",userId,updateId,accountId,revision,selectionAt]))));
}
export const startTelegram=internalMutation({args:{updateId:v.string(),confirmationCode:v.string()},handler:async(ctx,a)=>{
  const {update,selection}=await telegramRequest(ctx,a.updateId),account=await accountFor(ctx,"telegram",update.telegramUserId!);
  const proofHash=await textDigest(a.confirmationCode);
  const existing=await ctx.db.query("walletExportGrants").withIndex("by_telegram_update",q=>q.eq("telegramUpdateId",a.updateId)).unique();
  const token=await telegramTicket(update.telegramUserId!,a.updateId,account._id,account.revision,selection.updatedAt);
  if(existing){
    if(existing.provider!=="telegram"||existing.userId!==update.telegramUserId||existing.telegramConfirmationHash!==proofHash||existing.ticketHash!==await textDigest(token))exportFail("TG_CONFIRMATION");
    await live(ctx,existing);
    return {url:exportOrigin()+"/api/key-export/view#ticket="+token};
  }
  const confirmation=await ctx.db.query("walletExportConfirmations").withIndex("by_user",q=>q.eq("userId",update.telegramUserId!)).unique();
  if(!confirmation||confirmation.consumedAt||confirmation.expiresAt<=Date.now()||confirmation.updateId===a.updateId||update.createdAt<confirmation.createdAt||confirmation.code!==a.confirmationCode||confirmation.accountId!==account._id||confirmation.revision!==account.revision||confirmation.selectionAt!==selection.updatedAt)exportFail("TG_CONFIRMATION");
  await ctx.db.patch(confirmation._id,{consumedAt:Date.now(),deliveryDueAt:undefined});
  const issued=await issue(ctx,{ticketHash:await textDigest(token),provider:"telegram",userId:update.telegramUserId!,selectionAt:selection.updatedAt,telegramUpdateId:a.updateId,telegramConfirmationHash:proofHash});
  // Scheduling and consuming confirmation commit together. Telegram delivery can
  // retry the same link, including after the initiating action is interrupted.
  await ctx.db.patch(issued.grantId,{telegramDeliveryDueAt:Date.now()});
  await ctx.scheduler.runAfter(0,deliveryRef,{grantId:issued.grantId});
  return {url:exportOrigin()+"/api/key-export/view#ticket="+token};
}});
export const takeTelegramDelivery=internalMutation({args:{grantId:v.id("walletExportGrants")},handler:async(ctx,a)=>{
  const g=await ctx.db.get(a.grantId);
  if(!g||g.provider!=="telegram"||!g.telegramUpdateId||g.telegramDeliveredAt||g.expiresAt<=Date.now()||g.state!=="pending"||(g.telegramDeliveryLeaseUntil??0)>Date.now())return null;
  try{await live(ctx,g);}catch{await ctx.db.patch(g._id,{telegramDeliveryDueAt:undefined});return null;}
  const token=await telegramTicket(g.userId,g.telegramUpdateId,g.accountId,g.revision,g.selectionAt!);
  if(await textDigest(token)!==g.ticketHash)return null;
  const attempt=crypto.randomUUID();
  await ctx.db.patch(g._id,{telegramDeliveryAttempt:attempt,telegramDeliveryLeaseUntil:Date.now()+30000,telegramDeliveryDueAt:Date.now()+30000});
  // Crash recovery is scheduled before the action starts its network request.
  await ctx.scheduler.runAfter(30000,deliveryRef,{grantId:g._id});
  return {attempt,chatId:g.userId,url:exportOrigin()+"/api/key-export/view#ticket="+token};
}});
export const finishTelegramDelivery=internalMutation({args:{grantId:v.id("walletExportGrants"),attempt:v.string(),delivered:v.boolean()},handler:async(ctx,a)=>{
  const g=await ctx.db.get(a.grantId);if(!g||g.telegramDeliveryAttempt!==a.attempt||g.telegramDeliveredAt)return;
  await ctx.db.patch(g._id,{telegramDeliveryLeaseUntil:undefined,telegramDeliveryDueAt:a.delivered?undefined:Date.now()+5000,...(a.delivered?{telegramDeliveredAt:Date.now()}:{})});
  await audit(ctx,g.accountId,a.delivered?"telegram_link_delivered":"telegram_link_retry",g._id);
  if(!a.delivered&&g.expiresAt>Date.now()+5000)await ctx.scheduler.runAfter(5000,deliveryRef,{grantId:g._id});
}});
const base={secret:v.string(),ticketHash:v.string(),browserHash:v.string()};
async function readGrant(ctx:MutationCtx,a:{ticketHash:string;browserHash:string}){
  exportDigest(a.ticketHash);exportDigest(a.browserHash);
  const g=await ctx.db.query("walletExportGrants").withIndex("by_ticket",q=>q.eq("ticketHash",a.ticketHash)).unique();
  if(!g)exportFail("EXPIRED");
  if(g.browserHash!==a.browserHash)exportFail("BROWSER_MISMATCH");
  return {g,account:await live(ctx,g)};
}
export const claim=mutation({args:{...base},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");exportDigest(a.ticketHash);exportDigest(a.browserHash);
  const g=await ctx.db.query("walletExportGrants").withIndex("by_ticket",q=>q.eq("ticketHash",a.ticketHash)).unique();
  if(!g||(g.browserHash&&g.browserHash!==a.browserHash))throw Error("Export request is unavailable.");
  const account=await live(ctx,g);await ctx.db.patch(g._id,{browserHash:a.browserHash});
  return {provider:g.provider,address:account.address,state:g.state,expiresAt:g.expiresAt};
}});
export const status=mutation({args:base,handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");const {g,account}=await readGrant(ctx,a);
  return {provider:g.provider,address:account.address,state:g.state,expiresAt:g.expiresAt};
}});
export const failure=mutation({args:{...base,stage:v.string(),code:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");
  if(!["claim","status","x","telegram","approve","export","close","cdp","relayed","oauth"].includes(a.stage)||!Object.hasOwn(exportErrors,a.code))exportFail("AUTHORIZATION");
  const g=await ctx.db.query("walletExportGrants").withIndex("by_ticket",q=>q.eq("ticketHash",a.ticketHash)).unique();
  if(!g||g.browserHash!==a.browserHash)return;
  const event=`failed:${a.stage}:${a.code}`;
  const recent=await ctx.db.query("walletExportAudit").withIndex("by_account",q=>q.eq("accountId",g.accountId)).order("desc").take(1);
  if(recent[0]?.event===event&&Date.now()-recent[0].at<30000)return;
  await audit(ctx,g.accountId,event,g._id);
}});
export const oauthStart=mutation({args:{...base,stateHash:v.string(),encryptedVerifier:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");exportDigest(a.stateHash);
  const {g}=await readGrant(ctx,a);
  if(g.provider!=="x"||g.state!=="pending"||a.encryptedVerifier.length>1024)throw Error("Start a new export authorization.");
  if((g.oauthLeaseUntil??0)>Date.now())exportFail("BUSY");
  await limit(ctx,`oauth:${g.ticketHash}`,10);
  await ctx.db.patch(g._id,{oauthState:a.stateHash,oauthVerifier:a.encryptedVerifier,oauthCodeHash:undefined,oauthUsedAt:undefined,oauthToken:undefined,oauthAttempt:undefined,oauthLeaseUntil:undefined});
}});
export const oauthTake=mutation({args:{...base,stateHash:v.string(),attempt:v.string(),codeHash:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");exportDigest(a.stateHash);exportDigest(a.codeHash);
  const {g}=await readGrant(ctx,a);
  if(g.provider!=="x"||g.oauthState!==a.stateHash)exportFail("AUTHORIZATION");
  if(g.oauthCodeHash&&g.oauthCodeHash!==a.codeHash)exportFail("AUTHORIZATION");
  if(g.state==="authenticated")return {done:true};
  if(g.state!=="pending"||!g.oauthVerifier)exportFail("EXPIRED");
  if((g.oauthLeaseUntil??0)>Date.now()&&g.oauthAttempt!==a.attempt)exportFail("BUSY");
  // A consumed code cannot safely be exchanged twice. If no sealed token was
  // committed, restart OAuth in this same grant after the lease expires.
  if(g.oauthUsedAt&&!g.oauthToken&&g.oauthAttempt!==a.attempt)exportFail("OAUTH_RESTART");
  await ctx.db.patch(g._id,{oauthCodeHash:a.codeHash,oauthUsedAt:g.oauthUsedAt??Date.now(),oauthAttempt:a.attempt,oauthLeaseUntil:Date.now()+30000});
  return {done:false,ticketHash:g.ticketHash,browserHash:g.browserHash!,encryptedVerifier:g.oauthVerifier,encryptedToken:g.oauthToken};
}});
export const oauthSaveToken=mutation({args:{...base,stateHash:v.string(),attempt:v.string(),encryptedToken:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");const {g}=await readGrant(ctx,a);
  if(g.state!=="pending"||g.provider!=="x"||g.oauthState!==a.stateHash||g.oauthAttempt!==a.attempt||(g.oauthLeaseUntil??0)<=Date.now()||a.encryptedToken.length>8192)exportFail("OAUTH_RESTART");
  if(g.oauthToken&&g.oauthToken!==a.encryptedToken)exportFail("AUTHORIZATION");
  await ctx.db.patch(g._id,{oauthToken:a.encryptedToken});
}});
export const authenticated=mutation({args:{...base,provider,userId:v.string(),proofHash:v.optional(v.string()),stateHash:v.optional(v.string()),attempt:v.optional(v.string())},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");const {g}=await readGrant(ctx,a);
  if(g.provider!==a.provider||g.userId!==a.userId)exportFail("AUTHORIZATION");
  if(g.provider==="telegram"){
    if(!a.proofHash)exportFail("AUTHORIZATION");exportDigest(a.proofHash);
    const used=await ctx.db.query("walletExportProofs").withIndex("by_hash",q=>q.eq("hash",a.proofHash!)).unique();
    if(used?.grantId===g._id&&g.state==="authenticated")return;
    if(used)throw Error("Telegram proof was already used. Reopen the Mini App.");
    if(g.state!=="pending")exportFail("AUTHORIZATION");
    await ctx.db.insert("walletExportProofs",{hash:a.proofHash,grantId:g._id,expiresAt:g.expiresAt});
  }else{
    if(g.oauthState!==a.stateHash||g.oauthAttempt!==a.attempt||!g.oauthUsedAt)exportFail("AUTHORIZATION");
    if(g.state==="authenticated")return;
    if(g.state!=="pending"||!g.oauthToken||(g.oauthLeaseUntil??0)<=Date.now())exportFail("OAUTH_RESTART");
  }
  await ctx.db.patch(g._id,{state:"authenticated",authenticatedAt:Date.now(),oauthVerifier:undefined,oauthToken:undefined,oauthLeaseUntil:undefined});await audit(ctx,g.accountId,"identity_verified",g._id);
}});
export const approve=mutation({args:{...base,publicKey:v.string(),keyHash:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");exportDigest(a.keyHash);const {g}=await readGrant(ctx,a);
  if(g.state==="approved"&&g.publicKey===a.publicKey&&g.keyHash===a.keyHash&&g.approvedAt&&Date.now()-g.approvedAt<=EXPORT_APPROVAL_MS)return;
  if(g.state!=="authenticated"||a.publicKey.length>1200||!a.publicKey)throw Error("Fresh export approval is required.");
  await ctx.db.patch(g._id,{state:"approved",publicKey:a.publicKey,keyHash:a.keyHash,approvedAt:Date.now()});await audit(ctx,g.accountId,"approved",g._id);
}});
export const begin=mutation({args:{...base,keyHash:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");const {g,account}=await readGrant(ctx,a);exportDigest(a.keyHash);
  if(g.keyHash!==a.keyHash||!g.publicKey)throw Error("Approved encryption key changed.");
  if(g.state==="exporting"||g.state==="relayed"){
    if(account.fenceGrant!==g.ticketHash||(account.fenceUntil??0)<=Date.now())throw Error("Export retry expired. Start again.");
  }else{
    if(g.state!=="approved"||!g.approvedAt||Date.now()-g.approvedAt>EXPORT_APPROVAL_MS)throw Error("Export approval expired.");
    if((account.fenceUntil??0)>Date.now())throw Error("Another export is in progress.");
    for(const chain of [5042,8453] as const){const row=await ctx.db.query("otcRecords").withIndex("by_key",q=>q.eq("key",walletId(chain,account.address))).unique();if(row){const w=JSON.parse(row.json) as Wallet;if(w.activeTx||Object.values(w.holds).some(v=>BigInt(v)>0n)||Object.values(w.usdcHolds??{}).some(v=>BigInt(v)>0n))exportFail("PENDING_TRANSACTIONS");}}
    // Include orphaned records, scoped to this wallet rather than a global backlog.
    for(const state of ["prepared","signed","submitted"]){
      const pending=await ctx.db.query("otcRecords").withIndex("by_wallet_status",q=>q.eq("normalizedWallet",account.address).eq("kind","transaction").eq("status",state)).take(1);
      if(pending.length)exportFail("PENDING_TRANSACTIONS");
    }
    await ctx.db.patch(account._id,{fenceGrant:g.ticketHash,fenceUntil:Date.now()+EXPORT_LEASE_MS,externalControlPossibleAt:account.externalControlPossibleAt??Date.now()});
    await ctx.db.patch(g._id,{state:"exporting",exportingAt:Date.now(),exportId:crypto.randomUUID()});await audit(ctx,account._id,"export_started",g._id);
  }
  const saved=(await ctx.db.get(g._id))!;
  return {address:account.address,projectId:account.projectId,cdpAccountName:account.cdpAccountName,publicKey:saved.publicKey!,exportId:saved.exportId!};
}});
export const relayed=mutation({args:{...base,keyHash:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");const {g,account}=await readGrant(ctx,a);
  if(!["exporting","relayed"].includes(g.state)||g.keyHash!==a.keyHash||account.fenceGrant!==g.ticketHash||(account.fenceUntil??0)<=Date.now())throw Error("Export authorization changed.");
  if(g.state!=="relayed"){await ctx.db.patch(g._id,{state:"relayed",relayedAt:Date.now()});await audit(ctx,g.accountId,"response_authorized",g._id);}
  return true;
}});
export const close=mutation({args:{...base,acknowledged:v.boolean()},handler:async(ctx,a)=>{
  authorize(a.secret,"WALLET_EXPORT_SERVICE_SECRET");const {g,account}=await readGrant(ctx,a);
  if(a.acknowledged&&g.state!=="relayed")throw Error("No export response was authorized.");
  await ctx.db.patch(g._id,{state:"revoked",oauthVerifier:undefined,oauthToken:undefined,publicKey:undefined,...(a.acknowledged?{acknowledgedAt:Date.now()}:{})});
  if(account.fenceGrant===g.ticketHash)await ctx.db.patch(account._id,{fenceGrant:undefined,fenceUntil:undefined});
  await audit(ctx,g.accountId,a.acknowledged?"client_acknowledged":"closed",g._id);
}});
