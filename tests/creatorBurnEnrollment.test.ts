import { afterEach, describe, it, expect, vi } from "vitest";
import { getFunctionName } from "convex/server";
import * as enrollment from "../convex/creatorBurnEnrollment";
const signer = vi.hoisted(() => vi.fn());
vi.mock("../convex/automatedFeeEngine", () => ({ signerRequest: signer }));
const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
function setup() {
  const rows: Record<string, any[]> = {
    automatedFeePrograms: [
      {
        _id: "p",
        status: "enrolled",
        distributionMode: "wallet",
        normalizedTokenAddress: a(1),
        tokenAddress: a(1),
        normalizedControllerAddress: a(2),
        vaultAddress: a(3),
      },
    ],
    cryptoWallets: [
      {
        _id: "w",
        ownerXUserId: "owner",
        address: a(2),
        status: "active",
        chainId: 4663,
      },
    ],
    creatorBurnRequests: [],
  };
  const db: any = {
    get: async (id: string) =>
      Object.values(rows)
        .flat()
        .find((r) => r._id === id),
    patch: async (id: string, p: any) => Object.assign(await db.get(id), p),
    insert: async (t: string, r: any) => {
      const id = `${t}${(rows[t] ??= []).length}`;
      rows[t].push({ _id: id, ...r });
      return id;
    },
    query: (t: string) => {
      const f: any[] = [];
      const b: any = {
        eq: (k: string, v: any) => {
          f.push((r: any) => r[k] === v);
          return b;
        },
      };
      const result = () =>
        (rows[t] ?? []).filter((r) => f.every((fn) => fn(r)));
      const q: any = {
        withIndex: (_: string, cb: any) => {
          cb(b);
          return q;
        },
        unique: async () => result()[0] ?? null,
        first: async () => result()[0] ?? null,
        collect: async () => result(),
        take: async (count: number) => result().slice(0, count),
      };
      return q;
    },
  };
  return { rows, ctx: { db, scheduler: { runAfter: vi.fn() } } };
}
const args = {
  requestId: "test-request",
  tokenAddress: a(1),
  ownerXUserId: "owner",
  bps: 5000,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("creator burn enrollment authorization and persistence", () => {
  it.each(["true", "false", ""])("rejects new enrollment without mutating existing state for flag %s", async flag => {
    vi.stubEnv("CREATOR_SELF_BUYBACK_ENABLED", flag);
    const {ctx, rows} = setup();
    rows.creatorBurnRequests.push({_id:"old",...args,programId:"p",status:"pending",deploymentSigned:"0x1234"});
    const before = structuredClone(rows);
    await expect(enrollment.queueCreatorBurnRequest(ctx as any, args)).rejects.toThrow("unavailable");
    expect(rows).toEqual(before);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(signer).not.toHaveBeenCalled();
  });
  it("does not exhaust recovery while waiting for genuine escrow fees", async () => {
    const { ctx, rows } = setup();
    rows.creatorBurnRequests.push({ _id: "r", ...args, programId: "p", attempts: 12, leaseId: "lease", status: "pending" });
    await (enrollment.save as any)._handler(ctx, { id: "r", leaseId: "lease", diagnostic: "Waiting for Argus to credit creator fees to escrow" });
    expect(rows.creatorBurnRequests[0].status).toBe("pending");
  });
  
  it.each([false, true])("caps unsigned failures but preserves unresolved signed work: %s", async (signed) => {
    const { ctx, rows } = setup();
    rows.creatorBurnRequests.push({ _id: "r", ...args, programId: "p", attempts: 12, leaseId: "lease", status: "pending",
      ...(signed ? { deploymentSigned: "0x1234" } : {}) });
    await (enrollment.save as any)._handler(ctx, { id: "r", leaseId: "lease", diagnostic: "RPC unavailable" });
    expect(rows.creatorBurnRequests[0].status).toBe(signed ? "pending" : "manual_review");
  });
  it("rejects disabled enrollment", async () => {
    vi.stubEnv("CREATOR_SELF_BUYBACK_ENABLED", "false");
    const { ctx } = setup();
    await expect(
      enrollment.queueCreatorBurnRequest(ctx as any, args),
    ).rejects.toThrow("unavailable");
  });
  it.each(["different", "frozen", "wrong-chain"])(
    "rejects %s wallet",
    async (kind) => {
      vi.stubEnv("CREATOR_SELF_BUYBACK_ENABLED", "true");
      const { ctx, rows } = setup();
      if (kind === "different") rows.cryptoWallets[0].address = a(9);
      if (kind === "frozen") rows.cryptoWallets[0].status = "frozen";
      if (kind === "wrong-chain") rows.cryptoWallets[0].chainId = 1;
      await expect(
        enrollment.queueCreatorBurnRequest(ctx as any, args),
      ).rejects.toThrow("unavailable");
      expect(rows.creatorBurnRequests).toHaveLength(0);
    },
  );
  
  
  
  it("repairs scheduling locks for requests accepted before the barrier existed", async () => {
    const { ctx, rows } = setup();
    rows.automatedFeePrograms[0].nextProcessAt = 123;
    rows.creatorBurnRequests.push({
      _id: "r",
      ...args,
      programId: "p",
      status: "pending",
      nextAttemptAt: 1,
    });
    const result = await (enrollment.reconcileConfigurationLocks as any)._handler(ctx, {
      requestId: args.requestId,
      tokenAddress: args.tokenAddress,
    });
    expect(result).toMatchObject({ requestId: args.requestId, tokenAddress: args.tokenAddress, locked: true, changed: true });
    expect(rows.automatedFeePrograms[0]).toMatchObject({
      configurationChangeRequestId: args.requestId,
      nextProcessAt: undefined,
    });
  });
  it("reuses saved deployment envelope without another signature", async () => {
    vi.stubEnv("CREATOR_SELF_BUYBACK_ENABLED", "true");
    const calls: any[] = [];
    const r = {
      _id: "r",
      requestId: "root",
      programId: "p",
      ownerXUserId: "owner",
      ownerAddress: a(2),
      bps: 5000,
      deploymentSigned: "0x1234",
      deploymentIdentity: h(8),
    };
    signer.mockImplementation(async (path, body) => {
      calls.push({ path, body });
      if (path.endsWith("discover")) return { layer: null };
      if (path.endsWith("deploy-layer")) return { status: "pending" };
      throw new Error(path);
    });
    const ctx: any = {
      runQuery: vi.fn(async (ref: any) =>
        getFunctionName(ref).endsWith("controllerRecoveryWallet")
          ? "w"
          : { _id: "p", status: "enrolled", vaultAddress: a(3) },
      ),
      runMutation: vi.fn(async (ref: any) => {
        const n = getFunctionName(ref);
        if (n.endsWith(":begin")) return r;
        if (n.includes("acquire")) return true;
      }),
      runAction: vi.fn(),
    };
    await (enrollment.run as any)._handler(ctx, { id: "r" });
    expect(calls.filter((c) => c.path.endsWith("deploy-layer"))).toEqual([
      {
        path: "/v1/creator-burn/deploy-layer",
        body: expect.objectContaining({ signedTransaction: "0x1234" }),
      },
    ]);
    expect(ctx.runAction).not.toHaveBeenCalled();
  });
});
