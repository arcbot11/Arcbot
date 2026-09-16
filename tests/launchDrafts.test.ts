import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as drafts from "../convex/launchDrafts";

type Row = Record<string, unknown>;
const address = "0x1111111111111111111111111111111111111111", other = "0x2222222222222222222222222222222222222222";
const secret = "test-server-secret-".repeat(3), requestId = "00000000-0000-4000-8000-000000000001";
const input = { name: "Example", symbol: "EXAMPLE", imageURI: "ipfs://Qm" + "a".repeat(44),
  buyTaxBps: 100, sellTaxBps: 100, creatorBps: 10000, burnBps: 0, dividendBps: 0, liquidityBps: 0 };
function fixture() {
  const tables: Record<string, Row[]> = { launchRuns: [], launchDrafts: [], xReplyUsers: [{ xUserId: "1", walletId: "x1" }],
    cryptoWallets: [{ _id: "x1", ownerXUserId: "1", address, signerWalletRef: address, chainId: 5042, status: "active" }],
    telegramNativeWallets: [{ _id: "t1", telegramUserId: "1", telegramChatId: "1", address: other, signerWalletRef: other }] };
  const all = () => Object.values(tables).flat();
  const ctx = { db: {
    query: (table: string) => {
      let rows = tables[table];
      const q = { withIndex: (_index: string, callback: (b: unknown) => unknown) => {
        const builder = { eq: (k: string, value: unknown) => { rows = rows.filter(r => r[k] === value); return builder; } };
        callback(builder); return q;
      }, order: () => q, take: async (n: number) => rows.slice(0, n), unique: async () => {
        if (rows.length > 1) throw Error("Duplicate"); return rows[0] ?? null;
      } }; return q;
    },
    insert: async (table: string, row: Row) => { const id = `row-${all().length}`; tables[table].push({ ...row, _id: id }); return id; },
    get: async (id: string) => all().find(r => r._id === id) ?? null,
    patch: async (id: string, patch: Row) => Object.assign(all().find(r => r._id === id)!, patch),
  } };
  const base = { secret, owner: "1", address, requestId };
  const call = async (fn: unknown, extra: Row = {}) => (fn as { _handler: (c: unknown, a: unknown) => Promise<Row> })._handler(ctx, { ...base, ...extra });
  const create = (extra: Row = {}) => call(drafts.create, { inputJson: JSON.stringify(input), ...extra });
  return { tables, call, create };
}
beforeEach(() => { vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED", "true"); vi.stubEnv("WEB_AUTH_SECRET", secret); });
it("completed launches do not consume the active draft quota",async()=>{
  const f=fixture();
  for(let i=0;i<10;i++)f.tables.launchDrafts.push({_id:`old-${i}`,owner:"1",requestId:`old-${i}`,status:"completed",createdAt:Date.now()-120000,expiresAt:Date.now()+60000});
  await expect(f.create()).resolves.toMatchObject({status:"draft"});
});
afterEach(() => vi.unstubAllEnvs());
it("keeps paused draft reads authenticated while denying new preparation",async()=>{
  const f=fixture();await f.create();vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED","false");
  await expect(f.call(drafts.read)).resolves.toMatchObject({requestId,address});
  await expect(f.call(drafts.read,{owner:"2"})).rejects.toThrow("ownership");
  await expect(f.call(drafts.beginPreparation)).rejects.toThrow("disabled");
});
it("retains one salt and one draft when the request is retried", async () => {
  const f = fixture(), a = await f.create(), b = await f.create();
  expect(a).toEqual(b); expect(f.tables.launchDrafts).toHaveLength(1);
  await expect(f.create({ inputJson: JSON.stringify({ ...input, symbol: "CHANGED" }) })).rejects.toThrow("different launch settings");
});
it.each(["flag", "secret", "owner", "wallet", "frozen", "duplicate"])("rejects %s before writing", async reason => {
  const f = fixture(), args: Row = {};
  if (reason === "flag") vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED", "false");
  if (reason === "secret") args.secret = "wrong";
  if (reason === "owner") args.owner = "2";
  if (reason === "wallet") args.address = other;
  if (reason === "frozen") f.tables.cryptoWallets[0].status = "frozen";
  if (reason === "duplicate") f.tables.cryptoWallets.push({ ...f.tables.cryptoWallets[0] });
  await expect(f.create(args)).rejects.toThrow(); expect(f.tables.launchDrafts).toHaveLength(0);
});
it("separates the same numeric Telegram and X identities", async () => {
  const f = fixture(); await f.create(); await f.create({ owner: "tg:1", address: other });
  expect(f.tables.launchDrafts).toHaveLength(2);
  expect(f.tables.launchDrafts.map(r => r.address)).toEqual([address, other]);
});
it("cancellation is idempotent and invalidates in-flight previews", async () => {
  const f = fixture(); const draft = await f.create();
  const cancelled = await f.call(drafts.cancel); expect(cancelled.status).toBe("cancelled");
  expect(await f.call(drafts.cancel)).toEqual(cancelled);
  await expect(f.call(drafts.savePreview, { revision: draft.revision, previewJson: "{}" })).rejects.toThrow("changed or expired");
  expect((await f.create()).status).toBe("cancelled");
});
it("uses compare-and-swap so a stale preview cannot overwrite a newer one", async () => {
  const f = fixture(), draft = await f.create(), now = Date.now();
  const { prepareToken } = await f.call(drafts.beginPreparation);
  const p = { fingerprint: draft.fingerprint, creator: address, tokenSalt: draft.tokenSalt, executionEnabled: false,
    createdAt: now, expiresAt: now + 30_000, status: "simulated" };
  const next = await f.call(drafts.savePreview, { revision: 1, prepareToken, previewJson: JSON.stringify(p) });
  expect(next.revision).toBe(2);
  await expect(f.call(drafts.savePreview, { revision: 1, prepareToken, previewJson: JSON.stringify(p) })).rejects.toThrow("changed or expired");
});
it("rejects a preview for another creator or an expired preview", async () => {
  const f = fixture(), draft = await f.create(), now = Date.now();
  const { prepareToken } = await f.call(drafts.beginPreparation);
  const p = { fingerprint: draft.fingerprint, creator: other, tokenSalt: draft.tokenSalt, executionEnabled: false,
    createdAt: now, expiresAt: now + 30_000, status: "simulated" };
  await expect(f.call(drafts.savePreview, { revision: 1, prepareToken, previewJson: JSON.stringify(p) })).rejects.toThrow("does not match");
  await expect(f.call(drafts.savePreview, { revision: 1, prepareToken, previewJson: JSON.stringify({ ...p, creator: address, expiresAt: now - 1 }) })).rejects.toThrow("does not match");
});
it("allows only one concurrent preparation and rejects an unowned lease", async () => {
  const f = fixture(); await f.create(); const lease = await f.call(drafts.beginPreparation);
  await expect(f.call(drafts.beginPreparation)).rejects.toThrow("already running");
  await f.call(drafts.endPreparation, { prepareToken: "wrong" });
  expect(f.tables.launchDrafts[0].prepareToken).toBe(lease.prepareToken);
  await f.call(drafts.endPreparation, { prepareToken: lease.prepareToken });
  expect(f.tables.launchDrafts[0].prepareToken).toBeUndefined();
});
it("edits preserve the token salt and invalidate a prepared preview", async () => {
  const f = fixture(), first = await f.create();
  f.tables.launchDrafts[0].previewJson = JSON.stringify({ old: true });
  f.tables.launchDrafts[0].status = "prepared";
  const next = await f.call(drafts.update, { revision: 1, inputJson: JSON.stringify({ ...input, symbol: "NEW" }) });
  expect(next).toMatchObject({ tokenSalt: first.tokenSalt, revision: 2, status: "draft", preview: null });
  expect(next.fingerprint).not.toBe(first.fingerprint);
  expect(next.expiresAt).toBe(first.expiresAt);
});
it("retries a lost edit response without another revision or another draft", async () => {
  const f = fixture(); await f.create();
  const args = { revision: 1, inputJson: JSON.stringify({ ...input, description: "Updated" }) };
  const edited = await f.call(drafts.update, args);
  expect(await f.call(drafts.update, args)).toEqual(edited);
  expect(f.tables.launchDrafts).toHaveLength(1);
  await expect(f.call(drafts.update, { ...args, inputJson: JSON.stringify({ ...input, description: "Other tab" }) })).rejects.toThrow("changed");
});
it("an edit invalidates an in-flight simulation while retaining its computation throttle", async () => {
  const f = fixture(), initial = await f.create(), lease = await f.call(drafts.beginPreparation);
  await f.call(drafts.update, { revision: 1, inputJson: JSON.stringify({ ...input, description: "Changed during simulation" }) });
  expect(f.tables.launchDrafts[0].prepareToken).toBe(lease.prepareToken);
  await expect(f.call(drafts.beginPreparation)).rejects.toThrow("already running");
  await expect(f.call(drafts.savePreview, { revision: 1, prepareToken: lease.prepareToken, previewJson: JSON.stringify({
    fingerprint: initial.fingerprint, creator: address, tokenSalt: initial.tokenSalt, executionEnabled: false,
    createdAt: Date.now(), expiresAt: Date.now() + 30000, status: "simulated",
  }) })).rejects.toThrow("changed or expired");
  await f.call(drafts.endPreparation, { prepareToken: lease.prepareToken });
  expect(f.tables.launchDrafts[0].prepareToken).toBeUndefined();
});
it.each(["owner", "wallet", "cancelled", "expired", "revision", "minimum", "tax"])("rejects unsafe edit: %s", async reason => {
  const f = fixture(); await f.create();
  const args: Row = { revision: 1, inputJson: JSON.stringify({ ...input, description: "Updated" }) };
  if (reason === "owner") args.owner = "2";
  if (reason === "wallet") args.address = other;
  if (reason === "cancelled") await f.call(drafts.cancel);
  if (reason === "expired") f.tables.launchDrafts[0].expiresAt = Date.now() - 1;
  if (reason === "revision") args.revision = 0.5;
  if (reason === "minimum") args.inputJson = JSON.stringify({ ...input, dividendMinimumTokens: "1000" });
  if (reason === "tax") args.inputJson = JSON.stringify({ ...input, buyTaxBps: 200 });
  const before = JSON.stringify(f.tables.launchDrafts);
  await expect(f.call(drafts.update, args)).rejects.toThrow();
  expect(JSON.stringify(f.tables.launchDrafts)).toBe(before);
});

it("repairs old terminal runs so stopped drafts no longer consume quota",async()=>{
 const f=fixture();for(let i=0;i<10;i++){
 f.tables.launchDrafts.push({_id:"d"+i,requestId:"old"+i,owner:"1",address,status:"executing",createdAt:Date.now()-120000,expiresAt:Date.now()+60000});
 f.tables.launchRuns.push({requestId:"old"+i,owner:"1",address,status:"blocked"});
 }
 await expect(f.create()).resolves.toMatchObject({status:"draft"});
 expect(f.tables.launchDrafts.slice(0,10).every(d=>d.status==="cancelled")).toBe(true);
});
