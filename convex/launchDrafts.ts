import { v } from "convex/values";
import { getAddress, keccak256, toHex, type Hex } from "viem";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { launchIdentity, launchFingerprint, parseLaunchInput } from "../lib/launches/input";
import { launchPreparationEnabled, LAUNCH_DRAFT_TTL_MS, LAUNCH_PREVIEW_MS } from "../lib/launches/policy";

const args = { secret: v.string(), owner: v.string(), address: v.string(), requestId: v.string() };
type Args = { secret: string; owner: string; address: string; requestId: string };
async function authorize(ctx: QueryCtx | MutationCtx, a: Args) {
  if (!launchPreparationEnabled()) throw Error("Launch preparation is disabled.");
  const secret = process.env.WEB_AUTH_SECRET;
  if (!secret || secret.length < 32 || a.secret !== secret) throw Error("Unauthorized.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.requestId)) throw Error("Invalid request ID.");
  const identity = launchIdentity(a.owner, a.address);
  if (a.owner.startsWith("tg:")) {
    const userId = a.owner.slice(3);
    const rows = await ctx.db.query("telegramNativeWallets").withIndex("by_user", q => q.eq("telegramUserId", userId)).take(2);
    if (rows.length !== 1 || rows[0].telegramChatId !== userId || getAddress(rows[0].address) !== identity.address || getAddress(rows[0].signerWalletRef) !== identity.address)
      throw Error("Wallet ownership could not be verified.");
  } else {
    const rows = await ctx.db.query("cryptoWallets").withIndex("by_owner_x_user_id", q => q.eq("ownerXUserId", a.owner)).take(2);
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", q => q.eq("xUserId", a.owner)).unique();
    if (rows.length !== 1 || rows[0].status !== "active" || rows[0].chainId !== 5042 || user?.walletId !== rows[0]._id
      || getAddress(rows[0].address) !== identity.address || getAddress(rows[0].signerWalletRef) !== identity.address)
      throw Error("Wallet ownership could not be verified.");
  }
  return identity;
}
async function find(ctx: QueryCtx | MutationCtx, a: Args) {
  return ctx.db.query("launchDrafts").withIndex("by_owner_request", q => q.eq("owner", a.owner).eq("requestId", a.requestId)).unique();
}
function publicDraft(row: NonNullable<Awaited<ReturnType<typeof find>>>) {
  return { requestId: row.requestId, address: row.address, revision: row.revision, status: row.status,
    input: JSON.parse(row.inputJson), tokenSalt: row.tokenSalt, fingerprint: row.fingerprint,
    preview: row.previewJson ? JSON.parse(row.previewJson) : null, expiresAt: row.expiresAt, executionEnabled: false };
}
export const create = mutation({ args: { ...args, inputJson: v.string() }, handler: async (ctx, a) => {
  const identity = await authorize(ctx, a);
  if (a.inputJson.length > 4096) throw Error("Launch settings are too large.");
  const input = parseLaunchInput(JSON.parse(a.inputJson)), fingerprint = launchFingerprint(identity, input), now = Date.now();
  const existing = await find(ctx, a);
  if (existing) {
    if (existing.fingerprint !== fingerprint || existing.address !== identity.address) throw Error("Request ID already belongs to different launch settings.");
    return publicDraft(existing);
  }
  const recent = await ctx.db.query("launchDrafts").withIndex("by_owner", q => q.eq("owner", a.owner)).order("desc").take(50);
  if (recent.filter(r => r.createdAt > now - 60_000).length >= 5 || recent.filter(r => r.expiresAt > now && r.status !== "cancelled").length >= 10)
    throw Error("Too many launch drafts. Cancel an old draft first.");
  // Convex retries mutations deterministically. Generate once on creation and retain on every retry.
  const tokenSalt = keccak256(toHex(crypto.randomUUID() + crypto.randomUUID()));
  const id = await ctx.db.insert("launchDrafts", { requestId: a.requestId, owner: a.owner, address: identity.address,
    inputJson: JSON.stringify(input), fingerprint, tokenSalt, revision: 1, status: "draft", createdAt: now, updatedAt: now, expiresAt: now + LAUNCH_DRAFT_TTL_MS });
  return publicDraft((await ctx.db.get(id))!);
} });
export const read = query({ args, handler: async (ctx, a) => {
  const identity = await authorize(ctx, a), row = await find(ctx, a);
  if (!row || row.address !== identity.address) return null;
  return publicDraft(row);
} });
export const update = mutation({ args: { ...args, revision: v.number(), inputJson: v.string() }, handler: async (ctx, a) => {
  const identity = await authorize(ctx, a), row = await find(ctx, a), now = Date.now();
  if (!row || row.address !== identity.address || row.status === "cancelled" || row.expiresAt <= now)
    throw Error("Launch draft expired or was cancelled.");
  if (!Number.isSafeInteger(a.revision) || a.revision < 1 || a.inputJson.length > 4096) throw Error("Invalid launch draft update.");
  const input = parseLaunchInput(JSON.parse(a.inputJson)), fingerprint = launchFingerprint(identity, input);
  // A lost response can be retried with the same revision and canonical settings.
  if (row.revision === a.revision + 1 && row.fingerprint === fingerprint && row.status === "draft") return publicDraft(row);
  if (row.revision !== a.revision) throw Error("Launch draft changed. Reload it before editing.");
  if (row.fingerprint === fingerprint) return publicDraft(row);
  await ctx.db.patch(row._id, { inputJson: JSON.stringify(input), fingerprint, revision: row.revision + 1,
    status: "draft", previewJson: undefined, updatedAt: now });
  // Keep a running computation's lease until its worker ends or it expires. Its
  // old revision can no longer save a preview; editing cannot bypass throttling.
  return publicDraft((await ctx.db.get(row._id))!);
} });
export const beginPreparation = mutation({ args, handler: async (ctx, a) => {
  const identity = await authorize(ctx, a), row = await find(ctx, a), now = Date.now();
  if (!row || row.address !== identity.address || row.status === "cancelled" || row.expiresAt <= now) throw Error("Launch draft expired or was cancelled.");
  const recent = await ctx.db.query("launchDrafts").withIndex("by_owner", q => q.eq("owner", a.owner)).order("desc").take(50);
  if (recent.some(r => (r.preparingUntil ?? 0) > now || (r.nextPreviewAt ?? 0) > now)) throw Error("Launch preparation is already running. Wait before retrying.");
  const prepareToken = crypto.randomUUID();
  await ctx.db.patch(row._id, { prepareToken, preparingUntil: now + 60_000, nextPreviewAt: now + 5000 });
  return { ...publicDraft(row), prepareToken };
} });
export const endPreparation = mutation({ args: { ...args, prepareToken: v.string() }, handler: async (ctx, a) => {
  await authorize(ctx, a); const row = await find(ctx, a);
  if (row?.prepareToken === a.prepareToken) await ctx.db.patch(row._id, { prepareToken: undefined, preparingUntil: undefined });
} });
export const savePreview = mutation({ args: { ...args, revision: v.number(), prepareToken: v.string(), previewJson: v.string() }, handler: async (ctx, a) => {
  const identity = await authorize(ctx, a), row = await find(ctx, a), now = Date.now();
  if (!row || row.address !== identity.address || row.status === "cancelled" || row.expiresAt <= now || row.revision !== a.revision
    || !row.prepareToken || row.prepareToken !== a.prepareToken || (row.preparingUntil ?? 0) <= now)
    throw Error("Launch draft changed or expired. Prepare again.");
  if (a.previewJson.length > 24_000) throw Error("Launch preview is too large.");
  const p = JSON.parse(a.previewJson) as { fingerprint: Hex; creator: string; tokenSalt: string; executionEnabled: boolean; createdAt: number; expiresAt: number; status: string };
  if (p.fingerprint !== row.fingerprint || p.creator !== row.address || p.tokenSalt !== row.tokenSalt || p.executionEnabled !== false
    || !["simulated", "needs_setup"].includes(p.status) || !Number.isSafeInteger(p.createdAt) || !Number.isSafeInteger(p.expiresAt)
    || p.createdAt > now || p.expiresAt <= now || p.expiresAt > p.createdAt + LAUNCH_PREVIEW_MS)
    throw Error("Launch preview does not match this draft.");
  await ctx.db.patch(row._id, { previewJson: a.previewJson, revision: row.revision + 1, status: "prepared", updatedAt: now, prepareToken: undefined, preparingUntil: undefined });
  return publicDraft((await ctx.db.get(row._id))!);
} });
export const cancel = mutation({ args, handler: async (ctx, a) => {
  const identity = await authorize(ctx, a), row = await find(ctx, a);
  if (!row || row.address !== identity.address) throw Error("Launch draft not found.");
  if (row.status !== "cancelled") await ctx.db.patch(row._id, { status: "cancelled", previewJson: undefined, revision: row.revision + 1, updatedAt: Date.now(), prepareToken: undefined, preparingUntil: undefined });
  return publicDraft((await ctx.db.get(row._id))!);
} });
