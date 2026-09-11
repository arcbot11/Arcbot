import { describe, expect, it } from "vitest";
import { consumeLinkNonce } from "../convex/telegram";

const handler = (consumeLinkNonce as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;

function fixture(links: Array<Record<string, unknown>>) {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    telegramLinkNonces: [{ _id: "nonce", nonceHash: "hash", telegramUserId: "tg-new", telegramChatId: "chat", expiresAt: Date.now() + 60_000, createdAt: Date.now() }],
    telegramAccountLinks: links,
  };
  const inserted: Array<Record<string, unknown>> = [];
  const ctx = {
    db: {
      query(table: string) {
        let selected = rows[table] || [];
        return {
          withIndex(_name: string, callback: (q: { eq: (key: string, value: unknown) => unknown }) => unknown) {
            const filters: Array<[string, unknown]> = [];
            callback({ eq(key, value) { filters.push([key, value]); return this; } });
            selected = selected.filter(row => filters.every(([key, value]) => row[key] === value));
            return { collect: async () => selected, unique: async () => selected[0] || null };
          },
        };
      },
      async patch(id: string, patch: Record<string, unknown>) {
        for (const table of Object.values(rows)) Object.assign(table.find(row => row._id === id) || {}, patch);
      },
      async insert(table: string, value: Record<string, unknown>) {
        inserted.push(value); (rows[table] ||= []).push({ _id: `new-${inserted.length}`, ...value });
      },
    },
  };
  return { ctx, rows, inserted };
}

describe("Telegram account linking", () => {
  it("consumes a confirmation once even when it is submitted again", async () => {
    const f = fixture([]);
    expect(await handler(f.ctx, { nonceHash: "hash", ownerXUserId: "x-new" })).toMatchObject({ status: "linked" });
    expect(await handler(f.ctx, { nonceHash: "hash", ownerXUserId: "x-new" })).toMatchObject({ status: "expired" });
    expect(f.inserted).toHaveLength(1);
  });
  it("allows both identities to be reused once their previous links are revoked", async () => {
    const f = fixture([
      { _id: "old-tg", telegramUserId: "tg-new", ownerXUserId: "x-old", revokedAt: 1, updatedAt: 1 },
      { _id: "old-x", telegramUserId: "tg-old", ownerXUserId: "x-new", revokedAt: 1, updatedAt: 1 },
    ]);
    await expect(handler(f.ctx, { nonceHash: "hash", ownerXUserId: "x-new" })).resolves.toMatchObject({ status: "linked" });
    expect(f.inserted).toContainEqual(expect.objectContaining({ telegramUserId: "tg-new", ownerXUserId: "x-new" }));
  });

  it("rejects an X wallet that is still attached to another Telegram account", async () => {
    const f = fixture([{ _id: "active", telegramUserId: "tg-old", ownerXUserId: "x-new", updatedAt: 1 }]);
    await expect(handler(f.ctx, { nonceHash: "hash", ownerXUserId: "x-new" })).resolves.toMatchObject({ status: "wallet_already_linked" });
    expect(f.inserted).toHaveLength(0);
  });

  it("rejects a Telegram account that is still attached to another X wallet", async () => {
    const f = fixture([{ _id: "active", telegramUserId: "tg-new", ownerXUserId: "x-old", updatedAt: 1 }]);
    await expect(handler(f.ctx, { nonceHash: "hash", ownerXUserId: "x-new" })).resolves.toMatchObject({ status: "telegram_already_linked" });
    expect(f.inserted).toHaveLength(0);
  });
});

describe("Telegram OAuth return",()=>{
 it("acknowledges a repeated successful return without creating or renewing a link",async()=>{
  const f=fixture([]);Object.assign(f.rows.telegramLinkNonces[0],{returnHash:"return",pendingOwnerXUserId:"x-new"});
  const args={returnHash:"return",telegramUserId:"tg-new",telegramChatId:"chat"};
  expect(await handler(f.ctx,args)).toMatchObject({status:"linked"});
  const authenticated=f.rows.telegramAccountLinks[0].lastAuthenticatedAt;
  expect(await handler(f.ctx,args)).toMatchObject({status:"linked"});expect(f.inserted).toHaveLength(1);
  expect(f.rows.telegramAccountLinks[0].lastAuthenticatedAt).toBe(authenticated);
  f.rows.telegramAccountLinks[0].revokedAt=Date.now();
  expect(await handler(f.ctx,args)).toMatchObject({status:"expired"});expect(f.inserted).toHaveLength(1);
 });
 it.each(["tg-new","other"])("requires the originating Telegram user: %s",async user=>{
  const f=fixture([]);Object.assign(f.rows.telegramLinkNonces[0],{returnHash:"return",pendingOwnerXUserId:"x-new"});
  const result=await handler(f.ctx,{returnHash:"return",telegramUserId:user,telegramChatId:"chat",ownerXUserId:"forged-owner"});
  expect(result).toMatchObject({status:user==="tg-new"?"linked":"expired"});
  if(user==="tg-new")expect(f.inserted[0].ownerXUserId).toBe("x-new");else expect(f.inserted).toHaveLength(0);
 });
 it("rejects a return from a different chat or an unverified X link",async()=>{
  const f=fixture([]);Object.assign(f.rows.telegramLinkNonces[0],{returnHash:"return",pendingOwnerXUserId:"x-new"});
  expect(await handler(f.ctx,{returnHash:"return",telegramUserId:"tg-new",telegramChatId:"other"})).toMatchObject({status:"expired"});
  delete f.rows.telegramLinkNonces[0].pendingOwnerXUserId;
  expect(await handler(f.ctx,{returnHash:"return",telegramUserId:"tg-new",telegramChatId:"chat"})).toMatchObject({status:"expired"});expect(f.inserted).toHaveLength(0);
 });
});
