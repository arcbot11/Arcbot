import { defineTable } from "convex/server";
import { v } from "convex/values";
export const bridgeApiTables = {
  bridgeTokenPairs: defineTable({ tokenId: v.string(), arcAddress: v.string(), baseAddress: v.string(), originalChain: v.number(), json: v.string(), verifiedAt: v.number() })
    .index("by_token_id", ["tokenId"]).index("by_arc", ["arcAddress"]).index("by_base", ["baseAddress"]),
  bridgeLookupCache: defineTable({ key: v.string(), json: v.string(), expiresAt: v.number() }).index("by_key", ["key"]).index("by_expiry", ["expiresAt"]),
  bridgeApiLimits: defineTable({ key: v.string(), count: v.number(), expiresAt: v.number() }).index("by_key", ["key"]).index("by_expiry", ["expiresAt"]),
  bridgeApiRequests: defineTable({ paymentKey: v.string(), inputKey: v.string(), recoveryHash: v.string(), requestId: v.string(), state: v.string(), resultJson: v.optional(v.string()), receiptJson: v.optional(v.string()), createdAt: v.number(), expiresAt: v.number(), purgeAt: v.number() })
    .index("by_payment", ["paymentKey"]).index("by_request", ["requestId"]).index("by_expiry", ["expiresAt"]).index("by_purge", ["purgeAt"]),
};
