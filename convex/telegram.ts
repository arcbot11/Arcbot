import { suppressCreationReply } from "../lib/disabled-creation";
import { socialAddressLinks } from "../lib/social-address-links";
import { ARC_BOT_TELEGRAM_USER_ID } from "../lib/project-config";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { WalletCommand } from "./walletCommands";
import { walletContext, saveSelection } from "./telegramWallets";
import { releaseUnsignedTelegramWork } from "./lib/telegramUnlink";
import { telegramMenu, telegramWalletLabel } from "../lib/telegram-commands";
import { TELEGRAM_HELP, TELEGRAM_FORMATS, telegramInput, telegramWalletCommand, telegramResponse } from "../lib/telegram-commands";



const LINK_TTL_MS = 10 * 60 * 1_000;

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number; username?: string; is_bot?: boolean };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number; username?: string; is_bot?: boolean };
    message?: { message_id?: number; chat?: { id?: number; type?: string } };
  };
};

function enabled() {
  return process.env.TELEGRAM_ENABLED === "true";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function isTelegramUnlinkCommand(text: string) {
  const input = telegramInput(text);
  return input?.name === "unlink" && !input.args;
}

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram delivery is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string; parameters?: { retry_after?: number } } | null;
  if (!response.ok || !result?.ok) {
    const retry = result?.parameters?.retry_after;
    throw new Error(retry ? `Telegram delivery throttled; retry after ${retry}s` : result?.description || `Telegram delivery failed (${response.status})`);
  }
}

async function sendMessage(chatId: string, text: string, replyMarkup?: Record<string, unknown>) {
  text = socialAddressLinks(text);
  if (suppressCreationReply(text)) return;
  const chunks: string[] = [];
  let remaining = telegramResponse(text).trim() || " ";
  while (remaining.length > 4_000) {
    let cut = remaining.lastIndexOf("\n", 4_000);
    if (cut < 1_000) cut = remaining.lastIndexOf(" ", 4_000);
    if (cut < 1_000) cut = 4_000;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  chunks.push(remaining);
  for (const [index, chunk] of chunks.entries()) await telegramApi("sendMessage", {
    chat_id: chatId,
    text: chunk,
    disable_web_page_preview: true,
    ...(replyMarkup && index === chunks.length - 1 ? { reply_markup: replyMarkup } : {}),
  });
}

export function telegramRecipientAllowed(command: WalletCommand) {
  if (command.kind === "buy_and_send" || command.kind === "buy_and_burn") return false;
  if (command.kind !== "send") return true;
  return /^0x[a-fA-F0-9]{40}$/.test(command.recipient);
}

export const reserveUpdate = internalMutation({
  args: { updateId: v.string(), telegramUserId: v.optional(v.string()), telegramChatId: v.optional(v.string()), updateJson: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", args.updateId)).unique();
    if (existing) return false;
    const now = Date.now();
    const links = args.telegramUserId ? await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", args.telegramUserId!)).collect() : [];
    const link = links.find(row => !row.revokedAt && row.telegramChatId === args.telegramChatId);
    const state = args.telegramUserId && args.telegramChatId ? await walletContext(ctx, args.telegramUserId, args.telegramChatId) : null;
    let walletTransitionBlocked = false;
    if (state && args.updateJson && args.telegramUserId === args.telegramChatId) {
      const payload = JSON.parse(args.updateJson) as TelegramUpdate;
      const source = payload.message || payload.callback_query?.message;
      const from = payload.message?.from || payload.callback_query?.from;
      const input = telegramInput(payload.message?.text || payload.callback_query?.data || "", Boolean(payload.callback_query));
      if (source?.chat?.type === "private" && !from?.is_bot && String(from?.id) === args.telegramUserId && input) {
        const changesWallet = (["createtg", "usetg", "usex", "unlink"].includes(input.name) && !input.args)
          || (input.name === "start" && /^link_[a-f0-9]{32}$/.test(input.args));
        const spends = ["buy", "sell", "swap", "send", "burn", "withdraw"].includes(input.name) && Boolean(input.args);
        const selection = await ctx.db.query("telegramWalletSelections").withIndex("by_user", q => q.eq("telegramUserId", args.telegramUserId!)).unique();
        walletTransitionBlocked = Boolean(selection?.pendingUpdateId && (changesWallet || spends));
        if (changesWallet && !walletTransitionBlocked) {
          if (selection) await ctx.db.patch(selection._id, { pendingUpdateId: args.updateId });
          else await ctx.db.insert("telegramWalletSelections", { telegramUserId: args.telegramUserId!, selected: state.selected === "tg" ? "tg" : "x", updatedAt: now, pendingUpdateId: args.updateId });
        }
      }
    }
    await ctx.db.insert("telegramUpdates", { ...args, walletTransitionBlocked, unlinkBindingVersion: 1, ...(link ? { unlinkLinkId: link._id } : {}), linkBindingVersion: 1, ...(state?.selected === "tg" && state.native ? { boundTelegramWalletId: state.native._id } : link ? { boundLinkId: link._id, boundOwnerXUserId: link.ownerXUserId } : {}), status: "received", createdAt: now, updatedAt: now });
    if (args.updateJson) await ctx.scheduler.runAfter(0, internal.telegram.processUpdate, { updateId: args.updateId, updateJson: args.updateJson });
    return true;
  },
});

export const updateStatus = internalMutation({
  args: { updateId: v.string(), status: v.union(v.literal("processing"), v.literal("completed"), v.literal("ignored"), v.literal("failed")), safeError: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", args.updateId)).unique();
    if (row) await ctx.db.patch(row._id, { status: args.status, safeError: args.safeError, updatedAt: Date.now() });
    if (row?.telegramUserId && args.status !== "processing") {
      const selection = await ctx.db.query("telegramWalletSelections").withIndex("by_user", q => q.eq("telegramUserId", row.telegramUserId!)).unique();
      if (selection?.pendingUpdateId === args.updateId) await ctx.db.patch(selection._id, { pendingUpdateId: undefined });
    }
  },
});

export const consumeRateLimit = internalMutation({
  args: { telegramUserId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const utcDay = new Date(now).toISOString().slice(0, 10);
    const key = `telegram_chat:${args.telegramUserId}`;
    const row = await ctx.db.query("terminalRateLimits").withIndex("by_key", q => q.eq("key", key)).unique();
    const sameDay = row?.utcDay === utcDay;
    const sameWindow = Boolean(row && now - row.windowStartedAt < 10 * 60_000);
    const dailyCount = sameDay ? row!.dailyCount : 0;
    const windowCount = sameWindow ? row!.windowCount : 0;
    if (dailyCount >= 500 || windowCount >= 40) return false;
    const value = { utcDay, dailyCount: dailyCount + 1, windowStartedAt: sameWindow ? row!.windowStartedAt : now, windowCount: windowCount + 1, updatedAt: now };
    if (row) await ctx.db.patch(row._id, value);
    else await ctx.db.insert("terminalRateLimits", { key, ...value });
    return true;
  },
});

export const walletRequestResult = internalQuery({
  args: { requestId: v.string(), ownerXUserId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("walletRequests").withIndex("by_request_id", q => q.eq("requestId", args.requestId)).unique();
    if (!row || row.ownerXUserId !== args.ownerXUserId) return null;
    return { status: row.status, finalMessage: row.finalMessage, safeError: row.safeError, updatedAt: row.updatedAt };
  },
});

export const recordMessage = internalMutation({
  args: { telegramUserId: v.string(), telegramChatId: v.string(), role: v.union(v.literal("user"), v.literal("assistant")), text: v.string(), updateId: v.optional(v.string()), requestId: v.optional(v.string()) },
  handler: async (ctx, args) => ctx.db.insert("telegramMessages", { ...args, createdAt: Date.now() }),
});

export const deliveredMessage = internalQuery({
  args: { requestId: v.string(), telegramUserId: v.string(), telegramChatId: v.string() },
  handler: async (ctx, args) => Boolean((await ctx.db.query("telegramMessages").withIndex("by_request", q => q.eq("requestId", args.requestId)).collect())
    .some(row => row.role === "assistant" && row.telegramUserId === args.telegramUserId && row.telegramChatId === args.telegramChatId)),
});

export const clearConversation = internalMutation({
  args: { telegramUserId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("telegramConversations").withIndex("by_user_active", q => q.eq("telegramUserId", args.telegramUserId).eq("active", true)).collect();
    for (const row of rows) await ctx.db.patch(row._id, { active: false, updatedAt: Date.now() });
  },
});

export const revokeLinkByTelegram = internalMutation({
  args: { telegramUserId: v.string(), ownerXUserId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const links = await ctx.db.query("telegramAccountLinks")
      .withIndex("by_telegram_user", q => q.eq("telegramUserId", args.telegramUserId)).collect();
    const active = links.filter(row => !row.revokedAt && row.ownerXUserId === args.ownerXUserId);
    for (const row of active) {
      await ctx.db.patch(row._id, { revokedAt: now, updatedAt: now });
      await releaseUnsignedTelegramWork(ctx, row, now);
    }
    const conversations = await ctx.db.query("telegramConversations")
      .withIndex("by_user_active", q => q.eq("telegramUserId", args.telegramUserId).eq("active", true)).collect();
    for (const row of conversations) await ctx.db.patch(row._id, { active: false, updatedAt: now });

    return active.length > 0;
  },
});

export const revokeLinkByX = internalMutation({
  args: { ownerXUserId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const links = await ctx.db.query("telegramAccountLinks")
      .withIndex("by_owner_x_user", q => q.eq("ownerXUserId", args.ownerXUserId)).collect();
    const active = links.filter(row => !row.revokedAt);
    for (const row of active) {
      await ctx.db.patch(row._id, { revokedAt: now, updatedAt: now });
      await releaseUnsignedTelegramWork(ctx, row, now);
      const conversations = await ctx.db.query("telegramConversations")
        .withIndex("by_user_active", q => q.eq("telegramUserId", row.telegramUserId).eq("active", true)).collect();
      for (const conversation of conversations) await ctx.db.patch(conversation._id, { active: false, updatedAt: now });

    }
    return active.length > 0;
  },
});

export const unlinkUpdate = internalMutation({ args: { updateId: v.string() }, handler: async (ctx, args) => {
  const update = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", args.updateId)).unique();
  if (!update || update.walletTransitionBlocked) return false;
  const linkId = update.unlinkBindingVersion === 1 ? update.unlinkLinkId : update.boundLinkId;
  const link = linkId ? await ctx.db.get(linkId) : null;
  if (!link || link.revokedAt || link.telegramUserId !== update.telegramUserId || link.telegramChatId !== update.telegramChatId) return false;
  const now = Date.now();
  await ctx.db.patch(link._id, { revokedAt: now, updatedAt: now });
  await releaseUnsignedTelegramWork(ctx, link, now);
  const conversations = await ctx.db.query("telegramConversations").withIndex("by_user_active", q => q.eq("telegramUserId", link.telegramUserId).eq("active", true)).collect();
  for (const row of conversations) await ctx.db.patch(row._id, { active: false, updatedAt: now });
  return true;
} });

export const storeLinkNonce = internalMutation({
  args: { nonceHash: v.string(), telegramUserId: v.string(), telegramChatId: v.string(), telegramUsername: v.optional(v.string()), expiresAt: v.number() },
  handler: async (ctx, args) => ctx.db.insert("telegramLinkNonces", { ...args, createdAt: Date.now() }),
});

export const activeLink = internalQuery({
  args: { telegramUserId: v.string() },
  handler: async (ctx, args) => {
    const links = await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", args.telegramUserId)).collect();
    return links.filter(row => !row.revokedAt).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  },
});

export const boundUpdateLink = internalQuery({
  args: { updateId: v.string(), telegramUserId: v.string(), telegramChatId: v.string() },
  handler: async (ctx, args) => {
    const update = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", args.updateId)).unique();
    if (!update || update.walletTransitionBlocked || update.linkBindingVersion !== 1 || update.telegramUserId !== args.telegramUserId || update.telegramChatId !== args.telegramChatId) return { valid: false, link: null };
    if (update.boundTelegramWalletId) {
      const native = await ctx.db.get(update.boundTelegramWalletId);
      const valid = Boolean(native && native.telegramUserId === args.telegramUserId && native.telegramChatId === args.telegramChatId);
      return { valid, link: null, native: valid ? native : null };
    }
    const links = await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", args.telegramUserId)).collect();
    const link = links.find(row => !row.revokedAt) || null;
    const valid = link ? link._id === update.boundLinkId && link.ownerXUserId === update.boundOwnerXUserId && link.telegramChatId === args.telegramChatId : !update.boundLinkId;
    return { valid, link: valid ? link : null };
  },
});

// Execution workers must validate the original intake record, never a new link.
export const executionAuthorized = internalQuery({
  args: { updateId: v.optional(v.string()), ownerXUserId: v.string() },
  handler: async (ctx, args) => {
    if (!args.updateId) return false;
    const update = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", args.updateId!)).unique();
    if (!update || update.walletTransitionBlocked || update.linkBindingVersion !== 1 || !update.boundLinkId || update.boundOwnerXUserId !== args.ownerXUserId) return false;
    const link = await ctx.db.get(update.boundLinkId);
    return Boolean(link && !link.revokedAt && link.ownerXUserId === args.ownerXUserId && link.telegramUserId === update.telegramUserId && link.telegramChatId === update.telegramChatId);
  },
});

export const previewLink = action({
  args: { secret: v.string(), nonce: v.string() },
  handler: async (ctx, args): Promise<{ telegramUserId: string; telegramUsername?: string } | null> => {
    if (!process.env.WEB_AUTH_SECRET || args.secret !== process.env.WEB_AUTH_SECRET) throw new Error("Unauthorized");
    return ctx.runQuery(internal.telegram.previewLinkNonce, { nonceHash: await sha256(args.nonce) });
  },
});
export const previewLinkNonce = internalQuery({
  args: { nonceHash: v.string() },
  handler: async (ctx, args) => {
    const nonce = await ctx.db.query("telegramLinkNonces").withIndex("by_nonce_hash", q => q.eq("nonceHash", args.nonceHash)).unique();
    return nonce && !nonce.consumedAt && nonce.expiresAt > Date.now() ? { telegramUserId: nonce.telegramUserId, telegramUsername: nonce.telegramUsername } : null;
  },
});

type TelegramLinkOutcome =
  | { status: "expired" }
  | { status: "linked" | "wallet_already_linked" | "telegram_already_linked"; telegramUserId: string; telegramChatId: string };

export const linkedWallet = internalQuery({
  args: { ownerXUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", q => q.eq("xUserId", args.ownerXUserId)).unique();
    const wallet = user?.walletId ? await ctx.db.get(user.walletId) : null;
    return wallet?.ownerXUserId === args.ownerXUserId && wallet.status === "active"
      ? { address: wallet.address }
      : null;
  },
});

export const linkStatus = action({
  args: { secret: v.string(), telegramUserId: v.string() },
  handler: async (ctx, args): Promise<{
    telegramUserId: string;
    telegramChatId: string;
    telegramUsername?: string;
    ownerXUserId: string;
    linkedAt: number;
    lastAuthenticatedAt: number;
  } | null> => {
    if (!process.env.WEB_AUTH_SECRET || args.secret !== process.env.WEB_AUTH_SECRET) throw new Error("Telegram link authorization failed");
    return ctx.runQuery(internal.telegram.activeLink, { telegramUserId: args.telegramUserId });
  },
});

export const stageXLink = action({
  args:{secret:v.string(),nonce:v.string(),ownerXUserId:v.string(),returnToken:v.string()},
  handler:async(ctx,args):Promise<void>=>{
    if(!process.env.WEB_AUTH_SECRET||args.secret!==process.env.WEB_AUTH_SECRET)throw Error("Unauthorized");
    if(!/^[a-f0-9]{64}$/.test(args.nonce)||!/^[a-f0-9]{32}$/.test(args.returnToken)||!/^\d{1,30}$/.test(args.ownerXUserId))throw Error("Invalid link");
    await ctx.runMutation(internal.telegram.stageLinkReturn,{nonceHash:await sha256(args.nonce),returnHash:await sha256(args.returnToken),ownerXUserId:args.ownerXUserId});
  }
});
export const stageLinkReturn = internalMutation({
  args:{nonceHash:v.string(),returnHash:v.string(),ownerXUserId:v.string()},
  handler:async(ctx,args)=>{
    const row=await ctx.db.query("telegramLinkNonces").withIndex("by_nonce_hash",q=>q.eq("nonceHash",args.nonceHash)).unique();
    if(!row||row.consumedAt||row.expiresAt<=Date.now())throw Error("Link expired. Start again in Telegram.");
    if(row.pendingOwnerXUserId&&row.pendingOwnerXUserId!==args.ownerXUserId)throw Error("Link identity changed. Start again in Telegram.");
    await ctx.db.patch(row._id,{returnHash:args.returnHash,pendingOwnerXUserId:args.ownerXUserId});
  }
});

export const consumeLinkNonce = internalMutation({
  args: { nonceHash: v.optional(v.string()), ownerXUserId: v.optional(v.string()), returnHash: v.optional(v.string()), telegramUserId: v.optional(v.string()), telegramChatId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<TelegramLinkOutcome> => {
    const nonce = args.returnHash
      ? await ctx.db.query("telegramLinkNonces").withIndex("by_return_hash", q => q.eq("returnHash", args.returnHash!)).unique()
      : args.nonceHash ? await ctx.db.query("telegramLinkNonces").withIndex("by_nonce_hash", q => q.eq("nonceHash", args.nonceHash!)).unique() : null;
    const now = Date.now();
    if (!nonce || nonce.expiresAt <= now) return { status: "expired" as const };
    // The return token is held only by the OAuth browser, and must arrive from
    // the original Telegram account. A forwarded sign-in URL alone cannot link.
    if(args.returnHash&&(!nonce.pendingOwnerXUserId||nonce.telegramUserId!==args.telegramUserId||nonce.telegramChatId!==args.telegramChatId))return {status:"expired"};
    const ownerXUserId=args.returnHash?nonce.pendingOwnerXUserId:args.ownerXUserId;
    if(!ownerXUserId)return {status:"expired"};
    const telegramLinks = await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", nonce.telegramUserId)).collect();
    const xLinks = await ctx.db.query("telegramAccountLinks").withIndex("by_owner_x_user", q => q.eq("ownerXUserId", ownerXUserId)).collect();
    const activeTelegramLink = telegramLinks.find(row => !row.revokedAt);
    const activeXLink = xLinks.find(row => !row.revokedAt);
    if(nonce.consumedAt){
      // Reopening the same Telegram return link may acknowledge its completed
      // binding, but must never recreate a revoked/replaced link or renew auth.
      if(args.returnHash&&activeTelegramLink&&activeXLink&&activeTelegramLink._id===activeXLink._id&&activeTelegramLink.ownerXUserId===ownerXUserId&&activeTelegramLink.telegramChatId===nonce.telegramChatId&&activeTelegramLink.linkedAt<=nonce.consumedAt&&activeTelegramLink.lastAuthenticatedAt>=nonce.consumedAt)
        return {status:"linked" as const,telegramUserId:nonce.telegramUserId,telegramChatId:nonce.telegramChatId};
      return {status:"expired" as const};
    }
    // Active links are one-to-one, but revoked identities are reusable. Keep
    // collision checks and insertion in this mutation so simultaneous OAuth
    // callbacks cannot bind either identity twice.
    if (activeXLink && activeXLink.telegramUserId !== nonce.telegramUserId) {
      await ctx.db.patch(nonce._id, { consumedAt: now });
      return { status: "wallet_already_linked" as const, telegramUserId: nonce.telegramUserId, telegramChatId: nonce.telegramChatId };
    }
    if (activeTelegramLink && activeTelegramLink.ownerXUserId !== ownerXUserId) {
      await ctx.db.patch(nonce._id, { consumedAt: now });
      return { status: "telegram_already_linked" as const, telegramUserId: nonce.telegramUserId, telegramChatId: nonce.telegramChatId };
    }
    if (activeTelegramLink && activeXLink) {
      await ctx.db.patch(nonce._id, { consumedAt: now });
      await ctx.db.patch(activeTelegramLink._id, { lastAuthenticatedAt: now, updatedAt: now });
      await saveSelection(ctx, nonce.telegramUserId, "x");
      return { status: "linked" as const, telegramUserId: nonce.telegramUserId, telegramChatId: nonce.telegramChatId };
    }
    await ctx.db.patch(nonce._id, { consumedAt: now });
    await ctx.db.insert("telegramAccountLinks", {
      telegramUserId: nonce.telegramUserId,
      telegramChatId: nonce.telegramChatId,
      telegramUsername: nonce.telegramUsername,
      ownerXUserId: ownerXUserId,
      linkedAt: now,
      lastAuthenticatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await saveSelection(ctx, nonce.telegramUserId, "x");
    return { status: "linked" as const, telegramUserId: nonce.telegramUserId, telegramChatId: nonce.telegramChatId };
  },
});

export const completeXLink = action({
  args: { secret: v.string(), nonce: v.string(), ownerXUserId: v.string() },
  handler: async (ctx, args): Promise<{ linked: boolean; status: Exclude<TelegramLinkOutcome["status"], "expired">; notificationSent: boolean }> => {
    if (!process.env.WEB_AUTH_SECRET || args.secret !== process.env.WEB_AUTH_SECRET) throw new Error("Telegram link authorization failed");
    if (!/^[a-f0-9]{64}$/.test(args.nonce) || !/^\d{1,30}$/.test(args.ownerXUserId)) throw new Error("Invalid Telegram link request");
    const linked: TelegramLinkOutcome = await ctx.runMutation(internal.telegram.consumeLinkNonce, { nonceHash: await sha256(args.nonce), ownerXUserId: args.ownerXUserId });
    if (linked.status === "expired") throw new Error("Telegram link expired or was already used");
    try {
      const text = linked.status === "wallet_already_linked"
        ? 'This wallet is already linked to another TG. Post "@TheArgosBot unlink TG" on X to unlink the attached account.'
        : linked.status === "telegram_already_linked"
          ? "This TG account is already linked to another Argos Bot wallet. Use /unlink before linking a different X account."
          : "Confirmed: X linked. Use /wallet, /balance or /help.";
      await sendMessage(linked.telegramChatId, text);
      await ctx.runMutation(internal.telegram.recordMessage, { telegramUserId: linked.telegramUserId, telegramChatId: linked.telegramChatId, role: "assistant", text });
      return { linked: linked.status === "linked", status: linked.status, notificationSent: true };
    } catch {
      // The link decision is already committed. A transient Telegram outage
      // must not turn the completed X callback into a failed login page.
      return { linked: linked.status === "linked", status: linked.status, notificationSent: false };
    }
  },
});

export const acceptUpdate = action({
  args: { secret: v.string(), updateJson: v.string() },
  handler: async (ctx, args) => {
    if (!enabled() || !process.env.TELEGRAM_WEBHOOK_SECRET || args.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) return false;
    if (args.updateJson.length > 64_000) throw new Error("Telegram update is too large");
    const update = JSON.parse(args.updateJson) as TelegramUpdate;
    if (!Number.isSafeInteger(update.update_id)) throw new Error("Invalid Telegram update");
    const message = update.message || update.callback_query?.message;
    const from = update.message?.from || update.callback_query?.from;
    const chatId = message?.chat?.id;
    const userId = from?.id;
    // Telegram update numbers are unique per bot, not across replacement bots.
    const updateId = `${ARC_BOT_TELEGRAM_USER_ID}_${update.update_id}`;
    const reserved = await ctx.runMutation(internal.telegram.reserveUpdate, {
      updateId, updateJson: args.updateJson,
      ...(Number.isSafeInteger(userId) ? { telegramUserId: String(userId) } : {}),
      ...(Number.isSafeInteger(chatId) ? { telegramChatId: String(chatId) } : {}),
    });
    if (!reserved) return true;
    return true;
  },
});

export const processUpdate = internalAction({
  args: { updateId: v.string(), updateJson: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "processing" });
    try {
      const update = JSON.parse(args.updateJson) as TelegramUpdate;
      const callback = update.callback_query;
      const message = update.message || callback?.message;
      const from = update.message?.from || callback?.from;
      if (callback?.id) {
        try { await telegramApi("answerCallbackQuery", { callback_query_id: callback.id }); }
        catch { /* Acknowledgement is UI feedback, not command authorization. */ }
      }
      if (!message?.chat?.id || message.chat.type !== "private" || !from?.id || from.is_bot) {
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      const chatId = String(message.chat.id);
      const telegramUserId = String(from.id);
      if (!await ctx.runMutation(internal.telegram.consumeRateLimit, { telegramUserId })) {
        await sendMessage(chatId, "Pending: Telegram request limit reached. Wait a few minutes.");
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
        return;
      }
      const text = (update.message?.text || callback?.data || "").trim();
      const webLogin = callback ? /^webok_([a-f0-9]{32})$/.exec(text) : /^\/start(?:@[A-Za-z0-9_]+)? web_([a-f0-9]{32})$/.exec(text);
      if (webLogin) {
        const result = await ctx.runMutation(internal.telegramWebAuth.respond, { updateId: args.updateId, tokenHash: await sha256(webLogin[1]), approve: Boolean(callback) });
        if (result.status === "confirm") {
          await sendMessage(chatId, `Sign in to www.argosbot.io with your TG linked wallet?\n\nCode: ${result.code}\n\nApprove only if you started this sign-in and this code matches your browser. This gives that browser access to your wallet and transactions. Never approve a link someone sent you.`, { inline_keyboard: [[{ text: "Approve website sign-in", callback_data: `webok_${webLogin[1]}` }]] });
        } else {
          await sendMessage(chatId, result.status === "approved" ? "Website sign-in approved. Return to the browser where you started." : result.status === "no_wallet" ? "Create your TG linked wallet with /createtg first. Then open the website sign-in link again. To use your X wallet, sign in with X on the website." : "Sign-in expired or is unavailable. Start again on www.argosbot.io.");
        }
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
        return;
      }
      const input = telegramInput(text, Boolean(callback));
      if (!input) {
        await sendMessage(chatId, "Use the buttons or a /command. Open /help for formats.");
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      const guard = await ctx.runQuery(internal.telegramWallets.intakeGuard, { updateId: args.updateId });
      if (guard.blocked) {
        await sendMessage(chatId, "Wallet change in progress. Wait for confirmation, then send this command again. Nothing was submitted.");
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      if(!callback&&input.name==="start"&&/^link_[a-f0-9]{32}$/.test(input.args)){
        const result=await ctx.runMutation(internal.telegram.consumeLinkNonce,{returnHash:await sha256(input.args.slice(5)),telegramUserId,telegramChatId:chatId});
        const reply=result.status==="linked"?"X linked. Your wallet is ready.":result.status==="wallet_already_linked"?"This X wallet is linked to another Telegram account. Unlink it first.":result.status==="telegram_already_linked"?"This Telegram account already has a different X wallet. Use /unlink first.":"Link expired or belongs to another Telegram account. Use /link to start again.";
        const state = await ctx.runQuery(internal.telegramWallets.context, { telegramUserId, telegramChatId: chatId });
        await sendMessage(chatId,`${reply}\n\n${telegramWalletLabel(state.selected,state.xUsername,Boolean(state.native && state.link))}`,telegramMenu(state));
        await ctx.runMutation(internal.telegram.updateStatus,{updateId:args.updateId,status:"completed"});return;
      }
      const command = "/" + input.name;
      if (["start", "help", "link", "unlink", "wallet", "createtg", "usetg", "usex"].includes(input.name) && input.args) {
        await sendMessage(chatId, "Use " + command + " without extra text.");
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      if (update.message?.text) await ctx.runMutation(internal.telegram.recordMessage, { telegramUserId, telegramChatId: chatId, role: "user", text, updateId: args.updateId });
      let state = await ctx.runQuery(internal.telegramWallets.context, { telegramUserId, telegramChatId: chatId });
      if (["createtg", "usetg", "usex", "unlink", "link", "start", "help"].includes(input.name)) {
        let reply = "";
        if (input.name === "createtg") {
          await ctx.runAction(internal.telegramWallets.create, { updateId: args.updateId });
          reply = "TG wallet ready. This wallet is permanently linked to your Telegram account.";
        } else if (input.name === "usetg" || input.name === "usex") {
          await ctx.runMutation(internal.telegramWallets.select, { updateId: args.updateId, selected: input.name === "usetg" ? "tg" : "x" });
          reply = "Wallet selected.";
        } else if (input.name === "unlink") {
          const revoked = await ctx.runMutation(internal.telegram.unlinkUpdate, { updateId: args.updateId });
          reply = revoked ? "X unlinked from Telegram. Your X wallet and funds are unchanged." : "The original X link is no longer active. No current link was changed.";
        } else if (input.name === "link" && !state.link) {
          const nonce = randomNonce();
          await ctx.runMutation(internal.telegram.storeLinkNonce, { nonceHash: await sha256(nonce), telegramUserId, telegramChatId: chatId, ...(from.username ? { telegramUsername: from.username } : {}), expiresAt: Date.now() + LINK_TTL_MS });
          const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
          if (!site) throw Error("Telegram linking is not configured");
          await sendMessage(chatId, "Sign in with X to link your X wallet.", { inline_keyboard: [[{ text: "Link X", url: `${site}/api/auth/x/start?telegramLink=${nonce}` }]] });
          await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
          return;
        } else if (input.name === "link") reply = "X is already linked. Use /usex to select it.";
        state = await ctx.runQuery(internal.telegramWallets.context, { telegramUserId, telegramChatId: chatId });
        const label = telegramWalletLabel(state.selected, state.xUsername, Boolean(state.native && state.link));
        await sendMessage(chatId, [label, reply, ["start", "help", "unlink"].includes(input.name) && state.selected ? TELEGRAM_HELP : ""].filter(Boolean).join("\n\n"), input.name === "help" ? undefined : telegramMenu(state));
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
        return;
      }
      const binding = await ctx.runQuery(internal.telegram.boundUpdateLink, { updateId: args.updateId, telegramUserId, telegramChatId: chatId });
      if (!binding.valid) {
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      const link = binding.link;
      if ("native" in binding && binding.native) {
        const label = telegramWalletLabel("tg", null, Boolean(state.native && state.link));
        const parsed = telegramWalletCommand(input.name, input.args);
        if (!input.args && TELEGRAM_FORMATS[input.name]) await sendMessage(chatId, `${label}\n\n${TELEGRAM_FORMATS[input.name]}`);
        else if (!parsed || !telegramRecipientAllowed(parsed)) await sendMessage(chatId, `${label}\n\n${TELEGRAM_FORMATS[input.name] || "Use /wallet or /balance [TICKER or contract]."}`);
        else {
          await ctx.runMutation(internal.telegramWallets.enqueue, { updateId: args.updateId, name: input.name, args: input.args });
          if (!["show_wallet", "show_balance"].includes(parsed.kind)) {
            const action = parsed.kind === "send" && parsed.chainId === 8453 ? "Base withdrawal" : parsed.kind === "swap_token_for_token" ? "Swap" : parsed.kind[0].toUpperCase() + parsed.kind.slice(1);
            await sendMessage(chatId, `${label}\n\n${action} processing.`);
          }
        }
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
        return;
      }
      const assertBoundLink = async () => {
        const current = await ctx.runQuery(internal.telegram.boundUpdateLink, { updateId: args.updateId, telegramUserId, telegramChatId: chatId });
        if (!current.valid || current.link?._id !== link?._id) throw new Error("Telegram wallet link changed; request cancelled");
      };
      if (!link) {
        await sendMessage(chatId, telegramWalletLabel(null), telegramMenu(state));
      } else if (!input.args && TELEGRAM_FORMATS[input.name]) {
        await sendMessage(chatId, `${telegramWalletLabel("x",state.xUsername,Boolean(state.native && state.link))}\n\n${TELEGRAM_FORMATS[input.name]}`);
      } else {
        const parsedCommand = telegramWalletCommand(input.name, input.args);
        if (!parsedCommand || !telegramRecipientAllowed(parsedCommand)) {
          await sendMessage(chatId, TELEGRAM_FORMATS[input.name] || "Use /wallet or /balance [TICKER or contract].");
        } else {
          const effectiveText = text;
          const recipientAddress = parsedCommand.kind === "send" ? parsedCommand.recipient : undefined;
          const sourcePostId = `tg_${telegramUserId}_${message.message_id || args.updateId}`;
          const requestId = `telegram:${telegramUserId}:${args.updateId}:${parsedCommand.kind}`;
          await assertBoundLink();
          await ctx.runMutation(internal.telegramDeliveries.enqueue, { requestId, ownerXUserId: link.ownerXUserId,
            telegramUserId, telegramChatId: chatId, telegramUpdateId: args.updateId });
          const result = await ctx.runAction(internal.wallets.executeCommand, {
            sourcePostId,
            requestId,
            xUserId: link.ownerXUserId,
            text: effectiveText,
            parsedCommandJson: JSON.stringify(parsedCommand),
            telegramUpdateId: args.updateId,
            source: "telegram",
            channel: "telegram_chat",
            ...(recipientAddress ? { recipientAddress } : {}),
          });
          if (result.pending || result.deferred) {
            const action = parsedCommand.kind === "send" && parsedCommand.chainId === 8453 ? "Base withdrawal" : parsedCommand.kind === "swap_token_for_token" ? "Swap" : parsedCommand.kind[0].toUpperCase() + parsedCommand.kind.slice(1);
            await sendMessage(chatId, `${telegramWalletLabel("x",state.xUsername,Boolean(state.native && state.link))}\n\n${action} processing.`);
          } else {
            await ctx.runMutation(internal.telegramDeliveries.setText, { requestId, text: telegramResponse(result.message) });
            await ctx.runAction(internal.telegramDeliveries.deliver, { requestId });
          }
        }
      }
      await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
    } catch (error) {
      try {
        const update = JSON.parse(args.updateJson) as TelegramUpdate;
        const message = update.message || update.callback_query?.message;
        const from = update.message?.from || update.callback_query?.from;
        if (message?.chat?.id && message.chat.type === "private" && from?.id && !from.is_bot) {
          const text = "Action needed: Result unavailable. Check wallet activity before retrying.";
          await sendMessage(String(message.chat.id), text);
          await ctx.runMutation(internal.telegram.recordMessage, {
            telegramUserId: String(from.id), telegramChatId: String(message.chat.id), role: "assistant", text,
            requestId: `telegram-error:${args.updateId}`,
          });
        }
      } catch { /* Preserve the original diagnostic if fallback delivery also fails. */ }
      await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "failed", safeError: error instanceof Error ? error.message.slice(0, 300) : "Telegram processing failed" });
    }
  },
});

export const deliverDeferredWalletResult = internalAction({
  args: { requestId: v.string(), ownerXUserId: v.string(), telegramUserId: v.string(), telegramChatId: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    // Migrate already-scheduled callbacks into the durable delivery queue too.
    const updateId = args.requestId.match(/^telegram:\d+:(\d+(?:_\d+)?):/)?.[1];
    if (!updateId) return;
    await ctx.runMutation(internal.telegramDeliveries.enqueue, {
      requestId: args.requestId, ownerXUserId: args.ownerXUserId, telegramUserId: args.telegramUserId,
      telegramChatId: args.telegramChatId, telegramUpdateId: updateId,
    });
  },
});

export const deliverWalletMessage = internalAction({
  args: { telegramUserId: v.string(), telegramChatId: v.string(), ownerXUserId: v.string(), text: v.string(), requestId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const link = await ctx.runQuery(internal.telegram.activeLink, { telegramUserId: args.telegramUserId });
    if (!link || link.ownerXUserId !== args.ownerXUserId || link.telegramChatId !== args.telegramChatId) return false;
    if (await ctx.runQuery(internal.telegram.deliveredMessage, { requestId: args.requestId, telegramUserId: args.telegramUserId, telegramChatId: args.telegramChatId })) return true;
    const state = await ctx.runQuery(internal.telegramWallets.context, { telegramUserId: args.telegramUserId, telegramChatId: args.telegramChatId });
    await sendMessage(args.telegramChatId, `${telegramWalletLabel("x",state.xUsername,Boolean(state.native && state.link))}\n\n${args.text}`);
    await ctx.runMutation(internal.telegram.recordMessage, {
      telegramUserId: args.telegramUserId, telegramChatId: args.telegramChatId, role: "assistant", text: args.text, requestId: args.requestId,
    });
    return true;
  },
});

export const nativeWallet = internalQuery({ args: { walletId: v.id("telegramNativeWallets") }, handler: (ctx, a) => ctx.db.get(a.walletId) });
export const deliverNativeWalletMessage = internalAction({
  args: { walletId: v.id("telegramNativeWallets"), text: v.string(), requestId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const wallet = await ctx.runQuery(internal.telegram.nativeWallet, { walletId: args.walletId });
    if (!wallet) return false;
    const identity = { telegramUserId: wallet.telegramUserId, telegramChatId: wallet.telegramChatId, requestId: args.requestId };
    if (await ctx.runQuery(internal.telegram.deliveredMessage, identity)) return true;
    const state = await ctx.runQuery(internal.telegramWallets.context, { telegramUserId: wallet.telegramUserId, telegramChatId: wallet.telegramChatId });
    await sendMessage(wallet.telegramChatId, [telegramWalletLabel("tg", null, Boolean(state.native && state.link)), args.text].filter(Boolean).join("\n\n"));
    await ctx.runMutation(internal.telegram.recordMessage, { ...identity, role: "assistant", text: args.text });
    return true;
  },
});

/** Keep the original payload/binding and stable financial request ID when recovering. */
export const recoverUpdates = internalMutation({args:{},handler:async(ctx)=>{
  for(const status of ["received","processing"] as const){
    const rows=await ctx.db.query("telegramUpdates").withIndex("by_status_updated",q=>q.eq("status",status).lt("updatedAt",Date.now()-10*60_000)).take(20);
    for(const row of rows){
      if(!row.updateJson){await ctx.db.patch(row._id,{updatedAt:Date.now()});continue;}
      await ctx.db.patch(row._id,{updatedAt:Date.now()});
      await ctx.scheduler.runAfter(0,internal.telegram.processUpdate,{updateId:row.updateId,updateJson:row.updateJson});
    }
  }
}});
