import { disabledCreationRequest, disabledCreationKind, suppressCreationReply } from "../lib/disabled-creation";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { isTerminalCommand, isValueMovingCommand, validateStructuredWalletCommand, type WalletCommand } from "./walletCommands";
import { parseXWalletIntent, walletHelpMessage } from "./xWalletIntent";

import { GENERAL_GUIDED_HELP_MESSAGE, guidedHelpCancelled, guidedHelpClaimSelection, guidedHelpCommandText, guidedHelpPrompt, guidedHelpQuestion, guidedHelpQuestionResponse, guidedHelpSelection, type GuidedHelpOperation } from "../lib/guided-help-workflow";

import { isGasResumePrompt } from "../lib/x-temporary-reply-policy";
import { isResumeReply } from "../lib/x-direct-post-policy";
import { WORKFLOW_EXPIRED_MESSAGE } from "../lib/workflow-expiration";

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

function commandName(text: string) {
  return text.trim().split(/\s+/, 1)[0]?.toLowerCase().replace(/@[^\s]+$/, "") || "";
}

export function telegramCommandText(text: string) {
  const clean = text.trim();
  const [head, ...rest] = clean.split(/\s+/);
  const command = head?.toLowerCase().replace(/@[^\s]+$/, "");
  const tail = rest.join(" ").trim();
  if (command === "/wallet") return "show my wallet";
  if (command === "/balance") return tail ? `show my ${tail} balance` : "show my balance";
  if (command === "/buy") return `buy ${tail}`;
  if (command === "/sell") return `sell ${tail}`;
  if (command === "/swap") return `swap ${tail}`;
  if (command === "/send") return `send ${tail}`;
  if (command === "/burn") return `burn ${tail}`;
  if (command === "/fees") return tail ? `claim fees for ${tail}` : "claim my fees";

  if (command === "/positions") return tail ? `check my ${tail} positions` : "check my positions";
  return clean;
}

export function isTelegramUnlinkCommand(text: string) {
  return /^(?:\/unlink|unlink\s+tg)[.!]?$/i.test(text.trim());
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
  if (suppressCreationReply(text)) return;
  const chunks: string[] = [];
  let remaining = text.trim() || " ";
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

type TelegramGuideOperation = Exclude<GuidedHelpOperation, "root">;
const GUIDE_OPERATIONS = new Set<TelegramGuideOperation>(["buy", "sell", "swap", "send", "burn", "claim", "claim_fees"]);

export function telegramGuideOperation(value: string): TelegramGuideOperation | null {
  const normalized = value.toLowerCase().replace(/@[^\s]+$/, "");
  const aliases: Record<string, TelegramGuideOperation> = {
    "/buy": "buy", "/sell": "sell", "/swap": "swap", "/send": "send", "/burn": "burn",
    "/fees": "claim_fees",
  };
  const operation = (aliases[normalized] || normalized.replace(/^guide:/, "")) as TelegramGuideOperation;
  return GUIDE_OPERATIONS.has(operation) ? operation : null;
}

export function telegramMenuGuideOperation(value: string, rootMenuActive = false): TelegramGuideOperation | null {
  const explicit = telegramGuideOperation(value);
  if (explicit) return explicit;
  if (!rootMenuActive) return null;
  const natural = guidedHelpSelection(value);
  return natural && GUIDE_OPERATIONS.has(natural as TelegramGuideOperation)
    ? natural as TelegramGuideOperation
    : null;
}

const TELEGRAM_SEND_PROMPT =
  "Enter the amount, token, and full recipient address. Example: “10 ARCBOT to 0x…”. Telegram sends do not accept @handles.";

function telegramGuidePrompt(operation: TelegramGuideOperation) {

  return operation === "send" ? TELEGRAM_SEND_PROMPT : guidedHelpPrompt(operation);
}

function telegramGuideQuestionResponse(operation: TelegramGuideOperation, answer?: string) {

  const response = guidedHelpQuestionResponse(operation, answer);
  return operation === "send"
    ? response.replace(guidedHelpPrompt("send"), TELEGRAM_SEND_PROMPT)
    : response;
}

export function telegramRecipientAllowed(command: WalletCommand) {
  if (command.kind !== "send" && command.kind !== "buy_and_send") return true;
  return /^0x[a-fA-F0-9]{40}$/.test(command.recipient);
}

export const reserveUpdate = internalMutation({
  args: { updateId: v.string(), telegramUserId: v.optional(v.string()), telegramChatId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", args.updateId)).unique();
    if (existing) return false;
    const now = Date.now();
    const links = args.telegramUserId ? await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", args.telegramUserId!)).collect() : [];
    const link = links.find(row => !row.revokedAt && row.telegramChatId === args.telegramChatId);
    await ctx.db.insert("telegramUpdates", { ...args, linkBindingVersion: 1, ...(link ? { boundLinkId: link._id, boundOwnerXUserId: link.ownerXUserId } : {}), status: "received", createdAt: now, updatedAt: now });
    return true;
  },
});

export const updateStatus = internalMutation({
  args: { updateId: v.string(), status: v.union(v.literal("processing"), v.literal("completed"), v.literal("ignored"), v.literal("failed")), safeError: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", args.updateId)).unique();
    if (row) await ctx.db.patch(row._id, { status: args.status, safeError: args.safeError, updatedAt: Date.now() });
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

export const activeConversation = internalQuery({
  args: { telegramUserId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("telegramConversations").withIndex("by_user_active", q => q.eq("telegramUserId", args.telegramUserId).eq("active", true)).collect();
    return rows.filter(row => row.expiresAt > Date.now()).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  },
});

export const expiredConversation = internalQuery({
  args: { telegramUserId: v.string(), telegramChatId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("telegramConversations").withIndex("by_user_active", q => q.eq("telegramUserId", args.telegramUserId).eq("active", true)).collect();
    return rows.some(row => row.telegramChatId === args.telegramChatId && row.expiresAt <= Date.now());
  },
});

export const setConversation = internalMutation({
  args: { telegramUserId: v.string(), telegramChatId: v.string(), operation: v.string(), resumeText: v.optional(v.string()), resumeOwner: v.optional(v.string()), onlyIfIdle: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db.query("telegramConversations").withIndex("by_user_active", q => q.eq("telegramUserId", args.telegramUserId).eq("active", true)).collect();
    if (args.onlyIfIdle && rows.some(row => row.expiresAt > now)) return false;
    for (const row of rows) await ctx.db.patch(row._id, { active: false, updatedAt: now });
    const { onlyIfIdle, ...fields } = args;
    await ctx.db.insert("telegramConversations", { ...fields, active: true, expiresAt: now + 10 * 60 * 1_000, createdAt: now, updatedAt: now });
    return true;
  },
});

export const consumeGasResume = internalMutation({
  args: { conversationId: v.id("telegramConversations"), telegramUserId: v.string(), telegramChatId: v.string(), ownerXUserId: v.string(), operation: v.optional(v.literal("gas_resume")) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.conversationId);
    const links = await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", args.telegramUserId)).collect();
    if (!row?.active || row.expiresAt <= Date.now() || row.operation !== (args.operation || "gas_resume")
      || row.telegramUserId !== args.telegramUserId || row.telegramChatId !== args.telegramChatId
      || row.resumeOwner !== args.ownerXUserId || !row.resumeText
      || !links.some(link => !link.revokedAt && link.ownerXUserId === args.ownerXUserId)) return null;
    await ctx.db.patch(row._id, { active: false, updatedAt: Date.now() });
    return row.resumeText;
  },
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
    for (const row of active) await ctx.db.patch(row._id, { revokedAt: now, updatedAt: now });
    const conversations = await ctx.db.query("telegramConversations")
      .withIndex("by_user_active", q => q.eq("telegramUserId", args.telegramUserId).eq("active", true)).collect();
    for (const row of conversations) await ctx.db.patch(row._id, { active: false, updatedAt: now });
    const scope = `telegram:telegram_${args.telegramUserId}`;

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
      const conversations = await ctx.db.query("telegramConversations")
        .withIndex("by_user_active", q => q.eq("telegramUserId", row.telegramUserId).eq("active", true)).collect();
      for (const conversation of conversations) await ctx.db.patch(conversation._id, { active: false, updatedAt: now });
      const scope = `telegram:telegram_${row.telegramUserId}`;

    }
    return active.length > 0;
  },
});

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
    if (!update || update.linkBindingVersion !== 1 || update.telegramUserId !== args.telegramUserId || update.telegramChatId !== args.telegramChatId) return { valid: false, link: null };
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
    if (!update || update.linkBindingVersion !== 1 || !update.boundLinkId || update.boundOwnerXUserId !== args.ownerXUserId) return false;
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

export const consumeLinkNonce = internalMutation({
  args: { nonceHash: v.string(), ownerXUserId: v.string() },
  handler: async (ctx, args): Promise<TelegramLinkOutcome> => {
    const nonce = await ctx.db.query("telegramLinkNonces").withIndex("by_nonce_hash", q => q.eq("nonceHash", args.nonceHash)).unique();
    const now = Date.now();
    if (!nonce || nonce.consumedAt || nonce.expiresAt <= now) return { status: "expired" as const };
    const telegramLinks = await ctx.db.query("telegramAccountLinks").withIndex("by_telegram_user", q => q.eq("telegramUserId", nonce.telegramUserId)).collect();
    const xLinks = await ctx.db.query("telegramAccountLinks").withIndex("by_owner_x_user", q => q.eq("ownerXUserId", args.ownerXUserId)).collect();
    const activeTelegramLink = telegramLinks.find(row => !row.revokedAt);
    const activeXLink = xLinks.find(row => !row.revokedAt);
    // Active links are one-to-one, but revoked identities are reusable. Keep
    // collision checks and insertion in this mutation so simultaneous OAuth
    // callbacks cannot bind either identity twice.
    if (activeXLink && activeXLink.telegramUserId !== nonce.telegramUserId) {
      await ctx.db.patch(nonce._id, { consumedAt: now });
      return { status: "wallet_already_linked" as const, telegramUserId: nonce.telegramUserId, telegramChatId: nonce.telegramChatId };
    }
    if (activeTelegramLink && activeTelegramLink.ownerXUserId !== args.ownerXUserId) {
      await ctx.db.patch(nonce._id, { consumedAt: now });
      return { status: "telegram_already_linked" as const, telegramUserId: nonce.telegramUserId, telegramChatId: nonce.telegramChatId };
    }
    if (activeTelegramLink && activeXLink) {
      await ctx.db.patch(nonce._id, { consumedAt: now });
      await ctx.db.patch(activeTelegramLink._id, { lastAuthenticatedAt: now, updatedAt: now });
      return { status: "linked" as const, telegramUserId: nonce.telegramUserId, telegramChatId: nonce.telegramChatId };
    }
    await ctx.db.patch(nonce._id, { consumedAt: now });
    await ctx.db.insert("telegramAccountLinks", {
      telegramUserId: nonce.telegramUserId,
      telegramChatId: nonce.telegramChatId,
      telegramUsername: nonce.telegramUsername,
      ownerXUserId: args.ownerXUserId,
      linkedAt: now,
      lastAuthenticatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
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
        ? 'This wallet is already linked to another TG. Post "@ArcBot unlink TG" on X to unlink the attached account.'
        : linked.status === "telegram_already_linked"
          ? "This TG account is already linked to another Arc Bot wallet. Tap Unlink TG before linking a different X account."
          : "Confirmed: Your X account is linked to Arc Bot. Use /wallet, /balance, or /help to get started.";
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
    const updateId = String(update.update_id);
    const reserved = await ctx.runMutation(internal.telegram.reserveUpdate, {
      updateId,
      ...(Number.isSafeInteger(userId) ? { telegramUserId: String(userId) } : {}),
      ...(Number.isSafeInteger(chatId) ? { telegramChatId: String(chatId) } : {}),
    });
    if (!reserved) return true;
    await ctx.scheduler.runAfter(0, internal.telegram.processUpdate, { updateId, updateJson: args.updateJson });
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
      if (callback?.id) await telegramApi("answerCallbackQuery", { callback_query_id: callback.id });
      if (!message?.chat?.id || message.chat.type !== "private" || !from?.id || from.is_bot) {
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      const chatId = String(message.chat.id);
      const telegramUserId = String(from.id);
      const rawText = (update.message?.text || callback?.data || "").trim();
      const text = rawText;
      if (disabledCreationRequest(text)) {
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      if (update.message?.text) await ctx.runMutation(internal.telegram.recordMessage, { telegramUserId, telegramChatId: chatId, role: "user", text, updateId: args.updateId });
      const command = commandName(text);
      const binding = await ctx.runQuery(internal.telegram.boundUpdateLink, { updateId: args.updateId, telegramUserId, telegramChatId: chatId });
      if (!binding.valid) {
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "ignored" });
        return;
      }
      const link = binding.link;
      let burnedResume = link ? await ctx.runMutation(internal.burnedLookups.resume, {
        owner: link.ownerXUserId, source: "telegram", text,
      }) : null;
      const assertBoundLink = async () => {
        const current = await ctx.runQuery(internal.telegram.boundUpdateLink, { updateId: args.updateId, telegramUserId, telegramChatId: chatId });
        if (!current.valid || current.link?._id !== link?._id) throw new Error("Telegram wallet link changed; request cancelled");
      };
      if (!await ctx.runMutation(internal.telegram.consumeRateLimit, { telegramUserId })) {
        await sendMessage(chatId, "Pending: Telegram request limit reached. Wait a few minutes.");
        await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
        return;
      }
      if (isTelegramUnlinkCommand(text) && link) {
        const revoked = await ctx.runMutation(internal.telegram.revokeLinkByTelegram, {
          telegramUserId, ownerXUserId: link.ownerXUserId,
        });
        await sendMessage(chatId, revoked
          ? "Confirmed: Telegram has been unlinked from your Arc Bot X account. Your wallet and funds are unchanged."
          : "No active Telegram link was found.");
      } else if (command === "/link" && link) {
        await sendMessage(chatId, "Confirmed: Your Telegram account is linked to your Arc Bot X account.");
      } else if (!link) {
        const nonce = randomNonce();
        await ctx.runMutation(internal.telegram.storeLinkNonce, {
          nonceHash: await sha256(nonce), telegramUserId, telegramChatId: chatId,
          ...(from.username ? { telegramUsername: from.username } : {}), expiresAt: Date.now() + LINK_TTL_MS,
        });
        const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
        if (!site) throw new Error("Telegram linking is not configured");
        await sendMessage(chatId, "Link your X account to use your Arc Bot wallet in Telegram.", {
          inline_keyboard: [[{ text: "Link X Account", url: `${site}/api/auth/x/start?telegramLink=${nonce}` }]],
        });
      } else if (command === "/start" || command === "/help" || /^(?:what can you do\??|help)$/i.test(text)) {
        // Keep the menu conversational: the next reply can be a natural
        // selection such as "I want to buy", not only a slash command.
        await ctx.runMutation(internal.telegram.setConversation, { telegramUserId, telegramChatId: chatId, operation: "root" });
        await sendMessage(chatId, GENERAL_GUIDED_HELP_MESSAGE, {
          inline_keyboard: [
            [{ text: "Wallet", callback_data: "/wallet" }, { text: "Balances", callback_data: "/balance" }],
            [{ text: "Buy", callback_data: "guide:buy" }, { text: "Sell", callback_data: "guide:sell" }, { text: "Swap", callback_data: "guide:swap" }],
            [{ text: "Send", callback_data: "guide:send" }, { text: "Burn", callback_data: "guide:burn" }],
            [{ text: "Claim Fees", callback_data: "guide:claim_fees" }],
            [{ text: "Unlink TG", callback_data: "/unlink" }],
          ],
        });
      } else if (command === "/cancel" || guidedHelpCancelled(text)) {
        await ctx.runMutation(internal.walletContinuations.clear, { owner: link.ownerXUserId, source: "telegram", scope: `${telegramUserId}:${link._id}` });

        await ctx.runMutation(internal.telegram.clearConversation, { telegramUserId });
        await sendMessage(chatId, "Cancelled.");
      } else {
        const currentConversation = await ctx.runQuery(internal.telegram.activeConversation, { telegramUserId });
        const resumed = await ctx.runAction(internal.walletContinuations.resolve, {
          owner: link.ownerXUserId, source: "telegram", scope: `${telegramUserId}:${link._id}`, text, requestId: args.updateId,
        });
        if (resumed?.message || (!resumed?.commandJson && !currentConversation && isResumeReply(text)
          && await ctx.runQuery(internal.telegram.expiredConversation, { telegramUserId, telegramChatId: chatId }))) {
          await sendMessage(chatId, resumed?.message || WORKFLOW_EXPIRED_MESSAGE);
          await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
          return;
        }
        if (burnedResume && currentConversation && currentConversation.operation !== "root") {
          await ctx.runMutation(internal.burnedLookups.resume, {
            owner: link.ownerXUserId, source: "telegram", text, superseded: true,
          });
          burnedResume = null;
        }
        const selectedGuide = telegramMenuGuideOperation(text, currentConversation?.operation === "root");
        if (selectedGuide) {

          await ctx.runMutation(internal.telegram.setConversation, { telegramUserId, telegramChatId: chatId, operation: selectedGuide });
          await sendMessage(chatId, telegramGuidePrompt(selectedGuide));
          await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
          return;
        }
        const conversation = currentConversation;
        if (conversation && guidedHelpCancelled(text)) {
          await ctx.runMutation(internal.telegram.clearConversation, { telegramUserId });
          await sendMessage(chatId, "Cancelled.");
          await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
          return;
        }
        const operation = conversation ? telegramGuideOperation(`guide:${conversation.operation}`) : null;
        const claimChoice = operation === "claim" ? guidedHelpClaimSelection(text) : null;

        let effectiveText = telegramCommandText(operation ? guidedHelpCommandText(text, operation) : text);

        if (!resumed?.commandJson && conversation?.operation === "gas_resume" && isResumeReply(text)) {
          const saved = await ctx.runMutation(internal.telegram.consumeGasResume, {
            conversationId: conversation._id, telegramUserId, telegramChatId: chatId, ownerXUserId: link.ownerXUserId,
          });
          if (!saved) {
            await sendMessage(chatId, WORKFLOW_EXPIRED_MESSAGE);
            await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
            return;
          }
          effectiveText = saved;
        }

        await assertBoundLink();

        if (operation === "claim") {
          if (claimChoice === "creator") {
            await ctx.runMutation(internal.telegram.setConversation, { telegramUserId, telegramChatId: chatId, operation: "claim_fees" });
            await sendMessage(chatId, guidedHelpPrompt("claim_fees"));
          } else if (!claimChoice) {
            await sendMessage(chatId, guidedHelpPrompt("claim"));
          }
          await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
          return;
        }

        if (burnedResume === "expired") {
          await sendMessage(chatId, WORKFLOW_EXPIRED_MESSAGE);
          await ctx.runMutation(internal.telegram.updateStatus, { updateId: args.updateId, status: "completed" });
          return;
        }
        if (burnedResume) effectiveText = burnedResume;
        const restored = resumed?.commandJson ? validateStructuredWalletCommand(JSON.parse(resumed.commandJson)) : null;
        const intent = restored ? { kind: "command" as const, command: restored } : await parseXWalletIntent(effectiveText, false);
        if ((intent.kind === "command" && disabledCreationKind(intent.command.kind)) || (intent.kind === "help" && disabledCreationKind(intent.topic))) return;
        if (intent.kind === "help") {
          await sendMessage(chatId, operation && guidedHelpQuestion(text)
            ? telegramGuideQuestionResponse(operation, walletHelpMessage(intent.topic))
            : walletHelpMessage(intent.topic));
        } else if (intent.kind !== "command") {
          await sendMessage(chatId, "Could not identify a supported wallet request. Use /help to see the available actions.");
        } else if (!isTerminalCommand(intent.command)) {
          await sendMessage(chatId, intent.command.kind === "launch"
            ? "Command not supported."
            : "Creator-fee controls are available through X posts only.");
        } else if (!telegramRecipientAllowed(intent.command)) {
          await sendMessage(chatId, "Action needed: Telegram sends require a complete wallet address. @handles are not accepted because they could refer to either a Telegram or X account.");
        } else {
          const recipientAddress = intent.command.kind === "send" || intent.command.kind === "buy_and_send"
            ? await ctx.runAction(internal.xReplies.resolveTerminalRecipient, { recipient: intent.command.recipient })
            : undefined;
          const sourcePostId = `tg_${telegramUserId}_${message.message_id || args.updateId}`;
          const requestId = `telegram:${telegramUserId}:${args.updateId}:${intent.command.kind}`;
          await assertBoundLink();
          await ctx.runMutation(internal.telegramDeliveries.enqueue, { requestId, ownerXUserId: link.ownerXUserId,
            telegramUserId, telegramChatId: chatId, telegramUpdateId: args.updateId });
          if (!resumed?.commandJson && isValueMovingCommand(intent.command)) await ctx.runMutation(internal.walletContinuations.clear, {
            owner: link.ownerXUserId, source: "telegram", scope: `${telegramUserId}:${link._id}`,
          });
          const result = await ctx.runAction(internal.wallets.executeCommand, {
            sourcePostId,
            requestId,
            xUserId: link.ownerXUserId,
            text: effectiveText,
            parsedCommandJson: JSON.stringify(intent.command),
            telegramUpdateId: args.updateId,
            source: "telegram",
            channel: "telegram_chat",
            ...(recipientAddress ? { recipientAddress } : {}),
          });
          if (result.deferred) {
            // Once a concrete transaction is admitted, later chat messages
            // must not be interpreted as answers to its old guide prompt.
            await ctx.runMutation(internal.telegram.clearConversation, { telegramUserId });
            await sendMessage(chatId, "Pending: Your request is processing...");
          } else {
            if (isValueMovingCommand(intent.command) || operation !== null) await ctx.runMutation(internal.telegram.clearConversation, { telegramUserId });
            await ctx.runMutation(internal.walletContinuations.save, {
              owner: link.ownerXUserId, source: "telegram", scope: `${telegramUserId}:${link._id}`, requestId: args.updateId,
              commandJson: JSON.stringify(intent.command), sourceText: resumed?.sourceText || effectiveText, message: result.message,
            });
            if (isGasResumePrompt(result.message)) await ctx.runMutation(internal.telegram.setConversation, {
              telegramUserId, telegramChatId: chatId, operation: "gas_resume",
              resumeText: effectiveText, resumeOwner: link.ownerXUserId,
            });

            await ctx.runMutation(internal.telegramDeliveries.setText, { requestId, text: result.message });
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
    const updateId = args.requestId.match(/^telegram:\d+:(\d+):/)?.[1];
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
    await sendMessage(args.telegramChatId, args.text);
    await ctx.runMutation(internal.telegram.recordMessage, {
      telegramUserId: args.telegramUserId, telegramChatId: args.telegramChatId, role: "assistant", text: args.text, requestId: args.requestId,
    });
    return true;
  },
});
