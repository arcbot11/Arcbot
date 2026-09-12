import { v } from "convex/values";
import { mutation, internalMutation, type MutationCtx } from "./_generated/server";
const FAMILY_TTL = 30 * 86400_000;
export function authorizeWeb(secret: string) {
  if (!process.env.WEB_AUTH_SECRET || secret !== process.env.WEB_AUTH_SECRET) throw Error("Unauthorized.");
}
const digest = (s: string) => /^[a-f0-9]{64}$/.test(s);
async function revokeHash(ctx: MutationCtx, hash: string | undefined) {
  if (!hash) return;
  const x = await ctx.db.query("webWalletSessions").withIndex("by_session_hash", q => q.eq("sessionIdHash", hash)).unique();
  const tg = await ctx.db.query("telegramWebLogins").withIndex("by_session", q => q.eq("sessionIdHash", hash)).unique();
  if (x && !x.revokedAt) await ctx.db.patch(x._id, { revokedAt: Date.now(), updatedAt: Date.now() });
  if (tg && !tg.revokedAt) await ctx.db.patch(tg._id, { revokedAt: Date.now() });
}
export async function takeLoginLimit(ctx: MutationCtx, browserHash: string, sourceHash: string) {
  const limits = [[`browser:${browserHash}`, 5], [`source:${sourceHash}`, 20], ["global", 300]] as const;
  for (const [key, max] of limits) {
    const row = await ctx.db.query("webAuthLimits").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row && row.resetAt > Date.now() && row.count >= max) throw Error("Sign-in limit reached. Try again in a minute.");
    if (row) await ctx.db.patch(row._id, { count: row.resetAt > Date.now() ? row.count + 1 : 1, resetAt: row.resetAt > Date.now() ? row.resetAt : Date.now() + 60_000 });
    else await ctx.db.insert("webAuthLimits", { key, count: 1, resetAt: Date.now() + 60_000 });
  }
}
export async function beginBrowser(ctx: MutationCtx, browserHash: string, previousSessionHash?: string) {
  if (!digest(browserHash) || (previousSessionHash && !digest(previousSessionHash))) throw Error("Invalid browser.");
  const row = await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", browserHash)).unique();
  const generation = (row?.generation ?? 0) + 1;
  const fields = { generation, expiresAt: Date.now() + FAMILY_TTL, ...(previousSessionHash ? { previousSessionHash } : {}) };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("webAuthBrowsers", { browserHash, ...fields });
  return generation;
}
export async function activateBrowser(ctx: MutationCtx, browserHash: string, generation: number, sessionIdHash: string, expiresAt: number) {
  const row = await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", browserHash)).unique();
  if (!row || row.generation !== generation || row.expiresAt <= Date.now()) return false;
  // A generation can activate only once. Retrying that same session is safe.
  if (row.activeSessionHash === sessionIdHash) return (row.activeExpiresAt ?? 0) > Date.now();
  if (row.activeGeneration === generation) return false;
  await revokeHash(ctx, row.activeSessionHash);
  await revokeHash(ctx, row.previousSessionHash);
  await ctx.db.patch(row._id, { activeSessionHash: sessionIdHash, activeExpiresAt: expiresAt, activeGeneration: generation, previousSessionHash: undefined });
  return true;
}
export const begin = mutation({ args: { secret: v.string(), browserHash: v.string(), sourceHash: v.string(), previousSessionHash: v.optional(v.string()) }, handler: async (ctx, a) => {
  authorizeWeb(a.secret); if (!digest(a.sourceHash)) throw Error("Invalid source.");
  await takeLoginLimit(ctx, a.browserHash, a.sourceHash);
  return { generation: await beginBrowser(ctx, a.browserHash, a.previousSessionHash) };
} });
export const activate = mutation({ args: { secret: v.string(), browserHash: v.string(), generation: v.number(), sessionIdHash: v.string(), expiresAt: v.number() }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  if (!digest(a.sessionIdHash) || !Number.isSafeInteger(a.generation) || a.expiresAt > Date.now() + 7_200_000 || a.expiresAt <= Date.now()) throw Error("Invalid session.");
  return activateBrowser(ctx, a.browserHash, a.generation, a.sessionIdHash, a.expiresAt);
} });
export const check = mutation({ args: { secret: v.string(), browserHash: v.string(), sessionIdHash: v.optional(v.string()), generation: v.optional(v.number()) }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  const row = await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", a.browserHash)).unique();
  if (!row || row.expiresAt <= Date.now()) return false;
  return a.sessionIdHash ? row.activeSessionHash === a.sessionIdHash && (row.activeExpiresAt ?? 0) > Date.now() : row.generation === a.generation;
} });
export const keepSession = mutation({ args: { secret: v.string(), browserHash: v.string(), sessionIdHash: v.string() }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  const row = await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", a.browserHash)).unique();
  if (!row) return true;
  if (row.activeSessionHash && row.activeSessionHash !== a.sessionIdHash) return false;
  // Choosing the currently signed-in account cancels a competing unfinished login.
  await ctx.db.patch(row._id, { generation: row.generation + 1 });
  return true;
} });
export const logout = mutation({ args: { secret: v.string(), browserHash: v.string(), previousSessionHash: v.optional(v.string()) }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  const row = await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", a.browserHash)).unique();
  await revokeHash(ctx, a.previousSessionHash);
  if (row) {
    await revokeHash(ctx, row.activeSessionHash); await revokeHash(ctx, row.previousSessionHash);
    await ctx.db.patch(row._id, { generation: row.generation + 1, activeSessionHash: undefined, activeExpiresAt: undefined, previousSessionHash: undefined });
  }
} });
export const cleanup = internalMutation({ args: {}, handler: async ctx => {
  for (const row of await ctx.db.query("webXOAuthAttempts").withIndex("by_expiry", q => q.lt("expiresAt", Date.now())).take(500)) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("telegramWebLogins").withIndex("by_expiry", q => q.lt("expiresAt", Date.now() - 7_200_000)).take(500)) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("webAuthBrowsers").withIndex("by_expiry", q => q.lt("expiresAt", Date.now())).take(500)) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("webAuthLimits").withIndex("by_expiry", q => q.lt("resetAt", Date.now() - 60_000)).take(1000)) await ctx.db.delete(row._id);
} });

// Only the website server can access ciphertext. Browsers never receive OAuth credentials.
export const xStart = mutation({ args: { secret: v.string(), stateHash: v.string(), encrypted: v.string(), browserFamily: v.optional(v.string()), generation: v.optional(v.number()) }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  if (!digest(a.stateHash) || a.encrypted.length > 20000) throw Error("Invalid attempt.");
  const existing = await ctx.db.query("webXOAuthAttempts").withIndex("by_state", q => q.eq("stateHash", a.stateHash)).unique();
  if (existing) throw Error("Attempt already exists.");
  await ctx.db.insert("webXOAuthAttempts", { stateHash: a.stateHash, encrypted: a.encrypted, expiresAt: Date.now() + 600_000, ...(a.browserFamily ? { browserFamily: a.browserFamily, generation: a.generation } : {}) });
} });
export const xLock = mutation({ args: { secret: v.string(), stateHash: v.string(), lease: v.string() }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  const row = await ctx.db.query("webXOAuthAttempts").withIndex("by_state", q => q.eq("stateHash", a.stateHash)).unique();
  if (!row || row.expiresAt <= Date.now()) return { status: "expired" as const };
  if (row.browserFamily) {
    const family = await ctx.db.query("webAuthBrowsers").withIndex("by_browser", q => q.eq("browserHash", row.browserFamily!)).unique();
    if (!family || family.generation !== row.generation || family.expiresAt <= Date.now()) return { status: "expired" as const };
  }
  if (row.lease && (row.leaseUntil ?? 0) > Date.now()) return { status: "busy" as const };
  await ctx.db.patch(row._id, { lease: a.lease, leaseUntil: Date.now() + 120_000 });
  return { status: "ready" as const, encrypted: row.encrypted };
} });
export const xSave = mutation({ args: { secret: v.string(), stateHash: v.string(), lease: v.string(), encrypted: v.string() }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  const row = await ctx.db.query("webXOAuthAttempts").withIndex("by_state", q => q.eq("stateHash", a.stateHash)).unique();
  if (!row || row.expiresAt <= Date.now() || row.lease !== a.lease || a.encrypted.length > 20000) throw Error("Attempt expired.");
  await ctx.db.patch(row._id, { encrypted: a.encrypted });
} });
export const xUnlock = mutation({ args: { secret: v.string(), stateHash: v.string(), lease: v.string() }, handler: async (ctx, a) => {
  authorizeWeb(a.secret);
  const row = await ctx.db.query("webXOAuthAttempts").withIndex("by_state", q => q.eq("stateHash", a.stateHash)).unique();
  if (row?.lease === a.lease) await ctx.db.patch(row._id, { lease: undefined, leaseUntil: undefined });
} });
