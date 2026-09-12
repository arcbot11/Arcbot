import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { activateBrowser, beginBrowser, takeLoginLimit } from "./webAuth";

function authorize(secret: string) {
  if (!process.env.WEB_AUTH_SECRET || secret !== process.env.WEB_AUTH_SECRET) throw Error("Unauthorized.");
}
const digest = (s: string) => /^[a-f0-9]{64}$/.test(s);
export const start = mutation({ args: { secret: v.string(), tokenHash: v.string(), browserHash: v.string(), code: v.string(), browserFamily: v.string(), sourceHash: v.string(), previousSessionHash: v.optional(v.string()), returnTo: v.optional(v.string()) }, handler: async (ctx, a) => {
  authorize(a.secret);
  if (!digest(a.tokenHash) || !digest(a.browserHash) || !/^[A-F0-9]{8}$/.test(a.code)) throw Error("Invalid challenge.");
  const existing = await ctx.db.query("telegramWebLogins").withIndex("by_token", q => q.eq("tokenHash", a.tokenHash)).unique();
  if (existing) throw Error("Challenge already exists.");
  if (!digest(a.sourceHash)) throw Error("Invalid source.");
  await takeLoginLimit(ctx, a.browserFamily, a.sourceHash);
  const generation = await beginBrowser(ctx, a.browserFamily, a.previousSessionHash);
  await ctx.db.insert("telegramWebLogins", { tokenHash: a.tokenHash, browserHash: a.browserHash, browserFamily: a.browserFamily, generation, code: a.code, expiresAt: Date.now() + 600_000, ...(a.returnTo ? { returnTo: a.returnTo } : {}) });
} });

// Called only by the authenticated bot webhook, using its durably recorded private-chat update.
export const respond = internalMutation({ args: { updateId: v.string(), tokenHash: v.string(), approve: v.boolean() }, handler: async (ctx, a) => {
  const update = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", a.updateId)).unique();
  if (!update?.telegramUserId || update.telegramChatId !== update.telegramUserId || update.walletTransitionBlocked) return { status: "invalid" as const };
  const row = await ctx.db.query("telegramWebLogins").withIndex("by_token", q => q.eq("tokenHash", a.tokenHash)).unique();
  if (!row || row.expiresAt <= Date.now() || row.revokedAt) return { status: "expired" as const };
  const family = row.browserFamily ? await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", row.browserFamily!)).unique() : null;
  if (!family || family.generation !== row.generation || family.expiresAt <= Date.now()) return { status: "expired" as const };
  const wallet = await ctx.db.query("telegramNativeWallets").withIndex("by_user", q => q.eq("telegramUserId", update.telegramUserId!)).unique();
  if (!wallet || wallet.telegramChatId !== update.telegramChatId) return { status: "no_wallet" as const };
  if (row.walletId && row.walletId !== wallet._id) return { status: "invalid" as const };
  if (a.approve && row.walletId !== wallet._id) return { status: "invalid" as const };
  if (a.approve) {
    if (!row.approvedAt) await ctx.db.patch(row._id, { approvedAt: Date.now() });
    return { status: "approved" as const };
  }
  if (!row.walletId) await ctx.db.patch(row._id, { walletId: wallet._id });
  return { status: "confirm" as const, code: row.code };
} });

// Exchange is idempotent only for the original browser. A retry cannot create another session.
export const exchange = mutation({ args: { secret: v.string(), tokenHash: v.string(), browserHash: v.string(), sessionIdHash: v.string(), browserFamily: v.string(), resume: v.optional(v.boolean()) }, handler: async (ctx, a) => {
  authorize(a.secret);
  if (![a.tokenHash,a.browserHash,a.sessionIdHash].every(digest)) throw Error("Invalid challenge.");
  const row = await ctx.db.query("telegramWebLogins").withIndex("by_token", q => q.eq("tokenHash", a.tokenHash)).unique();
  if (!row || row.browserHash !== a.browserHash || row.expiresAt <= Date.now() || row.revokedAt) return { status: "expired" as const };
  if (!row.browserFamily || row.browserFamily !== a.browserFamily || row.generation === undefined) return { status: "expired" as const };
  const family = await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", a.browserFamily)).unique();
  if (!family || family.generation !== row.generation) return { status: "expired" as const };
  if (!row.approvedAt || !row.walletId) return { status: "pending" as const, ...(a.resume ? { code: row.code, expiresAt: row.expiresAt, returnTo: row.returnTo } : {}) };
  if (row.sessionIdHash && row.sessionIdHash !== a.sessionIdHash) return { status: "expired" as const };
  const wallet = await ctx.db.get(row.walletId);
  if (!wallet || wallet.telegramUserId !== wallet.telegramChatId) return { status: "expired" as const };
  if (!await activateBrowser(ctx, row.browserFamily, row.generation, a.sessionIdHash, row.approvedAt + 7_200_000)) return { status: "expired" as const };
  if (!row.sessionIdHash) await ctx.db.patch(row._id, { sessionIdHash: a.sessionIdHash });
  return { status: "approved" as const, walletAddress: wallet.address, telegramUserId: wallet.telegramUserId, authenticatedAt: Math.floor(row.approvedAt / 1000), returnTo: row.returnTo };
} });

export const session = mutation({ args: { secret: v.string(), sessionIdHash: v.string(), telegramUserId: v.string(), revoke: v.boolean() }, handler: async (ctx, a) => {
  authorize(a.secret);
  const row = await ctx.db.query("telegramWebLogins").withIndex("by_session", q => q.eq("sessionIdHash", a.sessionIdHash)).unique();
  if (!row?.walletId || !row.approvedAt || row.revokedAt || row.approvedAt + 7_200_000 <= Date.now()) return false;
  const wallet = await ctx.db.get(row.walletId);
  if (!wallet || wallet.telegramUserId !== a.telegramUserId || wallet.telegramChatId !== a.telegramUserId) return false;
  if (a.revoke) await ctx.db.patch(row._id, { revokedAt: Date.now() });
  return true;
} });
