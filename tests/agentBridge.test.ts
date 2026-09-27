import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  authorization,
  authorizeJob,
  jobId,
  jobToken,
  verifyAuthorization,
} from "../lib/agent-bridge/auth";
import {
  BridgeEngine,
  publicJob,
  type EngineReads,
} from "../lib/agent-bridge/engine";
import { jobInput, type Job, type JobInput } from "../lib/agent-bridge/model";
import type { JobStore } from "../lib/agent-bridge/store";
import type { Prepared, Route } from "../lib/bridge/contracts";
import { openapi } from "../lib/agent-bridge/openapi";
const wallet = privateKeyToAccount(`0x${"11".repeat(32)}`);
const token = "0x2222222222222222222222222222222222222222",
  other = "0x3333333333333333333333333333333333333333";
const input = (): JobInput =>
  jobInput.parse({
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    chain: 5042,
    token,
    account: wallet.address,
    mode: "transfer",
    amount: "50",
    allowSetup: true,
    riskAcknowledged: true,
    maxForwardingFeeAtomic: "100",
    maxGasBudgetAtomic: "1000",
  });
const route = (
  state: Route["state"] = "ready",
  chain: 5042 | 8453 = 5042,
): Route => ({
  source: chain,
  destination: chain === 5042 ? 8453 : 5042,
  origin: 5042,
  original: token,
  token: chain === 5042 ? token : other,
  counterpart: chain === 5042 ? other : token,
  tokenId: `0x${"22".repeat(32)}`,
  manager: other,
  destinationManager: other,
  name: "Example",
  symbol: "EX",
  decimals: 18,
  state,
  compatible: true,
});
const prepared = (
  step: Prepared["step"] = "transfer",
  i = input(),
): Prepared => ({
  intent: {
    chain: i.chain,
    token: i.token,
    account: i.account,
    action: step === "register" || step === "deploy" ? step : "transfer",
    amount: i.amount,
    riskAcknowledged: true,
  },
  route: route("ready", i.chain),
  step,
  to: other,
  data: "0x1234",
  value: "10",
  circleFee: "10",
  gas: "10",
  gasBudget: "100",
  maxFeePerGas: "1",
  maxPriorityFeePerGas: "1",
  nonce: 4,
  expiresAt: Date.now() + 40000,
  seal: "a".repeat(64),
});
function fixture() {
  const rows = new Map<string, Job>();
  let held: string | undefined;
  const store: JobStore = {
    create: async (j) => {
      rows.set(j.id, structuredClone(j));
      return j;
    },
    get: async (id) => structuredClone(rows.get(id) || null),
    save: async (j, rev, res) => {
      if (rows.get(j.id)?.revision !== rev) throw Error("Job changed");
      if (res === "acquire") {
        if (held && held !== j.id) throw Error("Wallet busy");
        held = j.id;
      }
      if (res === "release") held = undefined;
      rows.set(j.id, structuredClone(j));
      return j;
    },
    due: async () => [],
    defer: async () => {},
  };
  const p = prepared();
  const reads: EngineReads = {
    account: vi.fn(async () => {}),
    route: vi.fn(async () => route()),
    prepare: vi.fn(async () => p),
    revalidate: vi.fn(async () => ({ valid: true })),
    transaction: vi.fn(async () => ({
      from: wallet.address,
      to: p.to,
      input: p.data,
      value: BigInt(p.value),
      nonce: p.nonce,
    })),
    status: vi.fn(async () => ({
      state: "complete" as const,
      message: "Finalized",
      binding: {
        from: wallet.address,
        to: p.to,
        data: p.data,
        value: p.value,
        nonce: p.nonce,
        finalized: true,
      },
    })),
  };
  return {
    store,
    rows,
    reads,
    engine: new BridgeEngine(store, reads),
    p,
    held: () => held,
  };
}
beforeEach(() =>
  vi.stubEnv("BRIDGE_AGENT_SERVICE_SECRET", "test-only-secret".repeat(4)),
);
afterEach(() => vi.unstubAllEnvs());
describe("wallet job authorization", () => {
  it("binds the signature to amount, chain, setup consent, account, caps and service", async () => {
    const intent = input(),
      expiresAt = Date.now() + 60000,
      signature = await wallet.signTypedData(authorization(intent, expiresAt));
    await expect(
      verifyAuthorization({ intent, expiresAt, signature }),
    ).resolves.toBeUndefined();
    for (const change of [
      { amount: "51" },
      { chain: 8453 },
      { allowSetup: false },
      { account: other },
      { maxGasBudgetAtomic: "99999" },
    ] as Partial<JobInput>[])
      await expect(
        verifyAuthorization({
          intent: { ...intent, ...change },
          expiresAt,
          signature,
        }),
      ).rejects.toThrow();
    await expect(
      verifyAuthorization({ intent, expiresAt: Date.now() - 1, signature }),
    ).rejects.toThrow("expired");
  });
  it("scopes capabilities to one job and rejects malformed or missing tokens", () => {
    const id = jobId(input()),
      token = jobToken(id);
    expect(() => authorizeJob(id, `Bearer ${token}`)).not.toThrow();
    for (const bad of [null, "Bearer bad", `Bearer ${"0".repeat(64)}`])
      expect(() => authorizeJob(id, bad)).toThrow();
    expect(() =>
      authorizeJob(`ab_${"f".repeat(48)}`, `Bearer ${token}`),
    ).toThrow();
  });
  it("requires explicit setup permission, positive transfer and supported chains", () => {
    for (const bad of [
      { mode: "setup", allowSetup: false, amount: "0" },
      { mode: "transfer", amount: "0" },
      { chain: 1 },
      { token: `0x${"0".repeat(40)}` },
      { riskAcknowledged: false },
    ])
      expect(jobInput.safeParse({ ...input(), ...bad }).success).toBe(false);
  });
});
describe("external wallet lifecycle", () => {
  it("does not create a payable job for an unsupported wallet", async () => {
    const f = fixture();
    vi.mocked(f.reads.account).mockRejectedValue(
      new Error("unsupported wallet"),
    );
    await expect(f.engine.create(input(), "payment")).rejects.toThrow(
      "unsupported wallet",
    );
    expect(f.rows.size).toBe(0);
    expect(f.reads.prepare).not.toHaveBeenCalled();
  });
  it("labels original and wrapped identities in both directions", async () => {
    for (const chain of [5042, 8453] as const) {
      const f = fixture();
      vi.mocked(f.reads.route).mockResolvedValue(route("ready", chain));
      const j = publicJob(
        await f.engine.create({ ...input(), chain }, "payment"),
      );
      expect(j.tokens?.source.chain).toBe(chain === 5042 ? "Arc" : "Base");
      expect(j.tokens?.source.role).toBe(
        chain === 5042 ? "original" : "wrapped",
      );
      expect(j.tokens?.original.chain).toBe("Arc");
      expect(j.tokens?.operation).toBe(
        chain === 5042 ? "lock_and_mint" : "burn_and_unlock",
      );
    }
  });
  it.each([5042, 8453] as const)(
    "bridges chain %s with exact transaction binding and no server signing",
    async (chain) => {
      const f = fixture(),
        i = { ...input(), chain },
        p = prepared("transfer", i);
      vi.mocked(f.reads.route).mockResolvedValue(route("ready", chain));
      vi.mocked(f.reads.prepare).mockResolvedValue(p);
      const j = await f.engine.create(i, "payment");
      const q = await f.engine.next(j.id);
      expect(publicJob(q).steps[0]).not.toHaveProperty("transaction");
      const armed = await f.engine.arm(j.id, q.steps[0].id);
      expect(publicJob(armed).steps[0].transaction?.chainId).toBe(chain);
      expect(f.held()).toBe(j.id);
      await expect(f.engine.next(j.id)).rejects.toThrow("reconcile");
      const done = await f.engine.submit(
        j.id,
        q.steps[0].id,
        `0x${"a".repeat(64)}`,
      );
      expect(done.state).toBe("complete");
      expect(f.held()).toBeUndefined();
      expect((await f.engine.next(j.id)).state).toBe("complete");
      expect(f.reads.prepare).toHaveBeenCalledTimes(1);
    },
  );
  it("walks registration, wrapper creation, approval and transfer in order", async () => {
    const f = fixture();
    vi.mocked(f.reads.route).mockResolvedValue(route("register"));
    const j = await f.engine.create(input(), "payment");
    for (const step of ["register", "deploy", "approve", "transfer"] as const) {
      vi.mocked(f.reads.route).mockResolvedValue(
        route(
          step === "register"
            ? "register"
            : step === "deploy"
              ? "deploy"
              : "ready",
        ),
      );
      vi.mocked(f.reads.prepare).mockResolvedValue(prepared(step));
      const q = await f.engine.next(j.id),
        s = q.steps.at(-1)!;
      expect(s.prepared.step).toBe(step);
      await f.engine.arm(j.id, s.id);
      const done = await f.engine.submit(
        j.id,
        s.id,
        `0x${String(q.steps.length).repeat(64)}`,
      );
      expect(done.state).toBe(step === "transfer" ? "complete" : "ready");
    }
    expect(f.rows.get(j.id)?.steps).toHaveLength(4);
  });
  it("setup-only finishes without issuing a transfer", async () => {
    const f = fixture(),
      j = await f.engine.create(
        { ...input(), mode: "setup", amount: "0" },
        "pay",
      );
    expect((await f.engine.next(j.id)).state).toBe("complete");
    expect(f.reads.prepare).not.toHaveBeenCalled();
  });
  it("blocks missing-bridge setup without explicit consent and incompatible tokens", async () => {
    const f = fixture();
    vi.mocked(f.reads.route).mockResolvedValue(route("register"));
    await expect(
      f.engine.create({ ...input(), allowSetup: false }, "pay"),
    ).rejects.toThrow("allowSetup");
    vi.mocked(f.reads.route).mockResolvedValue({
      ...route(),
      compatible: false,
      reason: "Blocked token",
    });
    await expect(f.engine.create(input(), "pay")).rejects.toThrow(
      "Blocked token",
    );
  });
  it("enforces signed fee caps and refuses changed/expired quotes", async () => {
    const f = fixture(),
      j = await f.engine.create(
        { ...input(), maxForwardingFeeAtomic: "1" },
        "pay",
      );
    await expect(f.engine.next(j.id)).rejects.toThrow("limit");
    const g = fixture(),
      k = await g.engine.create(input(), "pay"),
      q = await g.engine.next(k.id);
    vi.mocked(g.reads.revalidate).mockRejectedValue(Error("Quote expired"));
    await expect(g.engine.arm(k.id, q.steps[0].id)).rejects.toThrow("expired");
    expect(g.held()).toBeUndefined();
  });
  it("serializes arm attempts across jobs using the same wallet", async () => {
    const f = fixture(),
      a = await f.engine.create(input(), "a"),
      b = await f.engine.create(
        { ...input(), clientRequestId: "22222222-2222-4222-8222-222222222222" },
        "b",
      );
    const qa = await f.engine.next(a.id),
      qb = await f.engine.next(b.id);
    await f.engine.arm(a.id, qa.steps[0].id);
    await expect(f.engine.arm(b.id, qb.steps[0].id)).rejects.toThrow("busy");
  });
  it("allows a new source job while the previous transfer waits for destination finality", async () => {
    const f = fixture(),
      a = await f.engine.create(input(), "pay"),
      q = await f.engine.next(a.id);
    await f.engine.arm(a.id, q.steps[0].id);
    vi.mocked(f.reads.status).mockResolvedValue({
      state: "forwarding",
      message: "Awaiting Circle",
      binding: {
        from: wallet.address,
        to: f.p.to,
        data: f.p.data,
        value: f.p.value,
        nonce: 4,
        finalized: true,
      },
    });
    expect(
      (await f.engine.submit(a.id, q.steps[0].id, `0x${"a".repeat(64)}`)).state,
    ).toBe("forwarding");
    expect(f.held()).toBeUndefined();
    await expect(f.engine.next(a.id)).rejects.toThrow("reconcile");
  });
  it("rejects unrelated transactions, preserves uncertainty, and permits finalized cancellation", async () => {
    const f = fixture(),
      j = await f.engine.create(input(), "pay"),
      q = await f.engine.next(j.id);
    await f.engine.arm(j.id, q.steps[0].id);
    vi.mocked(f.reads.transaction).mockResolvedValue({
      from: other,
      to: other,
      input: "0x",
      value: 0n,
      nonce: 4,
    });
    await expect(
      f.engine.submit(j.id, q.steps[0].id, `0x${"a".repeat(64)}`),
    ).rejects.toThrow("sender");
    vi.mocked(f.reads.transaction).mockResolvedValue({
      from: wallet.address,
      to: wallet.address,
      input: "0x",
      value: 0n,
      nonce: 4,
    });
    vi.mocked(f.reads.status).mockResolvedValue({
      state: "pending",
      message: "Pending",
    });
    await expect(
      f.engine.submit(j.id, q.steps[0].id, `0x${"b".repeat(64)}`),
    ).rejects.toThrow("finality");
    expect(f.held()).toBe(j.id);
    vi.mocked(f.reads.status).mockResolvedValue({
      state: "failed",
      message: "Replacement",
      binding: {
        from: wallet.address,
        to: wallet.address,
        data: "0x",
        value: "0",
        nonce: 4,
        finalized: true,
      },
    });
    expect(
      (await f.engine.submit(j.id, q.steps[0].id, `0x${"b".repeat(64)}`)).state,
    ).toBe("failed");
    expect(f.held()).toBeUndefined();
  });
  it("renews only at the same nonce and accepts the original signed variant", async () => {
    const f = fixture(),
      j = await f.engine.create(input(), "pay"),
      q = await f.engine.next(j.id);
    await f.engine.arm(j.id, q.steps[0].id);
    vi.mocked(f.reads.prepare).mockResolvedValue({ ...f.p, nonce: 5 });
    await expect(f.engine.renew(j.id, q.steps[0].id)).rejects.toThrow("nonce");
    vi.mocked(f.reads.prepare).mockResolvedValue({
      ...f.p,
      value: "11",
      circleFee: "11",
      data: "0x5678",
    });
    await f.engine.renew(j.id, q.steps[0].id);
    expect(
      (await f.engine.submit(j.id, q.steps[0].id, `0x${"c".repeat(64)}`)).state,
    ).toBe("complete");
    expect(f.rows.get(j.id)?.steps[0].prepared.data).toBe("0x1234");
  });
});
it("publishes an independent OpenAPI document with all refs resolvable and payment metadata", () => {
  const spec = openapi();
  expect(spec.servers[0].url).toBe("https://bridge-api.argosbot.io");
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x)) {
      if (k === "$ref")
        expect(spec.components.schemas).toHaveProperty(
          String(v).split("/").at(-1)!,
        );
      else walk(v);
    }
  };
  walk(spec);
  expect(spec.paths["/v1/jobs"].post["x-payment-info"].price.amount).toBe(
    "0.01",
  );
});
