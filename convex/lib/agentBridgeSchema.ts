import { defineTable } from "convex/server";
import { v } from "convex/values";
export const agentBridgeTables = {
  agentBridgeJobs: defineTable({
    jobId: v.string(),
    paymentId: v.string(),
    json: v.string(),
    revision: v.number(),
    poll: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_poll", ["poll", "updatedAt"]),
  agentBridgeWalletReservations: defineTable({
    wallet: v.string(),
    jobId: v.string(),
    stepId: v.string(),
  }).index("by_wallet", ["wallet"]),
};
