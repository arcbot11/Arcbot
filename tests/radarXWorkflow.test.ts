import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { retryInteraction } from "../convex/xReplies";
import { admitRadarScan } from "../convex/xFloodProtection";
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("routes a real X handler through lookup and publication with zero wallet actions", async () => {
  vi.stubEnv("X_REPLIES_ENABLED", "true"); vi.stubEnv("X_STANDALONE_MENTIONS_ENABLED", "false"); vi.stubEnv("ARCDDICTED_API_KEY", "test-only");
  const address = "0xc162b1e2fa18d3b5d6064d01d55cedb1638da826";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, token: { address, symbol: "CMC" } }), { headers: { "content-type": "application/json" } })));
  const ctx = {
    runAction: vi.fn(() => { throw new Error("Wallet/AI action forbidden"); }),
    runQuery: vi.fn(async (ref: never) => {
      const name = getFunctionName(ref);
      if (name === "xReplies:getRetryContext") return { user: { xUserId: "test-human", username: "testhuman" }, interaction: { text: "@TheArgosBot what do you think about $CMC?", status: "received", authorXUserId: "test-human", createdAt: Date.now() } };
      if (name === "wallets:resolveKnownToken") return address;
      throw Error(`Unexpected query ${name}`);
    }),
    runMutation: vi.fn(async (ref: never) => {
      const name = getFunctionName(ref);
      if (name === "xFloodProtection:guardQueued") return { suppressed: false };
      if (name === "xFloodProtection:admitRadarScan") return true;
      if (name === "xReplies:updateInteraction") return;
      if (name === "xReplyQueue:enqueue") return { status: "published", responsePostId: "mock-reply" };
      throw Error(`Unexpected mutation ${name}`);
    }),
  };
  await (retryInteraction as any)._handler(ctx, { postId: "mock-post" });
  expect(ctx.runAction).not.toHaveBeenCalled();
  const queued = ctx.runMutation.mock.calls.find(([ref]) => getFunctionName(ref) === "xReplyQueue:enqueue") as any;
  expect(queued?.[1]).toMatchObject({ allowLong: true, text: expect.stringContaining("Powered by ARCddicted Radar") });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("bounds provider calls per user and globally, and reuses retry admission", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T16:00:00Z"));
  const rows: any[] = [];
  const ctx = { db: {
    query: () => { let key: string; const q = { withIndex: (_: string, f: any) => { f({ eq: (_: string, v: string) => { key = v; } }); return q; }, unique: async () => rows.find(r => r.key === key) }; return q; },
    insert: async (_: string, row: any) => { rows.push({ ...row, _id: rows.length }); },
    patch: async (id: number, changes: any) => { Object.assign(rows[id], changes); },
  } };
  const invoke = (postId: string, authorXUserId: string) => (admitRadarScan as any)._handler(ctx, { postId, authorXUserId });
  expect(await invoke("0", "one")).toBe(true);
  expect(await invoke("0", "one")).toBe(true);
  expect(await invoke("second", "one")).toBe(false);
  vi.advanceTimersByTime(59_999);
  expect(await invoke("second", "one")).toBe(false);
  vi.advanceTimersByTime(1);
  expect(await invoke("second", "one")).toBe(true);
  for (let n = 2; n < 100; n++) expect(await invoke(String(n), `user${n}`)).toBe(true);
  expect(await invoke("101", "new-user")).toBe(false);
  vi.advanceTimersByTime(3_539_999);
  expect(await invoke("101", "new-user")).toBe(false);
  vi.advanceTimersByTime(1);
  expect(await invoke("101", "new-user")).toBe(true);
  expect(await invoke("102", "another-user")).toBe(false);
});
