import { mutation, query, action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createListing, createQuote, acceptQuote, cancelListing, finishOrder, marketStats, type Store, type RecordValue, type Order, type Listing } from "../lib/otc/model";
import { prepareTransaction, signTransactionRecord, submitted, settled } from "../lib/otc/transactions";

function authorize(secret: string) {
  if (!process.env.OTC_SERVICE_SECRET || secret !== process.env.OTC_SERVICE_SECRET) throw new Error("OTC service authorization failed.");
}
export const identity = query({args:{secret:v.string(),owner:v.string(),address:v.string()},handler:async(ctx,args)=>{
  authorize(args.secret);
  const records=await ctx.db.query("cryptoWallets").withIndex("by_owner_x_user_id",q=>q.eq("ownerXUserId",args.owner)).collect();
  return records.some(wallet=>wallet.status==="active"&&wallet.address.toLowerCase()===args.address.toLowerCase());
}});
export const command = mutation({
  args: { secret: v.string(), command: v.string(), json: v.string() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    if (args.json.length > 32_768) throw new Error("OTC request too large.");
    const input = JSON.parse(args.json), now = Date.now();
    const store: Store = {
      get: async <T extends RecordValue>(id: string) => {
        const row = await ctx.db.query("otcRecords").withIndex("by_key", q=>q.eq("key",id)).unique();
        return row ? JSON.parse(row.json) as T : null;
      },
      put: async record => {
        const row = await ctx.db.query("otcRecords").withIndex("by_key", q=>q.eq("key",record.id)).unique();
        const value = { key: record.id, kind: record.kind, owner: record.owner, ...(record.kind === "order" ? { counterparty: record.sellerOwner } : {}),
          status: "status" in record ? record.status : "wallet", updatedAt: now, json: JSON.stringify(record) };
        if (row) await ctx.db.replace(row._id, value); else await ctx.db.insert("otcRecords",value);
      },
    };
    switch(args.command) {
      case "listing": return createListing(store,input,now);
      case "quote": {
        const open = await ctx.db.query("otcRecords").withIndex("by_owner",q=>q.eq("owner",input.owner).eq("kind","order")).filter(q=>q.eq(q.field("status"),"quoted")).collect();
        for (const row of open) {
          const order = JSON.parse(row.json) as Order;
          if (order.id === input.id) return order;
          if (order.expiresAt > now) throw new Error("You already have a quote. Confirm it or wait for it to expire.");
          await finishOrder(store,order,"expired",now);
        }
        return createQuote(store,input,now);
      }
      case "accept": return acceptQuote(store,input.id,input.owner,input.snapshot,now);
      case "cancel": return cancelListing(store,input.id,input.owner,now);
      case "expire": {
        const order = await store.get<Order>(input.id);
        if (!order) throw new Error("Order missing.");
        return finishOrder(store,order,"expired",now);
      }
      case "prepare": return prepareTransaction(store,input,now);
      case "sign": return signTransactionRecord(store,input.id,input.raw,input.hash,now);
      case "submitted": return submitted(store,input.id,now);
      case "settled": return settled(store,input.id,input.block,input.success,now);
      case "touch": {
        const record=await store.get<RecordValue>(input.id);
        if(record){record.updatedAt=now;await store.put(record);} return null;
      }
      case "note": {
        const record = await store.get<Order>(input.id);
        if (!record || !["order","transaction"].includes(record.kind)) throw new Error("Record missing.");
        record.note = String(input.note).slice(0,240); record.updatedAt = now; await store.put(record); return null;
      }
      default: throw new Error("Unknown OTC command.");
    }
  },
});

export const read = query({
  args: { secret: v.string(), id: v.optional(v.string()), owner: v.optional(v.string()), work: v.optional(v.boolean()) },
  handler: async (ctx,args) => {
    authorize(args.secret);
    if (args.id) {
      const row = await ctx.db.query("otcRecords").withIndex("by_key",q=>q.eq("key",args.id!)).unique();
      return row ? JSON.parse(row.json) : null;
    }
    if (args.owner) {
      const [owned, received] = await Promise.all([
        ctx.db.query("otcRecords").withIndex("by_owner",q=>q.eq("owner",args.owner!)).collect(),
        ctx.db.query("otcRecords").withIndex("by_counterparty",q=>q.eq("counterparty",args.owner!)).collect(),
      ]);
      return [...new Map([...owned,...received].map(r=>[r.key,JSON.parse(r.json)])).values()];
    }
    if (args.work) {
      const statuses = ["quoted","payment_pending","payment_submitted","payment_finalized","payout_submitted"];
      const rows = (await Promise.all(statuses.map(status=>ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","order").eq("status",status)).order("asc").take(50)))).flat();
      const txs = (await Promise.all(["prepared","signed","submitted"].map(status=>ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","transaction").eq("status",status)).take(50)))).flat();
      return [...rows,...txs].map(r=>JSON.parse(r.json));
    }
    const rows = await ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","listing").eq("status","active")).collect();
    const listings = rows.map(r=>JSON.parse(r.json) as Listing).filter(l=>BigInt(l.available)>=10_000_000n).sort((a,b)=>a.premiumBps-b.premiumBps || a.createdAt-b.createdAt);
    return { listings: listings.map(({id,seller,premiumBps,available,createdAt})=>({id,seller,premiumBps,available,createdAt})), stats: marketStats(listings) };
  },
});

// Schedule this internal service endpoint in the deployment's scheduler. It does not depend on a browser remaining open.
export const wakeWorker = action({
  args: { secret: v.string() }, handler: async (_ctx,args) => {
    authorize(args.secret);
    const url = process.env.OTC_WORKER_URL;
    if (!url || !url.startsWith("https://")) throw new Error("OTC worker URL is not configured.");
    const response = await fetch(url,{ method:"POST",headers:{authorization:`Bearer ${args.secret}`} });
    if (!response.ok) throw new Error("OTC settlement worker failed.");
    return { ok:true };
  },
});

export const tick = internalAction({args:{},handler:async()=>{
  const secret=process.env.OTC_SERVICE_SECRET,url=process.env.OTC_WORKER_URL;
  if(!secret&&!url)return;
  if(!secret||!url||!url.startsWith("https://"))throw new Error("Wallet worker configuration missing.");
  const response=await fetch(url,{method:"POST",headers:{authorization:`Bearer ${secret}`}});
  if(!response.ok)throw new Error("OTC worker failed.");
}});
