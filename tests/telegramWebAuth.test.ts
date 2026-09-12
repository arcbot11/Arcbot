import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { start, respond, exchange, session } from "../convex/telegramWebAuth";
import { createTelegramWebSession, createWebWalletSession, readWebWalletSession, webSessionOwner } from "../lib/web-wallet-session";
const handler = (fn: unknown) => (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
const address = "0x1111111111111111111111111111111111111111", secret = "test-web-secret";
type Row = Record<string, unknown>;
function fixture() {
  const rows: Record<string, Row[]> = { webAuthBrowsers: [], webAuthLimits: [], webWalletSessions: [], telegramWebLogins: [], telegramNativeWallets: [{ _id: "tg1", telegramUserId: "123", telegramChatId: "123", address }], telegramUpdates: [{ _id: "u1", updateId: "one", telegramUserId: "123", telegramChatId: "123" }, { _id: "u2", updateId: "two", telegramUserId: "456", telegramChatId: "456" }] };
  const ctx = { db: {
    query(table: string) { let selected = rows[table]; const q = { eq: (key: string, val: unknown) => { selected = selected.filter(r => r[key] === val); return q; } }; return { withIndex: (_: string, cb: (query: typeof q) => unknown) => { cb(q); return { unique: async () => selected[0] ?? null }; } }; },
    get: async (id: unknown) => Object.values(rows).flat().find(r => r._id === id) ?? null,
    insert: async (table: string, value: Row) => { rows[table].push({ _id: `${table}${rows[table].length}`, ...value }); },
    patch: async (id: unknown, value: Row) => Object.assign(Object.values(rows).flat().find(r => r._id === id)!, value),
  } };
  return { rows, ctx };
}
const begin = { secret, tokenHash: "a".repeat(64), browserHash: "b".repeat(64), code: "ABCDEF12", browserFamily: "f".repeat(64), sourceHash: "1".repeat(64) };
const check = { secret, tokenHash: begin.tokenHash, browserHash: begin.browserHash, sessionIdHash: "c".repeat(64), browserFamily: begin.browserFamily };
const confirm = { updateId: "one", tokenHash: begin.tokenHash, approve: false };
beforeEach(() => { vi.stubEnv("WEB_AUTH_SECRET", secret); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("browser-bound Telegram web authorization", () => {
  it("requires a TG wallet, bot confirmation, and the original browser before issuing access", async () => {
    const f=fixture(); await handler(start)(f.ctx,begin);
    expect(await handler(exchange)(f.ctx,check)).toEqual({status:"pending"});
    expect(await handler(respond)(f.ctx,{...confirm,approve:true})).toEqual({status:"invalid"});
    expect(await handler(respond)(f.ctx,confirm)).toEqual({status:"confirm",code:begin.code});
    expect(await handler(exchange)(f.ctx,check)).toEqual({status:"pending"});
    await handler(respond)(f.ctx,{...confirm,approve:true});
    expect(await handler(exchange)(f.ctx,{...check,browserHash:"d".repeat(64)})).toEqual({status:"expired"});
    expect(await handler(exchange)(f.ctx,check)).toMatchObject({status:"approved",telegramUserId:"123",walletAddress:address});
    expect(await handler(exchange)(f.ctx,check)).toMatchObject({status:"approved"});
    expect(await handler(exchange)(f.ctx,{...check,sessionIdHash:"e".repeat(64)})).toEqual({status:"expired"});
    expect(f.rows).not.toHaveProperty("cryptoWallets");
    expect(f.rows).not.toHaveProperty("telegramWalletSelections");
  });
  it("does not substitute an X wallet, cross-bind another TG user, or accept a group", async () => {
    const f=fixture(); await handler(start)(f.ctx,begin);
    expect(await handler(respond)(f.ctx,{...confirm,updateId:"two"})).toEqual({status:"no_wallet"});
    await handler(respond)(f.ctx,confirm);
    f.rows.telegramNativeWallets.push({_id:"tg2",telegramUserId:"456",telegramChatId:"456",address});
    expect(await handler(respond)(f.ctx,{...confirm,updateId:"two",approve:true})).toEqual({status:"invalid"});
    f.rows.telegramUpdates[0].telegramChatId="-123";
    expect(await handler(respond)(f.ctx,{...confirm,approve:true})).toEqual({status:"invalid"});
  });
  it("expires challenges and rejects absent or incorrect service secrets", async () => {
    const f=fixture();
    await expect(handler(start)(f.ctx,{...begin,secret:"wrong"})).rejects.toThrow("Unauthorized");
    await handler(start)(f.ctx,begin); f.rows.telegramWebLogins[0].expiresAt=Date.now()-1;
    expect(await handler(respond)(f.ctx,confirm)).toEqual({status:"expired"});
    expect(await handler(exchange)(f.ctx,check)).toEqual({status:"expired"});
  });
  it("revokes only the matching session and never resurrects it through exchange", async () => {
    const f=fixture(); await handler(start)(f.ctx,begin); await handler(respond)(f.ctx,confirm); await handler(respond)(f.ctx,{...confirm,approve:true}); await handler(exchange)(f.ctx,check);
    const s={secret,sessionIdHash:check.sessionIdHash,telegramUserId:"123",revoke:false};
    expect(await handler(session)(f.ctx,{...s,telegramUserId:"456"})).toBe(false);
    expect(await handler(session)(f.ctx,s)).toBe(true);
    expect(await handler(session)(f.ctx,{...s,revoke:true})).toBe(true);
    expect(await handler(session)(f.ctx,s)).toBe(false);
    expect(await handler(exchange)(f.ctx,check)).toEqual({status:"expired"});
  });
  it("retains existing X session identity and separates identical numeric TG identities", () => {
    const x=readWebWalletSession(createWebWalletSession(address,"123","alice",secret),secret)!;
    const cookie=createTelegramWebSession(address,"123","web_abcdefghijklmnop",Math.floor(Date.now()/1000),secret);
    const tg=readWebWalletSession(cookie,secret)!;
    expect(webSessionOwner(x)).toBe("123"); expect(webSessionOwner(tg)).toBe("tg:123");
    expect(tg.xUserId).toBeUndefined();
    expect(readWebWalletSession(cookie,"wrong")).toBeNull();
    vi.useFakeTimers(); vi.advanceTimersByTime(7_201_000);
    expect(readWebWalletSession(cookie,secret)).toBeNull();
  });
});
