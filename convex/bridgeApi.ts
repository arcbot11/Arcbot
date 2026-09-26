import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { CACHE_MS, RECOVERY_MS, PRE_SETTLEMENT_LEASE_MS, type Pair, type Report } from "../lib/bridge-api/model";
function authorize(secret: string) {
  if (!process.env.BRIDGE_API_SERVICE_SECRET || secret !== process.env.BRIDGE_API_SERVICE_SECRET) throw Error("Unauthorized");
}
export const cache = query({ args: { secret: v.string(), key: v.string() }, handler: async (ctx, a) => {
  authorize(a.secret); const row = await ctx.db.query("bridgeLookupCache").withIndex("by_key", q => q.eq("key", a.key)).unique();
  return row && row.expiresAt > Date.now() ? { report: JSON.parse(row.json), expiresAt: row.expiresAt } : null;
}});
export const pair = query({ args: { secret: v.string(), chain: v.number(), token: v.string() }, handler: async (ctx, a) => {
  authorize(a.secret);
  if (![5042, 8453].includes(a.chain)) throw Error("Invalid chain");
  const row = a.chain === 5042 ? await ctx.db.query("bridgeTokenPairs").withIndex("by_arc", q => q.eq("arcAddress", a.token.toLowerCase())).unique()
    : await ctx.db.query("bridgeTokenPairs").withIndex("by_base", q => q.eq("baseAddress", a.token.toLowerCase())).unique();
  return row ? JSON.parse(row.json) : null;
}});
export const save = mutation({ args: { secret: v.string(), key: v.string(), report: v.string(), pairs: v.string() }, handler: async (ctx, a) => {
  authorize(a.secret);
  if (a.report.length > 100000 || a.pairs.length > 30000) throw Error("Oversized report");
  const report = JSON.parse(a.report) as Report;
  if (report.status === "unavailable") throw Error("Cannot cache unavailable report");
  for (const p of JSON.parse(a.pairs) as Pair[]) {
    if (p.route.state !== "ready" || !/^0x[\da-f]{40}$/.test(p.arcAddress) || !/^0x[\da-f]{40}$/.test(p.baseAddress) || ![5042,8453].includes(p.originalChain)) throw Error("Invalid verified pair");
    const previous = await ctx.db.query("bridgeTokenPairs").withIndex("by_token_id", q => q.eq("tokenId", p.tokenId)).unique();
    if (previous && previous.verifiedAt > p.verifiedAt) continue;
    for (const other of [await ctx.db.query("bridgeTokenPairs").withIndex("by_arc", q => q.eq("arcAddress", p.arcAddress)).unique(), await ctx.db.query("bridgeTokenPairs").withIndex("by_base", q => q.eq("baseAddress", p.baseAddress)).unique()]) {
      if (other && other.tokenId !== p.tokenId) throw Error("Conflicting token pair; operator review required");
    }
    const row = { tokenId: p.tokenId, arcAddress: p.arcAddress, baseAddress: p.baseAddress, originalChain: p.originalChain, verifiedAt: p.verifiedAt, json: JSON.stringify(p) };
    if (previous) await ctx.db.patch(previous._id, row); else await ctx.db.insert("bridgeTokenPairs", row);
  }
  const previous = await ctx.db.query("bridgeLookupCache").withIndex("by_key", q => q.eq("key", a.key)).unique();
  const expiresAt = Math.min(Date.now(), Date.parse(report.observedAt)) + CACHE_MS;
  if (!Number.isFinite(expiresAt)) throw Error("Invalid observation time");
  if (!previous || previous.expiresAt <= expiresAt) {
    const row = { key: a.key, json: a.report, expiresAt };
    if (previous) await ctx.db.patch(previous._id, row); else await ctx.db.insert("bridgeLookupCache", row);
  }
}});
export const limit = mutation({ args: { secret: v.string(), key: v.string() }, handler: async (ctx, a) => {
  authorize(a.secret);
  // Global cap applies even if a deployment cannot supply a trustworthy client IP.
  const now = Date.now();
  const buckets = [];
  for (const [key, max] of [[a.key, 30], ["global", 600]] as const) {
    const row = await ctx.db.query("bridgeApiLimits").withIndex("by_key", q => q.eq("key", key)).unique();
    const fresh = !row || row.expiresAt <= now; const count = fresh ? 1 : row.count + 1;
    if (count > max) return false;
    buckets.push({ row, next: { key, count, expiresAt: fresh ? now + 60000 : row.expiresAt } });
  }
  // Convex commits both counters atomically, only for admitted requests.
  for (const { row, next } of buckets) {
    if (row) await ctx.db.patch(row._id, next); else await ctx.db.insert("bridgeApiLimits", next);
  }
  return true;
}});
export const claim = mutation({ args: { secret: v.string(), paymentKey: v.string(), inputKey: v.string(), recoveryHash: v.string(), requestId: v.string() }, handler: async (ctx, a) => {
  authorize(a.secret);
  const previous = await ctx.db.query("bridgeApiRequests").withIndex("by_payment", q => q.eq("paymentKey", a.paymentKey)).unique();
  if (previous) {
    if (previous.inputKey !== a.inputKey || previous.recoveryHash !== a.recoveryHash) return { kind: "conflict" };
    if (previous.expiresAt <= Date.now()) return { kind: "expired" };
    return { kind: "existing", request: previous };
  }
  const now = Date.now();
  await ctx.db.insert("bridgeApiRequests", { paymentKey: a.paymentKey, inputKey: a.inputKey, recoveryHash: a.recoveryHash, requestId: a.requestId, state: "processing", createdAt: now, expiresAt: now + RECOVERY_MS, purgeAt: now + RECOVERY_MS });
  return { kind: "claimed" };
}});
export const updateRequest = mutation({ args: { secret: v.string(), requestId: v.string(), state: v.union(v.literal("prepared"),v.literal("settling"),v.literal("settled"),v.literal("not_charged"),v.literal("uncertain")), resultJson: v.optional(v.string()), receiptJson: v.optional(v.string()) }, handler: async (ctx, a) => {
  authorize(a.secret);
  const row = await ctx.db.query("bridgeApiRequests").withIndex("by_request", q => q.eq("requestId", a.requestId)).unique();
  if (!row) throw Error("Request missing");
  // Fence late workers before they can cross the settlement boundary, even if
  // recovery has not yet converted the abandoned attempt to not_charged.
  if (["processing", "prepared"].includes(row.state) && a.state !== "not_charged" &&
      row.createdAt + PRE_SETTLEMENT_LEASE_MS <= Date.now()) throw Error("Payment processing lease expired");
  // Repeated successful reconciliation is idempotent; never downgrade a settled attempt.
  if (row.state === "settled" && a.state === "settled") return;
  const transitions: Record<string, string[]> = { processing: ["prepared","not_charged"], prepared: ["settling","not_charged"], settling: ["settled","uncertain"], uncertain: ["settled"], settled: [], not_charged: [] };
  if (!transitions[row.state]?.includes(a.state)) throw Error("Invalid payment transition");
  if ((a.resultJson?.length || 0) > 100000 || (a.receiptJson?.length || 0) > 20000) throw Error("Oversized response");
  await ctx.db.patch(row._id, { state: a.state, ...(a.resultJson ? { resultJson: a.resultJson } : {}), ...(a.receiptJson ? { receiptJson: a.receiptJson } : {}) });
}});
export const recover = mutation({ args: { secret: v.string(), requestId: v.string(), recoveryHash: v.string() }, handler: async (ctx,a) => {
  authorize(a.secret);
  const row = await ctx.db.query("bridgeApiRequests").withIndex("by_request", q => q.eq("requestId", a.requestId)).unique();
  if (!row || row.recoveryHash !== a.recoveryHash || row.expiresAt <= Date.now() || row.state === "expired") return null;
  // No settlement was allowed before settling was persisted. Expiring only
  // these states is safe; settling/uncertain must remain reconciliation-only.
  if (["processing", "prepared"].includes(row.state) && row.createdAt + PRE_SETTLEMENT_LEASE_MS <= Date.now()) {
    await ctx.db.patch(row._id, { state: "not_charged", resultJson: undefined });
    return { requestId: row.requestId, inputKey: row.inputKey, state: "not_charged" };
  }
  return { requestId: row.requestId, inputKey: row.inputKey, state: row.state, ...(row.state === "settled" ? { resultJson: row.resultJson, receiptJson: row.receiptJson } : {}) };
}});
export const cleanup = internalMutation({ args: {}, handler: async ctx => {
  let more = false;
  const now = Date.now();
  for (const table of ["bridgeLookupCache", "bridgeApiLimits"] as const) {
    // Reports can be large. Bound bytes as well as document counts per mutation.
    const batch = table === "bridgeLookupCache" ? 10 : 200;
    const rows = await ctx.db.query(table).withIndex("by_expiry", q => q.lt("expiresAt", now)).take(batch);
    more ||= rows.length === batch;
    for (const row of rows) await ctx.db.delete(row._id);
  }
  // Retain payment tombstones to prevent replay after recovery expires; erase bulky results.
  const rows = await ctx.db.query("bridgeApiRequests").withIndex("by_purge", q => q.lt("purgeAt", now)).take(10);
  more ||= rows.length === 10;
  for (const row of rows) await ctx.db.patch(row._id, { purgeAt: Number.MAX_SAFE_INTEGER,
    ...(row.state === "settled" || row.state === "not_charged" ? { resultJson: undefined, state: "expired" } : {}) });
  // Scheduling commits atomically with this batch. The cron is a fallback;
  // a backlog drains immediately instead of waiting five minutes per batch.
  if (more) await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("bridgeApi:cleanup"), {});
}});
