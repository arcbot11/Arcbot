vi.mock("../lib/x-posting-identity",()=>({verifyXPostingIdentity:vi.fn(async()=>{})}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { readFileSync } from "node:fs";
import * as queue from "../convex/xReplyQueue";
import * as replies from "../convex/xReplies";
import { replyQueueExpiresAt, replyQueuePriority, replyQueueWaitMs } from "../lib/x-reply-queue-policy";
import { feeUpgradeSuccessMessage } from "../lib/fee-upgrade-command";
import { verifyXPostingIdentity } from "../lib/x-posting-identity";

// Real Convex handlers with an index-aware in-memory DB; no live X, AI or wallets.
type Row = Record<string, any>;
const invoke = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);
function fixture() {
  const rows: Record<string, Row[]> = {};
  let sequence = 0;
  const indexes: Record<string, string[]> = {
    by_status_priority_ready: ["status", "priority", "readyAt"], by_status_expiry: ["status", "expiresAt"],
    by_status_kind_ready: ["status", "kind", "readyAt"],
    by_created_at: ["createdAt"], by_post_id: ["postId"],
  };
  const compare = (a: any, b: any) => a === b ? 0 : a === undefined ? -1 : b === undefined ? 1 : a < b ? -1 : 1;
  const db = {
    async insert(table: string, row: Row) {
      const id = `${table}:${++sequence}`;
      (rows[table] ??= []).push({ ...row, _id: id, _creationTime: sequence });
      return id;
    },
    async get(id: string) { return Object.values(rows).flat().find(r => r._id === id) ?? null; },
    async patch(id: string, patch: Row) {
      const row = await db.get(id); if (!row) throw Error(`Missing ${id}`);
      Object.assign(row, patch);
    },
    query(table: string) {
      const predicates: Array<(r: Row) => boolean> = [];
      let keys: string[] = [], direction = 1;
      const idx = {
        eq(k: string, v: any) { predicates.push(r => r[k] === v); return idx; },
        gt(k: string, v: any) { predicates.push(r => r[k] > v); return idx; },
        gte(k: string, v: any) { predicates.push(r => r[k] >= v); return idx; },
        lte(k: string, v: any) { predicates.push(r => r[k] <= v); return idx; },
      };
      const get = () => (rows[table] ?? []).filter(r => predicates.every(p => p(r))).sort((a, b) => {
        for (const key of [...keys, "_creationTime"]) { const diff = compare(a[key], b[key]); if (diff) return direction * diff; }
        return 0;
      });
      const q = {
        withIndex(name: string, fn?: any) { keys = indexes[name] ?? []; fn?.(idx); return q; },
        order(d: string) { direction = d === "desc" ? -1 : 1; return q; },
        async unique() { const all = get(); if (all.length > 1) throw Error("not unique"); return all[0] ?? null; },
        async first() { return get()[0] ?? null; }, async take(n: number) { return get().slice(0, n); },
      };
      return q;
    },
  };
  const ctx: any = { db, rows, scheduler: { runAfter: vi.fn() }, runAction: vi.fn(() => { throw Error("Wallet/AI forbidden"); }) };
  const call = (ref: any, args: any) => {
    const [module, name] = getFunctionName(ref).split(":");
    if (!["xReplyQueue", "xReplies"].includes(module)) throw Error(`Forbidden module ${module}`);
    return invoke((module === "xReplyQueue" ? queue : replies as any)[name], ctx, args);
  };
  ctx.runMutation = vi.fn(call); ctx.runQuery = vi.fn(call);
  return ctx;
}
const state = (ctx: ReturnType<typeof fixture>) => ctx.rows.xReplyQueueState[0];
const row = (ctx: ReturnType<typeof fixture>, key: string) => ctx.rows.xReplyQueue.find((r: Row) => r.key === key)!;
async function source(ctx: ReturnType<typeof fixture>, id: string, kind = "buy", extra: Row = {}) {
  await ctx.db.insert("xReplyUsers", { xUserId: id, username: `user${id}` });
  return ctx.db.insert("xReplyInteractions", { postId: id, authorXUserId: id, text: "@TheArgosBot user request", commandKind: kind,
    status: "processing", createdAt: Date.now(), updatedAt: Date.now(), ...extra });
}
async function add(ctx: ReturnType<typeof fixture>, key: string, priority: "A" | "B" | "C", extra: Row = {}) {
  await source(ctx, key, priority === "C" ? "help" : "buy");
  return invoke(queue.enqueue, ctx, { key, postId: key, kind: "reply", text: priority === "A" ? "Confirmed: Bought 10 TEST!" : priority === "B" ? "Action needed: More than one indexed token uses that ticker." : "💡 Tell me buy or sell.", ...extra });
}
const take = (ctx: ReturnType<typeof fixture>) => invoke(queue.takeNext, ctx, { wakeToken: state(ctx).wakeToken });

describe("bot-authored posts",()=>{
  const botId="2097696306135220226";
  it("silently rejects the bot's own incoming tweet",async()=>{
    const ctx=fixture();
    expect(await invoke(replies.reserveInteraction,ctx,{postId:"self",authorXUserId:botId,text:"@TheArgosBot buy 10 ARGUS"})).toBe(false);
    expect(ctx.rows.xReplyInteractions).toBeUndefined();expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });
  it("does not enqueue replies to the bot's own post",async()=>{
    const ctx=fixture();await source(ctx,"self","buy",{authorXUserId:botId});
    expect(await invoke(queue.enqueue,ctx,{key:"self",postId:"self",kind:"reply",text:"Result"})).toMatchObject({status:"cancelled"});
    expect(ctx.rows.xReplyQueue).toBeUndefined();
  });
  it("cancels an already queued self-reply before publication",async()=>{
    const ctx=fixture();await add(ctx,"queued","A");
    const interaction=ctx.rows.xReplyInteractions.find((r:Row)=>r.postId==="queued");await ctx.db.patch(interaction._id,{authorXUserId:botId});
    expect(await take(ctx)).toBeNull();expect(row(ctx,"queued").status).toBe("cancelled");
  });
  it("allows another user to issue a command in reply to a bot post",async()=>{
    const ctx=fixture();await source(ctx,"bot-post","help",{authorXUserId:botId,responsePostId:"bot-parent"});
    await source(ctx,"human-reply","buy",{authorXUserId:"human",parentPostId:"bot-parent",text:"@TheArgosBot buy 10 ARGUS"});
    expect(await invoke(queue.enqueue,ctx,{key:"human-reply",postId:"human-reply",kind:"reply",text:"Result"})).toMatchObject({status:"queued"});
    expect((await take(ctx))?.row.postId).toBe("human-reply");
  });
});

describe("explicit tag required",()=>{
  it("rejects untagged intake even when the parent authorized a workflow",async()=>{
    const ctx=fixture();
    expect(await invoke(replies.reserveInteraction,ctx,{postId:"untagged",authorXUserId:"human",text:"buy 10 ARGUS",parentPostId:"bot-parent",botParentAuthorized:true})).toBe(false);
    expect(ctx.rows.xReplyInteractions).toBeUndefined();
  });
  it("rejects queued responses to untagged posts",async()=>{
    const ctx=fixture();await source(ctx,"untagged","buy",{text:"buy 10 ARGUS"});
    expect(await invoke(queue.enqueue,ctx,{key:"untagged",postId:"untagged",kind:"reply",text:"Result"})).toMatchObject({status:"cancelled"});
  });
  it("cancels previously queued replies if the original post lacks a tag",async()=>{
    const ctx=fixture();await add(ctx,"old","A");
    const interaction=ctx.rows.xReplyInteractions.find((r:Row)=>r.postId==="old");await ctx.db.patch(interaction._id,{text:"buy 10 ARGUS"});
    expect(await take(ctx)).toBeNull();expect(row(ctx,"old").status).toBe("cancelled");
  });
});

describe("unverified daily reply budget", () => {
  it("warns on 7, caps all kinds at 10, deduplicates, and resets at UTC midnight", async () => {
    const ctx = fixture();
    for (let n = 1; n <= 11; n++) {
      const id = `daily-${n}`;
      await source(ctx, id, "buy", { authorXUserId: "limited", authorVerified: false });
      const args = { key: id, postId: id, kind: n % 2 ? "liquidity" : "reply", text: "Result" };
      const result = await invoke(queue.enqueue, ctx, args);
      expect(result.status).toBe(n <= 10 ? "queued" : "cancelled");
      if (n <= 10) {
        expect(row(ctx, id).text.includes("7 of your 10")).toBe(n === 7);
        await invoke(queue.enqueue, ctx, args);
      }
    }
    expect(ctx.rows.xUnverifiedReplyDays[0].count).toBe(10);
    expect(await invoke(replies.consumeReplyLimit, ctx, { xUserId: "limited", premium: true, postId: "daily-11" }))
      .toMatchObject({ allowed: false, shouldNotify: false });
    vi.setSystemTime(new Date("2026-09-01T00:00:01Z"));
    await source(ctx, "next-day", "buy", { authorXUserId: "limited", authorVerified: false });
    expect((await invoke(queue.enqueue, ctx, { key: "next-day", postId: "next-day", kind: "reply", text: "Result" })).status).toBe("queued");
  });
  it.each(["expired", "wrong-owner"])("does not extend a %s chain", async scenario => {
    const ctx = fixture();
    await ctx.db.insert("xUnverifiedReplyDays", { xUserId: "limited", day: "2026-08-31", count: 10,
      continuationPostId: "parent", continuationUntil: Date.now() + (scenario === "expired" ? -1 : 60_000) });
    await source(ctx, "parent", "guided_help:launch", { authorXUserId: scenario === "wrong-owner" ? "other" : "limited", responsePostId: "bot" });
    await source(ctx, "child", "guided_help:launch", { authorXUserId: "limited", authorVerified: false, parentPostId: "bot" });
    expect((await invoke(queue.enqueue, ctx, { key: "child", postId: "child", kind: "guided_reply", text: "Next." })).status).toBe("cancelled");
  });
  it("does not impose this budget on verified users", async () => {
    const ctx = fixture();
    for (let n = 0; n < 17; n++) {
      const id = `verified-${n}`;
      await source(ctx, id, "buy", { authorXUserId: "verified", authorVerified: true });
      expect((await invoke(queue.enqueue, ctx, { key: id, postId: id, kind: "reply", text: "Result" })).status).toBe("queued");
    }
    expect(ctx.rows.xUnverifiedReplyDays || []).toHaveLength(0);
  });
});
async function done(ctx: ReturnType<typeof fixture>, picked: any, extra: Row = {}) {
  return invoke(queue.finish, ctx, { queueId: picked.row._id, leaseToken: picked.leaseToken, outcome: "published", responsePostId: `reply-${picked.row.key}`, ...extra });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-31T18:00:00Z"));
  vi.stubEnv("X_REPLIES_ENABLED", "true"); vi.stubEnv("X_STANDALONE_MENTIONS_ENABLED", "false");
  vi.stubEnv("X_SUPPRESS_ROUTINE_FAILURE_REPLIES", "false"); vi.stubEnv("X_GRADUATION_POSTS_ENABLED", "true");
  for (const name of ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]) vi.stubEnv(name, "offline-test-only");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Network forbidden"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("priority categories", () => {
  it("keeps actual no-emoji upgrade confirmations in A without promoting automatic-fee notices", () => {
    expect(replyQueuePriority(feeUpgradeSuccessMessage("ARCBOT", "https://arcbot.invalid/token/example"), "upgrade_fees", true)).toBe("A");
    expect(replyQueuePriority("ℹ️ $ARCBOT is an Argos Bot V2 token. Creator-fee claims and payouts are automated; 5% buys back and burns $ARCBOT.", "claim_fees", true)).toBe("C");
    expect(replyQueuePriority("There aren't any creator fees available to claim in that asset right now.", "claim_fees", true)).toBe("C");
  });
  it.each([
    ["Confirmed: Launched Help (HELP) on Argus!", "launch", "A"],
    ["Confirmed: Your Argos Bot wallet is ready!", "show_wallet", "C"],
    ["🔄 Buy, sell, send and burn with me!", "help", "C"],
    ["Failed: Swap failed.", "legacy_swap_final", "A"],
    ["🚀 $TEST has graduated!", "graduation", "A"],
    ["Action needed: The buy completed, but the send did not.", "buy_and_send", "A"],
    ["Action needed: The MSFT sale completed, but the purchase of ARCBOT failed.", "swap", "A"],
    ["Action needed: The holder distributor was created, but future fees were not reassigned.", "reassign_fees", "A"],
    ["Pending: An upgrade is already being processed for that token. Wait for the result.", "upgrade_fees", "A"],
    ["There's an issue with this token's upgrade - DM @TheArgosBot for help", "upgrade_fees", "A"],
    ["The MSFT purchase completed, but the final launch did not.", "launch", "A"],
    ["Failed: I couldn't complete that wallet request. Check the details and give it another try!", "buy", "A"],
    ["🌐 The network couldn't submit that transaction.", "send", "A"],
    ["💧 I couldn't find enough liquidity or a usable route for that trade.", "buy", "A"],
    ["⛽ Network fees moved too quickly before broadcast.", "launch", "A"],
    ["Action needed: More than one indexed token uses that ticker.", "buy", "B"],
    ["Action needed: That pairing asset isn't currently supported on Argus.", "launch", "B"],
    ["🔒 You don't have the rights to reassign fees.", "reassign_fees", "B"],
    ["Failed: You don't have enough of this token's paired asset yet.", "buy", "B"],
    ["Failed: There aren't enough funds for that amount.", "buy", "B"],
    ["⛽ There isn't enough ETH in your wallet to cover this transaction and network gas.", "send", "C"],
    ["There aren't any creator fees available to claim in that asset right now.", "claim_fees", "C"],
    ["ℹ️ $ARCBOT is an Argos Bot V2 token. Creator-fee claims and payouts are automated; 5% buys back and burns $ARCBOT.", "claim_fees", "C"],
    ["ℹ️ $ARCBOT is already an Argos Bot V2 token.", "upgrade_fees", "C"],
    ["Pending: Your wallet is still processing an earlier transaction.", "launch", "C"],
    ["🤔 I couldn't quite make that out. Try show my wallet.", "unknown_wallet", "C"],
    ["🟢 What would you like to buy?", "guided_help:buy", "B"],
    ["Confirmed: Bought 10 TEST!\n\nAnything else?", "guided_execution", "A"],
  ])("%s -> %s/%s", (text, kind, expected) => expect(replyQueuePriority(text, kind)).toBe(expected));
});

describe("pacing math", () => {
  it("fits eight, not nine, into a rolling two-minute chunk below 65% usage", () => {
    const now = Date.now(), attempts = [0, 10, 20, 30, 40, 50, 60, 70].map(delta => ({ at: now + delta }));
    expect(replyQueueWaitMs(attempts.slice(0, 7), "A", now + 80)).toBe(0);
    expect(replyQueueWaitMs(attempts, "A", now + 119_999)).toBe(1);
    expect(replyQueueWaitMs(attempts, "A", now + 120_000)).toBe(0);
  });
  it("uses a 45-second C gap below 65% usage", () => {
    const now = Date.now(), attempts = [{ at: now + 119_999, priority: "C" as const }];
    expect(replyQueueWaitMs(attempts, "C", now + 120_000)).toBe(44_999);
    expect(replyQueueWaitMs(attempts, "A", now + 120_000)).toBe(0);
    expect(replyQueueWaitMs([], "C", 0)).toBe(0);
  });
  it("uses four per two minutes and a 150-second C gap at 65% usage", () => {
    const now = Date.now();
    const old = Array.from({ length: 192 }, (_, index) => ({ at: now - 60 * 60_000 - index }));
    const recent = [0, 10, 20, 30].map(delta => ({ at: now - delta, priority: "C" as const }));
    expect(replyQueueWaitMs([...old, ...recent.slice(0, 3)], "A", now)).toBe(0);
    expect(replyQueueWaitMs([...old, ...recent], "A", now)).toBe(119_970);
    expect(replyQueueWaitMs([...old, ...recent], "C", now)).toBe(150_000);
  });
  it("holds C at 80% and B/C at 90% while A remains eligible", () => {
    const now = Date.now();
    const attempts240 = Array.from({ length: 240 }, (_, index) => ({ at: now - 60 * 60_000 - index }));
    expect(replyQueueWaitMs(attempts240, "C", now, undefined, "liquidity")).toBeGreaterThan(0);
    expect(replyQueueWaitMs(attempts240, "B", now, undefined, "guided_reply")).toBe(0);
    expect(replyQueueWaitMs(attempts240, "A", now, undefined, "liquidity")).toBe(0);
    const attempts270 = Array.from({ length: 270 }, (_, index) => ({ at: now - 60 * 60_000 - index }));
    expect(replyQueueWaitMs(attempts270, "B", now, undefined, "guided_reply")).toBeGreaterThan(0);
    expect(replyQueueWaitMs(attempts270, "C", now, undefined, "liquidity")).toBeGreaterThan(0);
    expect(replyQueueWaitMs(attempts270, "A", now, undefined, "liquidity")).toBe(0);
  });
  it("honors real X headers and three-hour capacity at rollout", () => {
    const now = Date.now();
    const old = Array.from({ length: 300 }, (_, i) => ({ at: now - 600_000 + i }));
    expect(replyQueueWaitMs(old, "A", now)).toBe(10_200_000);
    expect(replyQueueWaitMs([], "A", now, { remaining: 0, reset: (now + 900_000) / 1000 })).toBe(900_000);
    expect(replyQueueWaitMs([], "A", now, { blockedUntil: now + 60_000 })).toBe(60_000);
  });
  it("has no A expiry; B/C expire from reply readiness", () => {
    expect(replyQueueExpiresAt("A", 0)).toBeUndefined();
    expect(replyQueueExpiresAt("B", 0)).toBe(900_000);
    expect(replyQueueExpiresAt("C", 0)).toBe(720_000);
  });
  it("exempts trusted workflow continuations from the short window without exempting shared limits", () => {
    const now = Date.now(), ordinary = Array.from({ length: 3 }, () => ({ at: now, priority: "A" as const }));
    expect(replyQueueWaitMs(ordinary, "A", now, undefined, "liquidity")).toBe(0);
    expect(replyQueueWaitMs(ordinary, "B", now, undefined, "guided_reply")).toBe(0);
    expect(replyQueueWaitMs(ordinary, "A", now, undefined, "guided_execution")).toBe(0);
    expect(replyQueueWaitMs(ordinary, "B", now, undefined, "thread_continuation")).toBe(0);
    expect(replyQueueWaitMs(ordinary, "A", now, undefined, "reply")).toBe(0);
    expect(replyQueueWaitMs(ordinary, "A", now, undefined, "legacy_swap_final")).toBe(0);
    expect(replyQueueWaitMs(ordinary.map(a => ({ ...a, kind: "liquidity" })), "A", now)).toBe(0);
  });
  it("allows twenty guided replies per two minutes below 65% three-hour usage", () => {
    const now = Date.now();
    const attempts = Array.from({ length: 20 }, (_, index) => ({
      at: now - index,
      priority: "B" as const,
      kind: "guided_reply",
    }));
    expect(replyQueueWaitMs(attempts.slice(0, 19), "B", now, undefined, "guided_reply")).toBe(0);
    expect(replyQueueWaitMs(attempts, "B", now, undefined, "guided_reply")).toBeGreaterThan(0);
  });
  it("allows ten guided replies per two minutes at or above 65% three-hour usage", () => {
    const now = Date.now();
    const older = Array.from({ length: 186 }, (_, index) => ({ at: now - 60 * 60_000 - index, kind: "reply" }));
    const guided = Array.from({ length: 10 }, (_, index) => ({
      at: now - index,
      priority: "B" as const,
      kind: "guided_reply",
    }));
    expect(replyQueueWaitMs([...older, ...guided.slice(0, 9)], "B", now, undefined, "guided_reply")).toBe(0);
    expect(replyQueueWaitMs([...older, ...guided], "B", now, undefined, "guided_reply")).toBeGreaterThan(0);
  });

});

describe("durable queue", () => {
  it("exempts only a same-owner reply to a prior bot response as a thread continuation", async () => {
    const ctx = fixture();
    await source(ctx, "root-request", "buy", { authorXUserId: "owner", responsePostId: "bot-response" });
    await source(ctx, "owner-followup", "buy", { authorXUserId: "owner", parentPostId: "bot-response" });
    await invoke(queue.enqueue, ctx, {
      key: "owner-followup", postId: "owner-followup", kind: "reply", ok: false,
      text: "Action needed: More than one indexed token uses that ticker.",
    });
    expect(row(ctx, "owner-followup")).toMatchObject({ kind: "thread_continuation", priority: "B" });

    await source(ctx, "foreign-followup", "buy", { authorXUserId: "other", parentPostId: "bot-response" });
    await invoke(queue.enqueue, ctx, {
      key: "foreign-followup", postId: "foreign-followup", kind: "reply", ok: false,
      text: "Action needed: More than one indexed token uses that ticker.",
    });
    expect(row(ctx, "foreign-followup")).toMatchObject({ kind: "reply", priority: "B" });
  });

  it("always selects A then B then C, FIFO within each group", async () => {
    const ctx = fixture();
    for (const [key, priority] of [["c1", "C"], ["b1", "B"], ["a1", "A"], ["a2", "A"], ["b2", "B"]] as const) {
      await add(ctx, key, priority); vi.setSystemTime(Date.now() + 1);
    }
    const first = await take(ctx); expect(first.row.key).toBe("a1"); await done(ctx, first);
    const second = await take(ctx); expect(second.row.key).toBe("a2"); await done(ctx, second);
    const third = await take(ctx); expect(third.row.key).toBe("b1"); await done(ctx, third);
    const fourth = await take(ctx); expect(fourth.row.key).toBe("b2"); await done(ctx, fourth);
    expect((await take(ctx)).row.key).toBe("c1");
    expect(ctx.runAction).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("new A preempts an already-scheduled C wait", async () => {
    const ctx = fixture(); await add(ctx, "c1", "C"); await done(ctx, await take(ctx)); await add(ctx, "c2", "C");
    expect(await take(ctx)).toBeNull(); const oldWake = state(ctx).wakeToken;
    await add(ctx, "a", "A"); expect(state(ctx).wakeToken).not.toBe(oldWake);
    expect(await invoke(queue.takeNext, ctx, { wakeToken: oldWake })).toBeNull();
    expect((await take(ctx)).row.key).toBe("a");
  });
  it("expires only B/C, even after a week disabled", async () => {
    const ctx = fixture(); vi.stubEnv("X_REPLIES_ENABLED", "false");
    await add(ctx, "a", "A"); await add(ctx, "b", "B"); await add(ctx, "c", "C");
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 7 * 86400_000); vi.stubEnv("X_REPLIES_ENABLED", "true");
    await invoke(queue.kick, ctx); expect((await take(ctx)).row.key).toBe("a");
    expect(row(ctx, "b").status).toBe("expired"); expect(row(ctx, "c").status).toBe("expired");
    expect(ctx.rows.xReplyInteractions.filter((r: Row) => r.status === "rejected")).toHaveLength(2);
  });
  it("duplicate ready notifications preserve text and original expiry", async () => {
    const ctx = fixture(); await add(ctx, "b", "B"); const original = { ...row(ctx, "b") };
    vi.setSystemTime(Date.now() + 590_000);
    expect(await invoke(queue.enqueue, ctx, { key: "b", postId: "b", kind: "reply", text: "Confirmed: Different reply" })).toMatchObject({ status: "queued" });
    expect(row(ctx, "b")).toEqual(original); expect(ctx.rows.xReplyQueue).toHaveLength(1);
  });
  it("cannot start two publishers for the same wake token", async () => {
    const ctx = fixture(); await add(ctx, "a", "A"); await add(ctx, "b", "B"); const token = state(ctx).wakeToken;
    const first = await invoke(queue.takeNext, ctx, { wakeToken: token });
    expect(await invoke(queue.takeNext, ctx, { wakeToken: token })).toBeNull();
    await add(ctx, "other", "A"); expect(state(ctx).activeId).toBe(first.row._id);
    await done(ctx, first, { leaseToken: "wrong" }); expect(row(ctx, "a").status).toBe("sending");
  });
  it("retains A through repeated explicit provider rejections without retrying commands", async () => {
    const ctx = fixture(); await add(ctx, "a", "A");
    for (let i = 0; i < 12; i++) {
      const picked = await take(ctx); expect(picked.row.key).toBe("a");
      await done(ctx, picked, { outcome: "retry", responsePostId: undefined, httpStatus: 429, retryAfterMs: 60_000 });
      expect(await take(ctx)).toBeNull(); vi.setSystemTime(state(ctx).wakeAt);
    }
    expect(row(ctx, "a").attempts).toBe(12); expect(row(ctx, "a").expiresAt).toBeUndefined();
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter.mock.calls.every((c: any[]) => getFunctionName(c[1]) === "xReplies:drainReplyQueue")).toBe(true);
  });
  it("shares provider Retry-After across priorities", async () => {
    const ctx = fixture(); await add(ctx, "b", "B"); await done(ctx, await take(ctx), { outcome: "retry", httpStatus: 429, retryAfterMs: 120_000 });
    await add(ctx, "a", "A"); expect(await take(ctx)).toBeNull(); expect(state(ctx).wakeAt).toBe(Date.now() + 120_000);
  });
  it("does not revive cancelled, suppressed or ambiguous pre-rollout requests", async () => {
    const ctx = fixture();
    for (const [key, extra, expected] of [["cancel", { commandKind: "operator_cancelled" }, "cancelled"], ["hidden", { replySuppressedReason: "operator" }, "cancelled"], ["old", { publicationAttempted: true }, "uncertain"], ["done", { status: "rejected" }, "cancelled"]] as const) {
      await source(ctx, key, "buy", extra);
      expect(await invoke(queue.enqueue, ctx, { key, postId: key, kind: "reply", text: "Confirmed: Done" })).toMatchObject({ status: expected });
    }
    expect(ctx.rows.xReplyQueue).toBeUndefined(); expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });
  it("checks operator cancellation again before sending", async () => {
    const ctx = fixture(); await add(ctx, "a", "A"); ctx.rows.xReplyInteractions[0].commandKind = "operator_cancelled";
    expect(await take(ctx)).toBeNull(); expect(row(ctx, "a").status).toBe("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("seals temporary suppressed replies without scheduling stale recovery", async () => {
    const ctx = fixture(); vi.stubEnv("X_SUPPRESS_ROUTINE_FAILURE_REPLIES", "true"); await source(ctx, "a");
    expect(await invoke(queue.enqueue, ctx, { key: "a", postId: "a", kind: "reply", text: "🤔 I couldn't quite make that out." })).toMatchObject({ status: "cancelled" });
    expect(ctx.rows.xReplyInteractions[0]).toMatchObject({ status: "rejected", replySuppressedReason: "ai_ambiguity" });
  });
  it("does not rerun wallet work when old retry jobs arrive for queued outcomes", async () => {
    const ctx = fixture(); await add(ctx, "a", "A");
    await invoke(replies.retryInteraction, ctx, { postId: "a" });
    await invoke(replies.scheduleInteractionRetry, ctx, { postId: "a", safeError: "old retry" });
    await invoke(replies.updateInteraction, ctx, { postId: "a", status: "processing" });
    expect(ctx.rows.xReplyInteractions[0]).toMatchObject({ status: "publishing", publicationQueued: true });
    expect(ctx.runAction).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("recovers a lost wake but never automatically repeats an ambiguous POST", async () => {
    const ctx = fixture(); await add(ctx, "a", "A"); await add(ctx, "next", "A"); await take(ctx);
    vi.setSystemTime(Date.now() + 90_001); await invoke(queue.kick, ctx);
    expect(row(ctx, "a").status).toBe("uncertain"); expect((await take(ctx)).row.key).toBe("next");
    expect(ctx.rows.xReplyInteractions[0].publicationQueued).toBe(true);
  });
  it("bootstraps recent use and headers once instead of resetting capacity", async () => {
    const ctx = fixture();
    for (let i = 0; i < 3; i++) await ctx.db.insert("xPublicationEvents", { postId: `old${i}`, status: "published", createdAt: Date.now() - 1000, rateLimitRemaining: 0, rateLimitReset: (Date.now() + 300_000) / 1000 });
    await add(ctx, "a", "A"); expect(await take(ctx)).toBeNull(); expect(state(ctx).wakeAt).toBe(Date.now() + 300_000);
  });
  it("replaces the former half-scale outbound cap", async () => {
    const ctx = fixture(); vi.stubEnv("X_REPLY_BUDGET_SCALE", "0.5");
    for (let i = 0; i < 15; i++) { await add(ctx, `${i}`, "A"); if (i && i % 3 === 0) vi.setSystemTime(Date.now() + 120_000); await done(ctx, await take(ctx)); }
    expect(ctx.rows.xReplyQueue.filter((r: Row) => r.status === "published")).toHaveLength(15);
  });
});

describe("queue-owned completion bindings", () => {
  it("keeps disabled announcements out of the transaction queue", async () => {
    const ctx = fixture(); const launchId = await ctx.db.insert("tokenLaunches", { publicPublished: true, graduationAnnouncementStatus: "posting" });
    expect(await invoke(replies.publishStandalonePost, ctx, { launchId, publicationKey: "grad", text: "Token graduated" })).toMatchObject({ status: "rejected" });
    await add(ctx, "trade", "A");
    expect((await take(ctx)).row.key).toBe("trade");
  });
  it("records successful delivery separately from a rejected command", async () => {
    const ctx = fixture(); await source(ctx, "funding", "buy");
    expect(await invoke(queue.enqueue, ctx, { key: "funding", postId: "funding", text: "Insufficient USDC. Fund your wallet and submit the full command again.", ok: false, kind: "reply" })).toMatchObject({ status: "queued" });
    const picked = await take(ctx); await done(ctx, picked);
    expect(ctx.rows.xReplyInteractions[0]).toMatchObject({ status: "rejected", publicationStatus: "published", publicationQueued: false, responsePostId: "reply-funding" });
  });
});

describe("actual publisher using a mocked X transport", () => {
  it("blocks posting when credentials belong to another account", async () => {
    const ctx = fixture(); await add(ctx, "a", "A");
    vi.mocked(verifyXPostingIdentity).mockRejectedValueOnce(new Error("Wrong posting account"));
    await invoke(replies.drainReplyQueue, ctx, { wakeToken: state(ctx).wakeToken });
    expect(fetch).not.toHaveBeenCalled();
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(row(ctx, "a").status).toBe("blocked");
  });
  it("posts the frozen text once and records headers", async () => {
    const ctx = fixture(); await add(ctx, "a", "A"); const text = row(ctx, "a").text;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { id: "published-id" } }), { status: 201, headers: { "x-rate-limit-remaining": "91", "x-rate-limit-reset": String(Date.now() / 1000 + 900) } }));
    const args = { wakeToken: state(ctx).wakeToken }; await invoke(replies.drainReplyQueue, ctx, args); await invoke(replies.drainReplyQueue, ctx, args);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ text, reply: { in_reply_to_tweet_id: "a" } });
    expect(row(ctx, "a")).toMatchObject({ status: "published", responsePostId: "published-id" }); expect(state(ctx).remaining).toBe(91);
  });
  it.each([[429, "retry", "queued"], [403, "blocked", "blocked"], [500, "uncertain", "uncertain"], [200, "uncertain", "uncertain"]])("HTTP %s does not replay wallet work", async (http, _outcome, expected) => {
    const ctx = fixture(); await add(ctx, "a", "A"); vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: "Provider rejected this request" }), { status: Number(http) }));
    await invoke(replies.drainReplyQueue, ctx, { wakeToken: state(ctx).wakeToken });
    expect(row(ctx, "a").status).toBe(expected); expect(ctx.runAction).not.toHaveBeenCalled();
  });
  it("retains ambiguous network failures without posting them again", async () => {
    const ctx = fixture(); await add(ctx, "a", "A"); vi.mocked(fetch).mockRejectedValue(new Error("timeout after submission"));
    await invoke(replies.drainReplyQueue, ctx, { wakeToken: state(ctx).wakeToken });
    expect(row(ctx, "a").status).toBe("uncertain"); vi.setSystemTime(Date.now() + 86400_000); await invoke(queue.kick, ctx);
    expect(fetch).toHaveBeenCalledTimes(1); expect(row(ctx, "a")).toHaveProperty("text");
  });
  it("does not post after X is disabled", async () => {
    const ctx = fixture(); await add(ctx, "a", "A"); vi.stubEnv("X_REPLIES_ENABLED", "false");
    await invoke(replies.drainReplyQueue, ctx, { wakeToken: state(ctx).wakeToken });
    expect(row(ctx, "a").status).toBe("queued"); expect(fetch).not.toHaveBeenCalled();
  });
  it("has only one raw POST path and no wallet/AI dependency in the queue", () => {
    const src = readFileSync("convex/xReplies.ts", "utf8"), queueSource = readFileSync("convex/xReplyQueue.ts", "utf8");
    expect(src.match(/method: "POST"/g)).toHaveLength(1);
    expect(queueSource).not.toMatch(/internal\.(?:wallets|llm|liquidity)\./);
  });
});

describe("command-only X rollout", () => {
  const clarification = JSON.stringify({ type: "ambiguous_token", reason: "duplicate_ticker", intent: { kind: "command", command: { kind: "buy", amount: "10", unit: "usd", token: "DUP" } }, field: "token", explicitMentionAuthorized: true });
  it("blocks new guided prompts and already queued prompts", async () => {
    const ctx = fixture();
    await source(ctx, "new", "guided_help:buy");
    expect(await invoke(queue.enqueue, ctx, { key: "new", postId: "new", kind: "guided_reply", text: "Enter an amount." })).toMatchObject({ status: "cancelled" });
    await add(ctx, "old", "B");
    await ctx.db.patch(row(ctx, "old")._id, { kind: "guided_reply" });
    expect(await take(ctx)).toBeNull();
    expect(row(ctx, "old").status).toBe("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps contract replies owner-bound, expiring and single-use", async () => {
    const ctx = fixture();
    const id = await source(ctx, "parent", "ambiguous_token", { responsePostId: "prompt", guidedHelpStateJson: clarification });
    expect(await invoke(replies.ambiguousTokenReplyContext, ctx, { ownerXUserId: "other", parentPostId: "prompt" })).toBeNull();
    expect(await invoke(replies.ambiguousTokenReplyContext, ctx, { ownerXUserId: "parent", parentPostId: "prompt" })).toMatchObject({ field: "token" });
    expect(await invoke(replies.claimAmbiguousTokenReply, ctx, { ownerXUserId: "parent", parentPostId: "prompt", consumerPostId: "first" })).toBe(true);
    expect(await invoke(replies.claimAmbiguousTokenReply, ctx, { ownerXUserId: "parent", parentPostId: "prompt", consumerPostId: "first" })).toBe(true);
    expect(await invoke(replies.claimAmbiguousTokenReply, ctx, { ownerXUserId: "parent", parentPostId: "prompt", consumerPostId: "sibling" })).toBe(false);
    await ctx.db.patch(id, { updatedAt: Date.now() - 600001 });
    expect(await invoke(replies.ambiguousTokenReplyContext, ctx, { ownerXUserId: "parent", parentPostId: "prompt", consumerPostId: "first" })).toBeNull();
  });
  it("rejects old non-indexed token follow-up state", async () => {
    const ctx = fixture();
    await source(ctx, "parent", "ambiguous_token", { responsePostId: "prompt", guidedHelpStateJson: clarification.replace(',"reason":"duplicate_ticker"', '') });
    expect(await invoke(replies.ambiguousTokenReplyContext, ctx, { ownerXUserId: "parent", parentPostId: "prompt" })).toBeNull();
  });
  it("allows a new unknown-ticker prompt but refuses untagged authority and other consumers",async()=>{
    const ctx=fixture();
    const state=clarification.replace('duplicate_ticker','unknown_ticker');
    const id=await source(ctx,"parent","ambiguous_token",{responsePostId:"prompt",guidedHelpStateJson:state});
    expect(await invoke(replies.ambiguousTokenReplyContext,ctx,{ownerXUserId:"parent",parentPostId:"prompt"})).toMatchObject({reason:"unknown_ticker",field:"token",intent:{command:{amount:"10",token:"DUP"}}});
    expect(await invoke(replies.claimAmbiguousTokenReply,ctx,{ownerXUserId:"other",parentPostId:"prompt",consumerPostId:"new"})).toBe(false);
    await ctx.db.patch(id,{guidedHelpStateJson:state.replace('"explicitMentionAuthorized":true','"explicitMentionAuthorized":false')});
    expect(await invoke(replies.claimAmbiguousTokenReply,ctx,{ownerXUserId:"parent",parentPostId:"prompt",consumerPostId:"new"})).toBe(false);
  });
  it("publishes duplicate contract prompts with the explicit tag requirement", async () => {
    const ctx = fixture(); await source(ctx, "dup", "ambiguous_token", { guidedHelpStateJson: clarification });
    expect(await invoke(queue.enqueue, ctx, { key: "dup", postId: "dup", kind: "reply", ok: false, text: "Action needed: More than one indexed token uses that ticker. Enter the contract address." })).toMatchObject({ status: "queued" });
    expect((await take(ctx)).row.text).toContain("tag @TheArgosBot");
  });
});
