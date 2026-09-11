import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { RecordValue, Store, Transaction } from "../../lib/otc/model";
import { cancelUnsignedTrade, neverSigned } from "../../lib/otc/unsigned-recovery";

/** Revoke only this link's unsigned work; signed work remains recoverable. */
export async function releaseUnsignedTelegramWork(ctx: MutationCtx, link: Doc<"telegramAccountLinks">, now: number) {
  const records = await ctx.db.query("otcRecords").withIndex("by_owner", q => q.eq("owner", link.ownerXUserId).eq("kind", "transaction"))
    .filter(q => q.eq(q.field("status"), "prepared")).collect();
  const store: Store = {
    get: async <T extends RecordValue>(id: string) => {
      const row = await ctx.db.query("otcRecords").withIndex("by_key", q => q.eq("key", id)).unique();
      return row ? JSON.parse(row.json) as T : null;
    },
    put: async record => {
      const row = await ctx.db.query("otcRecords").withIndex("by_key", q => q.eq("key", record.id)).unique();
      if (!row) throw Error("Missing transaction reservation.");
      await ctx.db.patch(row._id, { status: "status" in record ? record.status : "wallet", json: JSON.stringify(record), updatedAt: now });
    },
  };
  for (const row of records) {
    const tx = JSON.parse(row.json) as Transaction;
    if (!neverSigned(tx) || tx.escrowRef || tx.orderId || !tx.sourceRequestId) continue;
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", q => q.eq("requestId", tx.sourceRequestId!)).unique();
    if (request?.source !== "telegram" || !request.telegramUpdateId) continue;
    const update = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", request.telegramUpdateId!)).unique();
    if (update?.boundLinkId === link._id) await cancelUnsignedTrade(store, tx.id, now, link.ownerXUserId);
  }
}
