import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { create, get, save } from "../convex/agentBridge";

// Invoke the real handlers; Convex supplies serialization/atomicity in deployment.
function fixture() {
  const rows = new Map<string, any>();
  let sequence = 0;
  const db = {
    query: (table: string) => ({
      withIndex: (_: string, filter: any) => {
        let field: string, value: unknown;
        filter({
          eq: (f: string, v: unknown) => {
            field = f;
            value = v;
          },
        });
        return {
          unique: async () =>
            [...rows.values()].find(
              (r) => r.table === table && r[field] === value,
            ) || null,
        };
      },
    }),
    insert: async (table: string, row: any) => {
      const id = String(sequence++);
      rows.set(id, { ...row, table, _id: id });
      return id;
    },
    patch: async (id: string, patch: any) => {
      Object.assign(rows.get(id), patch);
    },
    delete: async (id: string) => {
      rows.delete(id);
    },
  };
  return { db, rows };
}
const run = (fn: unknown, ctx: unknown, args: object) =>
  (fn as { _handler: (ctx: unknown, args: object) => Promise<any> })._handler(
    ctx,
    { secret: "test-secret", ...args },
  );
const job = (letter = "a", paymentId = "payment") => ({
  id: `ab_${letter.repeat(48)}`,
  paymentId,
  intent: { chain: 5042, account: "0x1234", clientRequestId: letter },
  revision: 0,
  state: "ready",
  steps: [] as any[],
  updatedAt: Date.now(),
});
beforeEach(() => vi.stubEnv("BRIDGE_AGENT_SERVICE_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

it("requires settled payment and retains access after paid response expiry", async () => {
  const ctx = fixture(),
    j = job();
  await run(create, ctx, { json: JSON.stringify(j) });
  const id = await ctx.db.insert("bridgeApiRequests", {
    requestId: j.paymentId,
    state: "uncertain",
  });
  await expect(run(get, ctx, { id: j.id })).rejects.toThrow("not settled");
  await ctx.db.patch(id, {
    state: "settled",
    receiptJson: JSON.stringify({ success: true }),
  });
  expect((await run(get, ctx, { id: j.id })).id).toBe(j.id);
  await ctx.db.patch(id, { state: "expired" });
  expect((await run(get, ctx, { id: j.id })).id).toBe(j.id);
  await expect(run(get, ctx, { id: j.id, secret: "wrong" })).rejects.toThrow(
    "Unauthorized",
  );
});

it("prevents two jobs reserving a wallet and fences stale writes", async () => {
  const ctx = fixture(),
    a = job(),
    b = job("b");
  for (const j of [a, b]) await run(create, ctx, { json: JSON.stringify(j) });
  a.revision++;
  a.steps = [{ id: "first", state: "armed" }];
  await run(save, ctx, {
    json: JSON.stringify(a),
    expected: 0,
    reservation: "acquire",
  });
  await expect(
    run(save, ctx, {
      json: JSON.stringify(a),
      expected: 0,
      reservation: "keep",
    }),
  ).rejects.toThrow("changed");
  b.revision++;
  b.steps = [{ id: "second", state: "armed" }];
  await expect(
    run(save, ctx, {
      json: JSON.stringify(b),
      expected: 0,
      reservation: "acquire",
    }),
  ).rejects.toThrow("reconciliation");
  a.revision++;
  await expect(
    run(save, ctx, {
      json: JSON.stringify(a),
      expected: 1,
      reservation: "release",
    }),
  ).rejects.toThrow("Finalized");
  a.steps[0].observation = { binding: { finalized: true } };
  await run(save, ctx, {
    json: JSON.stringify(a),
    expected: 1,
    reservation: "release",
  });
  await run(save, ctx, {
    json: JSON.stringify(b),
    expected: 0,
    reservation: "acquire",
  });
});

it("never rebinds uncertain/settled jobs to a second payment", async () => {
  const ctx = fixture(),
    j = job();
  await run(create, ctx, { json: JSON.stringify(j) });
  const payment = await ctx.db.insert("bridgeApiRequests", {
    requestId: j.paymentId,
    state: "uncertain",
  });
  const retry = { ...j, paymentId: "second-payment" };
  await expect(
    run(create, ctx, { json: JSON.stringify(retry) }),
  ).rejects.toThrow("recover the original");
  await ctx.db.patch(payment, { state: "not_charged" });
  expect(
    (await run(create, ctx, { json: JSON.stringify(retry) })).paymentId,
  ).toBe("second-payment");
  await expect(
    run(create, ctx, {
      json: JSON.stringify({
        ...retry,
        intent: { ...j.intent, amount: "999" },
      }),
    }),
  ).rejects.toThrow("another intent");
});
