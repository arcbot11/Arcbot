import {internalMutation} from "./_generated/server";
import {makeFunctionReference} from "convex/server";
import {walletExportIndexes} from "./lib/walletExportIndexes";
import type {RecordValue} from "../lib/otc/model";

/** Persist cursor + readiness atomically. New writes maintain indexes while this runs. */
export const migrate=internalMutation({args:{},handler:async ctx=>{
  let progress=await ctx.db.query("walletExportMigration").withIndex("by_key",q=>q.eq("key","v1")).unique();
  if(!progress){const id=await ctx.db.insert("walletExportMigration",{key:"v1",table:"cryptoWallets",cursor:null,ready:false});progress=(await ctx.db.get(id))!;}
  if(progress.ready)return;
  const table=progress.table;
  const page=await ctx.db.query(table).paginate({cursor:progress.cursor,numItems:100});
  for(const row of page.page){
    if("json" in row)await ctx.db.patch(row._id,walletExportIndexes(JSON.parse(row.json) as RecordValue));
    else await ctx.db.patch(row._id,{normalizedAddress:row.address.toLowerCase()});
  }
  const next=table==="cryptoWallets"?"telegramNativeWallets":"otcRecords";
  const ready=page.isDone&&table==="otcRecords";
  await ctx.db.patch(progress._id,{table:page.isDone?next:table,cursor:page.isDone?null:page.continueCursor,ready});
  if(!ready)await ctx.scheduler.runAfter(0,makeFunctionReference<"mutation">("walletExportMaintenance:migrate"),{});
}});

/** Bounded cleanup. Audit contains identifiers and stages only, retained 90 days. */
export const cleanup=internalMutation({args:{},handler:async ctx=>{
  const now=Date.now();
  // Recover even an action interrupted before its first delivery lease committed.
  const deliveries=await ctx.db.query("walletExportGrants").withIndex("by_telegram_delivery",q=>q.gt("telegramDeliveryDueAt",0).lt("telegramDeliveryDueAt",now)).take(100);
  for(const g of deliveries){
    if(g.expiresAt<=now||g.state!=="pending"||g.telegramDeliveredAt){await ctx.db.patch(g._id,{telegramDeliveryDueAt:undefined});continue;}
    await ctx.db.patch(g._id,{telegramDeliveryDueAt:now+30000});
    await ctx.scheduler.runAfter(0,makeFunctionReference<"action">("telegram:deliverKeyExport"),{grantId:g._id});
  }
  const confirmations=await ctx.db.query("walletExportConfirmations").withIndex("by_delivery",q=>q.gt("deliveryDueAt",0).lt("deliveryDueAt",now)).take(100);
  for(const c of confirmations){
    if(c.expiresAt<=now||c.consumedAt||c.deliveredAt){await ctx.db.patch(c._id,{deliveryDueAt:undefined});continue;}
    await ctx.db.patch(c._id,{deliveryDueAt:now+30000});
    await ctx.scheduler.runAfter(0,makeFunctionReference<"action">("telegram:deliverExportConfirmation"),{confirmationId:c._id,updateId:c.updateId});
  }
  const groups=[
    await ctx.db.query("walletExportAttempts").withIndex("by_expiry",q=>q.lt("expiresAt",now)).take(100),
    await ctx.db.query("walletExportGrants").withIndex("by_expiry",q=>q.lt("expiresAt",now)).take(100),
    // Keep spent proof digests past their maximum cryptographic freshness window.
    await ctx.db.query("walletExportProofs").withIndex("by_expiry",q=>q.lt("expiresAt",now-300000)).take(100),
    await ctx.db.query("walletExportConfirmations").withIndex("by_expiry",q=>q.lt("expiresAt",now)).take(100),
    await ctx.db.query("walletExportLimits").withIndex("by_expiry",q=>q.lt("resetAt",now)).take(100),
    await ctx.db.query("walletExportAudit").withIndex("by_time",q=>q.lt("at",now-90*86400000)).take(100),
  ];
  for(const rows of groups)for(const row of rows)await ctx.db.delete(row._id);
  if(groups.some(rows=>rows.length===100))await ctx.scheduler.runAfter(1000,makeFunctionReference<"mutation">("walletExportMaintenance:cleanup"),{});
}});
