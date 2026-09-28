import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readOnlyReplyCategory, reserveLookupSlot, reserveWalletRequestSlot, walletLookupLimit, type BudgetedReplyCategory } from "../lib/x-wallet-flood-policy";

async function admitWalletRequest(ctx: MutationCtx, args: { postId: string; authorXUserId: string }) {
  const key = `wallet:user:${args.authorXUserId}:admission`;
  const budget = await ctx.db.query("xWalletLookupBudgets").withIndex("by_key", q => q.eq("key", key)).unique();
  // Carry forward any retained pre-rollout admission for this owner, without
  // reviving rejected work or letting the old global cap block other users.
  const legacy = budget ? null : await ctx.db.query("xWalletLookupBudgets").withIndex("by_key", q => q.eq("key", "admission")).unique();
  const now = Date.now();
  const decision = reserveWalletRequestSlot(budget?.slots ?? legacy?.slots ?? [], args.postId, args.authorXUserId, now);
  if (decision.allowed) {
    if (budget) await ctx.db.patch(budget._id, { slots: decision.slots, updatedAt: now });
    else await ctx.db.insert("xWalletLookupBudgets", { key, slots: decision.slots, updatedAt: now });
  }
  return decision.allowed;
}

// Live request admission: one wallet-address request per owner per 10 minutes.
// Balance/help have no category admission caps. Outgoing pacing is the queue's
// job. The publication branch is retained solely for legacy operator tooling;
// no live publication path calls it.
export async function suppressReadOnlyReply(ctx: MutationCtx, interaction: Doc<"xReplyInteractions">, publication = false) {
  if (interaction.walletLookupSuppressed || interaction.replySuppressedReason) return true;
  if (!publication) {

    if (readOnlyReplyCategory(interaction) !== "wallet") return false;
    if (interaction.walletLookupAdmittedAt !== undefined || interaction.responsePostId || interaction.publicationAttempted || interaction.status === "publishing") return false;
    if (!await admitWalletRequest(ctx, interaction)) {
      await rejectReadOnlyReply(ctx, interaction, "wallet"); return true;
    }
    await ctx.db.patch(interaction._id, { walletLookupAdmittedAt: Date.now() });
    return false;
  }
  const category = readOnlyReplyCategory(interaction);
  if (!category) return false;
  if (interaction.responsePostId || interaction.publicationAttempted || interaction.status === "publishing") return false;
  // Legacy operator-only publication reservation. The live durable queue does
  // not call this branch or use these category records.
  const key = category === "wallet" ? "publication" : `${category}:publication`;
  const budget = await ctx.db.query("xWalletLookupBudgets").withIndex("by_key", q => q.eq("key", key)).unique();
  const now = Date.now();
  const decision = reserveLookupSlot(budget?.slots ?? [], interaction.postId, interaction.authorXUserId, now, walletLookupLimit(), publication);
  if (!decision.allowed) {
    await rejectReadOnlyReply(ctx, interaction, category);
    return true;
  }
  if (budget) await ctx.db.patch(budget._id, { slots: decision.slots, updatedAt: now });
  else await ctx.db.insert("xWalletLookupBudgets", { key, slots: decision.slots, updatedAt: now });
  return false;
}

export async function rejectReadOnlyReply(ctx: MutationCtx, interaction: Doc<"xReplyInteractions">, category: BudgetedReplyCategory) {
  await ctx.db.patch(interaction._id, {
    ...(category === "wallet" ? { walletLookupSuppressed: true } : {}),
    replySuppressedReason: `${category}_reply_budget`,
    status: "rejected", nextRetryAt: undefined,
    safeError: `${category} reply budget exhausted; silently ignored`, updatedAt: Date.now(),
  });
}

// Failure notices are limited only at publication, after execution has already
// failed. This must never gate a launch/trade or take wallet/balance/help slots.
export async function suppressInsufficientEthReply(ctx: MutationCtx, interaction: Doc<"xReplyInteractions">, publicationKey?: string) {
  const key = "insufficient_eth:publication";
  const budget = await ctx.db.query("xWalletLookupBudgets").withIndex("by_key", q => q.eq("key", key)).unique();
  const now = Date.now();
  const decision = reserveLookupSlot(budget?.slots ?? [], publicationKey || interaction.postId, interaction.authorXUserId, now, 10, true, false);
  if (!decision.allowed) {
    await rejectReadOnlyReply(ctx, interaction, "insufficient_eth");
    return true;
  }
  if (budget) await ctx.db.patch(budget._id, { slots: decision.slots, updatedAt: now });
  else await ctx.db.insert("xWalletLookupBudgets", { key, slots: decision.slots, updatedAt: now });
  return false;
}

export const guardQueued = internalMutation({
  args: { postId: v.string() },
  handler: async (ctx, { postId }) => {
    const interaction = await ctx.db.query("xReplyInteractions").withIndex("by_post_id", q => q.eq("postId", postId)).unique();
    return { suppressed: interaction ? await suppressReadOnlyReply(ctx, interaction) : false };
  },
});

// Separate provider-call budgets; outgoing X queue limits alone do not bound
// API traffic. Every attempt counts globally; a lease serializes each post.
export const admitRadarScan = internalMutation({
  args: { postId: v.string(), authorXUserId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const scan = await ctx.db.query("xRadarScans").withIndex("by_post_id", q => q.eq("postId", args.postId)).unique();
    if (scan && scan.owner !== args.authorXUserId) throw Error("Radar owner mismatch");
    if (scan?.result !== undefined) return { kind: "cached" as const, message: scan.result };
    if (scan && scan.leaseUntil > now) return { kind: "busy" as const, waitMs: scan.leaseUntil - now };
    if ((scan?.attempts ?? 0) >= 4) return { kind: "exhausted" as const };
    const plans = [
      ...(!scan ? [{ key: `radar:user:${args.authorXUserId}`, window: 60_000, limit: 1 }] : []),
      { key: "radar:global", window: 3_600_000, limit: 200 },
    ];
    const updates = [];
    for (const plan of plans) {
      const row = await ctx.db.query("xWalletLookupBudgets").withIndex("by_key", q => q.eq("key", plan.key)).unique();
      const slots = (row?.slots ?? []).filter(s => s.at > now - plan.window);
      if (slots.length >= plan.limit) return { kind: "limited" as const };
      slots.push({ postId: args.postId, owner: args.authorXUserId, at: now });
      updates.push({ row, key: plan.key, slots });
    }
    for (const { row, key, slots } of updates) {
      if (row) await ctx.db.patch(row._id, { slots, updatedAt: now });
      else await ctx.db.insert("xWalletLookupBudgets", { key, slots, updatedAt: now });
    }
    const attempts = (scan?.attempts ?? 0) + 1;
    const state = { attempts, leaseUntil: now + 60_000, updatedAt: now };
    if (scan) await ctx.db.patch(scan._id, state);
    else await ctx.db.insert("xRadarScans", { postId: args.postId, owner: args.authorXUserId, ...state });
    return { kind: "attempt" as const, attempt: attempts };
  },
});

export const finishRadarScan = internalMutation({
  args: { postId: v.string(), attempt: v.number(), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scan = await ctx.db.query("xRadarScans").withIndex("by_post_id", q => q.eq("postId", args.postId)).unique();
    if (!scan || scan.attempts !== args.attempt || scan.result !== undefined) return false;
    await ctx.db.patch(scan._id, { result: args.message, leaseUntil: args.message === undefined ? Date.now() + 15_000 : 0, updatedAt: Date.now() });
    return true;
  },
});

export const savedRadarResult = internalQuery({
  args: { postId: v.string(), owner: v.string() },
  handler: async (ctx, args) => {
    const scan = await ctx.db.query("xRadarScans").withIndex("by_post_id", q => q.eq("postId", args.postId)).unique();
    if (scan && scan.owner !== args.owner) throw Error("Radar owner mismatch");
    return scan?.result ?? null;
  },
});

export const radarClarification = internalQuery({
  args: { parentPostId: v.string(), owner: v.string() },
  handler: async (ctx, args) => {
    const parent = await ctx.db.query("xReplyInteractions").withIndex("by_response_post_id", q => q.eq("responsePostId", args.parentPostId)).unique();
    return !!parent && parent.authorXUserId === args.owner && parent.commandKind === "token_scan_ca" && parent.updatedAt > Date.now() - 10 * 60_000;
  },
});

// Admit obvious read-only requests BEFORE their author profiles are fetched.
// Reserve the same admission slot guardQueued will reuse, but do not create an
// executable interaction until profile lookup succeeds. A failed X lookup can
// safely replay this post without either a stranded request or another slot.
export const admitBeforeProfile = internalMutation({
  args: { postId: v.string(), authorXUserId: v.string(), text: v.string(), parentPostId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("xReplyInteractions").withIndex("by_post_id", q => q.eq("postId", args.postId)).unique();
    if (existing) return false;

    const category = readOnlyReplyCategory(args);
    if (category !== "wallet") return true;
    const now = Date.now();
    if (!await admitWalletRequest(ctx, args)) {
      await ctx.db.insert("xReplyInteractions", {
        ...args, status: "rejected", createdAt: now, updatedAt: now,
        ...(category === "wallet" ? { walletLookupSuppressed: true } : {}),
        replySuppressedReason: `${category}_reply_budget`,
        safeError: `${category} reply budget exhausted; silently ignored`,
      });
      return false;
    }
    return true;
  },
});
