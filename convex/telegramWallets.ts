import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { signerRequest } from "./wallets";
import { telegramWalletCommand } from "../lib/telegram-commands";
import type { WalletCommand } from "./walletCommands";
import { ARC_BOT_SITE_URL } from "../lib/project-config";
import { ARC_COMMAND_HTTP_TIMEOUT_MS, arcServiceResult, arcPendingRetryDelay } from "../lib/arc/social-timing";
import { arcCommandResponse, arcWalletUrl } from "../lib/public-links";

type DbCtx = QueryCtx | MutationCtx;
export async function walletContext(ctx: DbCtx, telegramUserId: string, telegramChatId: string) {
  const native = await ctx.db.query("telegramNativeWallets").withIndex("by_user", q => q.eq("telegramUserId", telegramUserId)).unique();
  const links = await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", telegramUserId)).collect();
  const link = links.find(r => !r.revokedAt && r.telegramChatId === telegramChatId) ?? null;
  const preference = await ctx.db.query("telegramWalletSelections").withIndex("by_user", q => q.eq("telegramUserId", telegramUserId)).unique();
  const tg = native?.telegramChatId === telegramChatId ? native : null;
  // No migration: every existing X link keeps its wallet and its default selection.
  const selected = preference?.selected === "tg" && tg ? "tg" : link ? "x" : tg ? "tg" : null;
  const user = link ? await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", q => q.eq("xUserId", link.ownerXUserId)).unique() : null;
  return { native: tg, link, selected, xUsername: user?.username ?? null };
}
export const context = internalQuery({ args: { telegramUserId: v.string(), telegramChatId: v.string() }, handler: (ctx, a) => walletContext(ctx, a.telegramUserId, a.telegramChatId) });

export async function saveSelection(ctx: MutationCtx, telegramUserId: string, selected: "tg" | "x", at = Date.now()) {
  const row = await ctx.db.query("telegramWalletSelections").withIndex("by_user", q => q.eq("telegramUserId", telegramUserId)).unique();
  if (row && row.updatedAt > at) return;
  if (row) await ctx.db.patch(row._id, { selected, updatedAt: at });
  else await ctx.db.insert("telegramWalletSelections", { telegramUserId, selected, updatedAt: at });
}
async function intake(ctx: DbCtx, updateId: string) {
  const update = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", updateId)).unique();
  if (!update?.telegramUserId || update.telegramChatId !== update.telegramUserId || !/^\d{1,30}$/.test(update.telegramUserId)) throw Error("Private Telegram identity required.");
  if (update.walletTransitionBlocked) throw Error("Wait for the wallet change, then send a new command.");
  return update;
}
export const intakeGuard = internalQuery({ args: { updateId: v.string() }, handler: async (ctx, a) => {
  const update = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", a.updateId)).unique();
  return { blocked: !update || update.walletTransitionBlocked === true };
} });
export const select = internalMutation({ args: { updateId: v.string(), selected: v.union(v.literal("tg"), v.literal("x")) }, handler: async (ctx, a) => {
  const update = await intake(ctx, a.updateId);
  const state = await walletContext(ctx, update.telegramUserId!, update.telegramChatId!);
  if (a.selected === "tg" ? !state.native : !state.link) throw Error("Link that wallet first.");
  await saveSelection(ctx, update.telegramUserId!, a.selected, update.createdAt);
} });
export const creationContext = internalQuery({ args: { updateId: v.string() }, handler: async (ctx, a) => {
  const update = await intake(ctx, a.updateId);
  return { update, state: await walletContext(ctx, update.telegramUserId!, update.telegramChatId!) };
} });
export const bind = internalMutation({ args: { updateId: v.string(), address: v.string(), signerWalletRef: v.string() }, handler: async (ctx, a) => {
  const update = await intake(ctx, a.updateId), telegramUserId = update.telegramUserId!;
  if (!/^0x[a-fA-F0-9]{40}$/.test(a.address) || a.signerWalletRef.toLowerCase() !== a.address.toLowerCase()) throw Error("Invalid CDP wallet.");
  const existing = await ctx.db.query("telegramNativeWallets").withIndex("by_user", q => q.eq("telegramUserId", telegramUserId)).unique();
  if (existing && (existing.address.toLowerCase() !== a.address.toLowerCase() || existing.telegramChatId !== update.telegramChatId)) throw Error("Permanent wallet binding cannot change.");
  if (!existing) await ctx.db.insert("telegramNativeWallets", { telegramUserId, telegramChatId: update.telegramChatId!, address: a.address, signerWalletRef: a.signerWalletRef, createdAt: Date.now() });
  await saveSelection(ctx, telegramUserId, "tg", update.createdAt);
} });
export const create = internalAction({ args: { updateId: v.string() }, handler: async (ctx, a): Promise<void> => {
  const { update, state } = await ctx.runQuery(internal.telegramWallets.creationContext, a);
  const wallet = state.native ?? await signerRequest<{ address: string; walletRef: string }>("/v1/wallets", {
    idempotencyKey: `tg:${update.telegramUserId}:wallet:v1`, ownerReference: `tg:${update.telegramUserId}`, chainId: 5042,
  }, 60_000);
  await ctx.runMutation(internal.telegramWallets.bind, { ...a, address: wallet.address, signerWalletRef: "signerWalletRef" in wallet ? wallet.signerWalletRef : wallet.walletRef });
} });

async function boundNative(ctx: DbCtx, updateId: string) {
  const update = await intake(ctx, updateId);
  const wallet = update.boundTelegramWalletId ? await ctx.db.get(update.boundTelegramWalletId) : null;
  if (!wallet || wallet.telegramUserId !== update.telegramUserId || wallet.telegramChatId !== update.telegramChatId) throw Error("TG wallet authorization changed.");
  return { update, wallet };
}
export const enqueue = internalMutation({ args: { updateId: v.string(), name: v.string(), args: v.string() }, handler: async (ctx, a) => {
  const { update, wallet } = await boundNative(ctx, a.updateId);
  const command = telegramWalletCommand(a.name, a.args);
  if (!command || !["show_wallet", "show_balance", "buy", "sell", "swap_token_for_token", "send", "burn"].includes(command.kind)) throw Error("Unsupported command.");
  const requestId = `telegram-native:${a.updateId}`;
  const existing = await ctx.db.query("telegramNativeRequests").withIndex("by_request", q => q.eq("requestId", requestId)).unique();
  if (existing) {
    if (existing.walletId !== wallet._id || existing.command !== JSON.stringify(command)) throw Error("Request identity changed.");
    return requestId;
  }
  await ctx.db.insert("telegramNativeRequests", { requestId, updateId: a.updateId, walletId: wallet._id, telegramUserId: update.telegramUserId!, telegramChatId: update.telegramChatId!, command: JSON.stringify(command), status: "pending", delivered: false, nextAttemptAt: Date.now(), createdAt: update.createdAt });
  await ctx.scheduler.runAfter(0, internal.telegramWallets.work, { requestId });
  return requestId;
} });
export const authority = internalQuery({ args: { requestId: v.string() }, handler: async (ctx, a) => {
  const request = await ctx.db.query("telegramNativeRequests").withIndex("by_request", q => q.eq("requestId", a.requestId)).unique();
  if (!request || request.status !== "pending") throw Error("Request not authorized.");
  const { wallet } = await boundNative(ctx, request.updateId);
  if (request.walletId !== wallet._id) throw Error("Wallet binding changed.");
  return { owner: `tg:${wallet.telegramUserId}`, wallet: wallet.address, command: request.command, createdAt: request.createdAt, source: "telegram" };
} });
export const claim = internalMutation({ args: { requestId: v.string(), lease: v.string() }, handler: async (ctx, a) => {
  const row = await ctx.db.query("telegramNativeRequests").withIndex("by_request", q => q.eq("requestId", a.requestId)).unique();
  if (!row || row.delivered || row.nextAttemptAt > Date.now() || (row.leaseUntil ?? 0) > Date.now()) return null;
  const { wallet } = await boundNative(ctx, row.updateId);
  if (row.walletId !== wallet._id) throw Error("Wallet binding changed.");
  const leaseUntil = Date.now() + 360_000;
  await ctx.db.patch(row._id, { lease: a.lease, leaseUntil, nextAttemptAt: leaseUntil, attempts: (row.attempts ?? 0) + 1 });
  return { row, wallet };
} });
export const finish = internalMutation({ args: { requestId: v.string(), lease: v.string(), result: v.optional(v.string()), delivered: v.optional(v.boolean()), diagnosticCode: v.optional(v.string()), retryDelayMs: v.optional(v.number()) }, handler: async (ctx, a) => {
  const row = await ctx.db.query("telegramNativeRequests").withIndex("by_request", q => q.eq("requestId", a.requestId)).unique();
  if (!row || row.lease !== a.lease) return;
  const delay = Math.min(300_000, Math.max(5_000, a.retryDelayMs ?? 15_000));
  await ctx.db.patch(row._id, { ...(a.result !== undefined && row.result === undefined ? { result: a.result, status: "complete" as const } : {}), ...(a.delivered ? { delivered: true } : {}), diagnosticCode: a.diagnosticCode, lease: undefined, leaseUntil: undefined, nextAttemptAt: Date.now() + delay });
  if (!a.delivered) await ctx.scheduler.runAfter(delay, internal.telegramWallets.work, { requestId: a.requestId });
} });
export const recover = internalMutation({ args: {}, handler: async ctx => {
  const rows = await ctx.db.query("telegramNativeRequests").withIndex("by_due", q => q.eq("delivered", false).lte("nextAttemptAt", Date.now())).take(50);
  for (const row of rows) {
    if ((row.leaseUntil ?? 0) > Date.now()) continue;
    await ctx.db.patch(row._id, { nextAttemptAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.telegramWallets.work, { requestId: row.requestId });
  }
} });
export const work = internalAction({ args: { requestId: v.string() }, handler: async (ctx, a): Promise<void> => {
  const lease = crypto.randomUUID();
  const claimed: { row: Doc<"telegramNativeRequests">; wallet: Doc<"telegramNativeWallets"> } | null = await ctx.runMutation(internal.telegramWallets.claim, { ...a, lease });
  if (!claimed) return;
  const { row, wallet } = claimed;
  let result = row.result, delivered = false, diagnosticCode: string | undefined;
  let retryDelayMs = arcPendingRetryDelay(row.createdAt);
  const command = JSON.parse(row.command) as WalletCommand;
  try {
    if (!result) {
      try {
      if (command.kind === "show_wallet") result = `Your Argos Bot wallet:\n\n${arcWalletUrl(wallet.address)}`;
      else if (command.kind === "show_balance") {
        const balance = await signerRequest<{ display: string }>("/v1/wallets/balance", { chainId: 5042, walletRef: wallet.signerWalletRef, expectedAddress: wallet.address, ownerReference: `tg:${wallet.telegramUserId}`, ...(command.token ? { token: command.token } : {}) }, 60_000);
        result = `Balances\n${balance.display}`;
      } else {
        const secret = process.env.WEB_AUTH_SECRET;
        if (!secret) throw new TelegramServiceError("SERVICE_CONFIGURATION");
        const response = await fetch(`${ARC_BOT_SITE_URL}/api/arc/command`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(a), signal: AbortSignal.timeout(ARC_COMMAND_HTTP_TIMEOUT_MS) });
        if (!response.ok) throw new TelegramServiceError([401,403].includes(response.status) ? "SERVICE_AUTHORIZATION" : [400,404].includes(response.status) ? "SERVICE_CONFIGURATION" : "SERVICE_UNAVAILABLE");
        const reply = arcServiceResult(await response.json());
        if (!reply.pending) result = arcCommandResponse(reply.message, wallet.address, reply.hash, command.kind === "send" && command.chainId === 8453 ? 8453 : 5042);
      }
      } catch (error) {
        const readOnly = ["show_wallet", "show_balance"].includes(command.kind);
        diagnosticCode = error instanceof TelegramServiceError ? error.code : readOnly ? "BALANCE_UNAVAILABLE" : "SERVICE_UNAVAILABLE";
        if (readOnly && Date.now() - row.createdAt > 120_000) result = "Balance lookup failed. Try /balance again with a ticker or contract address.";
        else if (diagnosticCode === "SERVICE_CONFIGURATION" || diagnosticCode === "SERVICE_AUTHORIZATION") {
          retryDelayMs = 300_000;
          console.error("telegram_wallet_service_paused", { requestId: row.requestId, code: diagnosticCode });
          // Notice has its own deduplication key. It does not complete the financial request.
          try { await ctx.runAction(internal.telegram.deliverNativeWalletMessage, { walletId: wallet._id, requestId: `telegram-service:${row.requestId}:${diagnosticCode}`, text: "Trading service needs attention. Your request is paused and will retry after service is restored. Do not submit it again." }); }
          catch { /* Retain the diagnostic and retry notice delivery on the next worker run. */ }
        } else retryDelayMs = Math.max(60_000, retryDelayMs);
      }
    }
    if (result) {
      // Persist completion before sending. A delivery failure never repeats execution.
      const stored = await ctx.runMutation(internal.telegramWallets.storeResult, { ...a, lease, result });
      if (stored === false) return;
      try { delivered = await ctx.runAction(internal.telegram.deliverNativeWalletMessage, { walletId: wallet._id, requestId: `telegram-result:${row.requestId}`, text: result }); }
      catch { diagnosticCode = "DELIVERY_UNAVAILABLE"; retryDelayMs = 60_000; }
    }
  } catch {
    diagnosticCode = "RESULT_STORAGE_UNAVAILABLE";
    retryDelayMs = 60_000;
  }
  finally { await ctx.runMutation(internal.telegramWallets.finish, { ...a, lease, ...(result ? { result } : {}), delivered, retryDelayMs, ...(diagnosticCode ? { diagnosticCode } : {}) }); }
} });
export const storeResult = internalMutation({ args: { requestId: v.string(), lease: v.string(), result: v.string() }, handler: async (ctx, a) => {
  const row = await ctx.db.query("telegramNativeRequests").withIndex("by_request", q => q.eq("requestId", a.requestId)).unique();
  if (!row || row.lease !== a.lease || (row.result !== undefined && row.result !== a.result)) return false;
  if (row.result === undefined) await ctx.db.patch(row._id, { result: a.result, status: "complete" });
  return true;
} });

class TelegramServiceError extends Error {
  constructor(public readonly code: string) { super(code); }
}
