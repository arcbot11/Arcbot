import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { claim, cleanup, limit, recover, updateRequest } from "../convex/bridgeApi";
import { PRE_SETTLEMENT_LEASE_MS } from "../lib/bridge-api/model";

// Exercise the actual Convex handlers against an isolated in-memory database.
function database() {
  const rows = new Map<string, any>();
  const db = {
    query: (table: string) => ({ withIndex: (_index: string, filter: any) => {
      let match: (row: any) => boolean;
      filter({ eq: (f: string, v: unknown) => { match = r => r[f] === v; }, lt: (f: string, v: number) => { match = r => r[f] < v; } });
      const selected = () => [...rows.values()].filter(r => r.table === table && match(r));
      return { unique: async () => selected()[0] || null, take: async (n: number) => selected().slice(0,n) };
    } }),
    insert: async (table: string, row: any) => { const id = String(rows.size); rows.set(id, { ...row, table, _id: id }); return id; },
    patch: async (id: string, patch: any) => { Object.assign(rows.get(id), patch); },
    delete: async (id: string) => { rows.delete(id); },
  };
  return { db, rows };
}
const run = (fn: unknown, ctx: unknown, args: object) => (fn as { _handler: (ctx: unknown, args: object) => Promise<any> })._handler(ctx, { secret: "test-secret", ...args });
const identity = { paymentKey: "payment", inputKey: "input", recoveryHash: "proof", requestId: "request" };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.stubEnv("BRIDGE_API_SERVICE_SECRET", "test-secret"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it.each(["processing", "prepared"])("expires abandoned %s and fences its old worker", async state => {
  const ctx = database();
  await run(claim, ctx, identity);
  if (state === "prepared") await run(updateRequest, ctx, { requestId: "request", state, resultJson: "{}" });
  expect((await run(recover, ctx, identity)).state).toBe(state);
  vi.advanceTimersByTime(PRE_SETTLEMENT_LEASE_MS);
  // Deadline alone fences a worker, even before any recovery request arrives.
  await expect(run(updateRequest, ctx, { requestId: "request", state: state === "processing" ? "prepared" : "settling" })).rejects.toThrow("lease expired");
  expect(await run(recover, ctx, { ...identity, recoveryHash: "wrong" })).toBeNull();
  expect((await run(recover, ctx, identity)).state).toBe("not_charged");
  await expect(run(updateRequest, ctx, { requestId: "request", state: "settling" })).rejects.toThrow("Invalid payment transition");
  expect((await run(claim, ctx, identity)).kind).toBe("existing");
});

it("drains backlogs through bounded continuations and preserves unresolved evidence", async () => {
  const ctx = database();
  for (const table of ["bridgeLookupCache", "bridgeApiLimits", "bridgeApiRequests"]) {
    for (let i=0;i<451;i++) await ctx.db.insert(table,{expiresAt:0,purgeAt:0,state:i%2 ? "uncertain" : "settled",resultJson:"evidence"});
    await ctx.db.insert(table,{expiresAt:Date.now()+60_000,purgeAt:Date.now()+60_000,state:"settled",resultJson:"live"});
  }
  const scheduler={runAfter:vi.fn(async()=>{})};
  let runs=0;
  do {
    scheduler.runAfter.mockClear();
    await run(cleanup,{...ctx,scheduler},{});
    expect(scheduler.runAfter.mock.calls.length).toBeLessThanOrEqual(1);
    if (++runs>100) throw Error("Cleanup did not terminate");
  } while(scheduler.runAfter.mock.calls.length);
  expect(runs).toBeGreaterThan(1);
  expect([...ctx.rows.values()].filter(r=>r.table!=="bridgeApiRequests")).toHaveLength(2);
  const payments=[...ctx.rows.values()].filter(r=>r.table==="bridgeApiRequests");
  expect(payments).toHaveLength(452);
  expect(payments.filter(r=>r.state==="expired").every(r=>r.resultJson===undefined)).toBe(true);
  expect(payments.filter(r=>r.state==="uncertain").every(r=>r.resultJson==="evidence")).toBe(true);
  expect(payments.find(r=>r.resultJson==="live")?.state).toBe("settled");
});

it.each(["settling", "uncertain"])("never expires %s as uncharged", async state => {
  const ctx = database(); await run(claim, ctx, identity);
  await run(updateRequest, ctx, { requestId: "request", state: "prepared", resultJson: "{}" });
  await run(updateRequest, ctx, { requestId: "request", state: "settling" });
  if (state === "uncertain") await run(updateRequest, ctx, { requestId: "request", state });
  vi.advanceTimersByTime(PRE_SETTLEMENT_LEASE_MS);
  expect((await run(recover, ctx, identity)).state).toBe(state);
  await run(updateRequest, ctx, { requestId: "request", state: "settled", receiptJson: "{}" });
  expect((await run(recover, ctx, identity)).state).toBe("settled");
});

it("rejected client traffic does not consume global capacity", async () => {
  const ctx = database(); let admitted = 0;
  for (let i = 0; i < 600; i++) if (await run(limit, ctx, { key: "client-a" })) admitted++;
  expect(admitted).toBe(30);
  expect(await run(limit, ctx, { key: "client-b" })).toBe(true);
  expect([...ctx.rows.values()].find(r => r.key === "global").count).toBe(31);
});

it("preserves the global cap and resets expired windows", async () => {
  const ctx = database();
  for (let i = 0; i < 600; i++) expect(await run(limit, ctx, { key: `client-${i}` })).toBe(true);
  expect(await run(limit, ctx, { key: "new-client" })).toBe(false);
  expect([...ctx.rows.values()].some(r => r.key === "new-client")).toBe(false);
  vi.advanceTimersByTime(60_000);
  expect(await run(limit, ctx, { key: "new-client" })).toBe(true);
});
