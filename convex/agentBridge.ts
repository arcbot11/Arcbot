import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Job } from "../lib/agent-bridge/model";
function authorize(secret: string) {
  if (
    !process.env.BRIDGE_AGENT_SERVICE_SECRET ||
    secret !== process.env.BRIDGE_AGENT_SERVICE_SECRET
  )
    throw Error("Unauthorized");
}
function parse(json: string): Job {
  if (json.length > 250000) throw Error("Job too large");
  const j = JSON.parse(json) as Job;
  if (!/^ab_[a-f0-9]{48}$/.test(j.id) || j.steps.length > 16)
    throw Error("Invalid job");
  return j;
}
export const create = mutation({
  args: { secret: v.string(), json: v.string() },
  handler: async (ctx, a) => {
    authorize(a.secret);
    const j = parse(a.json);
    const old = await ctx.db
      .query("agentBridgeJobs")
      .withIndex("by_job", (q) => q.eq("jobId", j.id))
      .unique();
    if (old) {
      const prior = JSON.parse(old.json) as Job;
      if (JSON.stringify(prior.intent) !== JSON.stringify(j.intent))
        throw Error("Client request ID belongs to another intent");
      if (old.paymentId === j.paymentId) return prior;
      const payment = await ctx.db
        .query("bridgeApiRequests")
        .withIndex("by_request", (q) => q.eq("requestId", old.paymentId))
        .unique();
      if (
        !payment ||
        !["not_charged", "expired"].includes(payment.state) ||
        payment.receiptJson ||
        prior.steps.length
      )
        throw Error(
          "Client request ID already used; recover the original payment",
        );
      await ctx.db.patch(old._id, {
        paymentId: j.paymentId,
        json: a.json,
        revision: 0,
        poll: false,
        updatedAt: Date.now(),
      });
      return j;
    }
    await ctx.db.insert("agentBridgeJobs", {
      jobId: j.id,
      paymentId: j.paymentId,
      json: a.json,
      revision: 0,
      poll: false,
      updatedAt: Date.now(),
    });
    return j;
  },
});
export const get = query({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, a) => {
    authorize(a.secret);
    const row = await ctx.db
      .query("agentBridgeJobs")
      .withIndex("by_job", (q) => q.eq("jobId", a.id))
      .unique();
    if (!row) return null;
    const payment = await ctx.db
      .query("bridgeApiRequests")
      .withIndex("by_request", (q) => q.eq("requestId", row.paymentId))
      .unique();
    // Successful receipt survives the paid-response recovery TTL. Jobs do not expire while funds are in flight.
    if (
      !payment ||
      !["settled", "expired"].includes(payment.state) ||
      !payment.receiptJson ||
      !JSON.parse(payment.receiptJson).success
    )
      throw Error(
        "Job payment has not settled; retry the original paid request",
      );
    return JSON.parse(row.json);
  },
});
export const save = mutation({
  args: {
    secret: v.string(),
    json: v.string(),
    expected: v.number(),
    reservation: v.union(
      v.literal("keep"),
      v.literal("acquire"),
      v.literal("release"),
    ),
  },
  handler: async (ctx, a) => {
    authorize(a.secret);
    const j = parse(a.json);
    const row = await ctx.db
      .query("agentBridgeJobs")
      .withIndex("by_job", (q) => q.eq("jobId", j.id))
      .unique();
    if (!row || row.revision !== a.expected)
      throw Error("Job changed; read and retry");
    const old = JSON.parse(row.json) as Job;
    if (
      JSON.stringify(old.intent) !== JSON.stringify(j.intent) ||
      old.paymentId !== j.paymentId ||
      j.revision !== a.expected + 1
    )
      throw Error("Job identity changed");
    const wallet = `${j.intent.chain}:${j.intent.account.toLowerCase()}`,
      step = j.steps.at(-1);
    const held = await ctx.db
      .query("agentBridgeWalletReservations")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .unique();
    if (a.reservation === "acquire") {
      if (!step || step.state !== "armed") throw Error("Invalid reservation");
      if (held && (held.jobId !== j.id || held.stepId !== step.id))
        throw Error("Another transaction is awaiting wallet reconciliation");
      if (!held)
        await ctx.db.insert("agentBridgeWalletReservations", {
          wallet,
          jobId: j.id,
          stepId: step.id,
        });
    }
    if (a.reservation === "release" && held?.jobId === j.id) {
      if (!step?.observation?.binding?.finalized)
        throw Error(
          "Finalized source evidence required to release reservation",
        );
      await ctx.db.delete(held._id);
    }
    await ctx.db.patch(row._id, {
      json: a.json,
      revision: j.revision,
      poll: !!step?.hash && !["complete", "failed"].includes(j.state),
      updatedAt: Date.now(),
    });
    return j;
  },
});
export const due = query({
  args: { secret: v.string() },
  handler: async (ctx, a) => {
    authorize(a.secret);
    return (
      await ctx.db
        .query("agentBridgeJobs")
        .withIndex("by_poll", (q) => q.eq("poll", true))
        .take(10)
    ).map((r) => r.jobId);
  },
});
export const defer = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, a) => {
    authorize(a.secret);
    const row = await ctx.db
      .query("agentBridgeJobs")
      .withIndex("by_job", (q) => q.eq("jobId", a.id))
      .unique();
    if (row) await ctx.db.patch(row._id, { updatedAt: Date.now() });
  },
});
