import { describe, expect, it, vi } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import type { ArcRpc } from "../lib/arc/rpc";
import { PORTAL8, PORTAL8_CREATOR_REGISTRY } from "../lib/launches/portal8";
import { PORTAL7 } from "../lib/launches/contracts";
import {
  feeReadAbi,
  readFeeReport,
  type FeeReportDependencies,
} from "../lib/fee-report/read";
import { feeReportInput } from "../lib/fee-report/model";
import {
  feeReportLines,
  feeReportSummary,
  feeReportXParts,
} from "../lib/fee-report/format";

const address = (n: number) =>
  `0x${n.toString(16).padStart(40, "0")}` as Address;
const token = address(1),
  quote = address(2),
  splitter = address(3),
  creator = address(4),
  tracker = address(5),
  payout = address(6);
const head = {
  number: 123n,
  hash: `0x${"12".repeat(32)}` as Hex,
  timestamp: 1700000000n,
};
function fixture(portal: Address = address(9)) {
  const values: Record<string, unknown> = {
    token,
    quoteAsset: quote,
    creator,
    rewardTracker: tracker,
    payoutAsset: payout,
    accountedQuote6: 70n,
    accountedToken18: 90n,
    pendingPrincipalQuote6: 20n,
    pendingPrincipalToken18: 30n,
    creatorBps: 4000,
    burnBps: 2000,
    dividendBps: 3000,
    liquidityBps: 1000,
    treasuryBps: 100,
    claimableQuote6: 15n,
    claimableToken18: 25n,
    claimableUsdc6: 2n,
    heldPayout: 40n,
    totalPaid: 500n,
    portal: PORTAL8,
    creatorRegistry: PORTAL8_CREATOR_REGISTRY,
    escrowOf: splitter,
    payoutOf: creator,
    payoutSplit: [[creator], [10000]],
    owedCreator: 17n,
    lockBps: 0,
    budgetBurn: 2n,
    budgetLiquidity: 3n,
    budgetLock: 0n,
    owedTreasury: 1n,
    rawLiability: 7n,
    dividendsPaidQuote: 13n,
    symbol: "@FAKE",
  };
  const rpc = {
    chainId: vi.fn(async () => 5042),
    block: vi.fn(async () => head),
    code: vi.fn(async (a: Address) =>
      a === splitter
        ? "0x363d3d373d3d3d363d736c8f50b8895d5a22c97e611b8f9678a09d045b165af43d82803e903d91602b57fd5bf3"
        : "0x01",
    ),
    decimals: vi.fn(async (a: Address) =>
      a === token ? 3 : a === quote ? 2 : 6,
    ),
    tokenBalance: vi.fn(async () => 100n),
    call: vi.fn(async (tx: { data: Hex }) => {
      const { functionName } = decodeFunctionData({
        abi: feeReadAbi,
        data: tx.data,
      });
      if (!(functionName in values)) throw Error("Missing mock");
      return encodeFunctionResult({
        abi: feeReadAbi,
        functionName,
        result: values[functionName],
      } as never);
    }),
    broadcast: vi.fn(() => {
      throw Error("No writes allowed");
    }),
    nonce: vi.fn(),
    estimateGas: vi.fn(),
    fees: vi.fn(),
    receipt: vi.fn(),
    balance: vi.fn(),
  };
  const discover = vi.fn(async () => ({
    portal,
    splitter,
    hook: address(7),
    locker: address(8),
    poolId: head.hash,
    block: head.number,
    pool: {
      protocol: "v4" as const,
      currency0: token,
      currency1: quote,
      fee: 10000,
      tickSpacing: 200,
      hooks: address(7),
    },
  }));
  const deps: FeeReportDependencies = {
    rpc: rpc as unknown as ArcRpc,
    head: async () => head,
    discover: discover as unknown as FeeReportDependencies["discover"],
    verifyPortal8: vi.fn(
      async () => undefined,
    ) as unknown as FeeReportDependencies["verifyPortal8"],
  };
  return { rpc, values, deps, discover };
}
describe("read-only token fee reports", () => {
  it("keeps compact social reports bounded, avoids mentions, and distinguishes unknown lifetime totals", async () => {
    const f = fixture();
    const report = await readFeeReport({ token }, f.deps);
    const lines = feeReportSummary(report);
    expect(lines.join("\n")).toContain("Lifetime fees earned: Not available");
    expect(lines.join("\n")).toContain("Awaiting crank:");
    expect(lines.join("\n")).toContain("Creator fees ready to claim:");
    expect(lines.join("\n")).toContain("Holder funds awaiting distribution:");
    expect(lines.join("\n")).not.toMatch(/block:/i);
    expect(lines.join("\n")).not.toMatch(/simulation|estimated gas|@FAKE/i);
    const parts = feeReportXParts(report);
    expect(
      parts.every((p) => p.length <= 280 && /^[\x00-\x7F]*$/.test(p)),
    ).toBe(true);
    expect(parts.join("\n")).toBe(lines.join("\n"));
    expect(report).not.toHaveProperty("history");
  });
  it("keeps reserves and debts out of unallocated balances, uses actual asset decimals and pins reads", async () => {
    const f = fixture();
    const r = await readFeeReport({ token }, f.deps);
    expect(r.status).toBe("partial");
    expect(r.unallocated?.map((a) => a.formatted)).toEqual(["0.3", "0.01"]);
    expect(r.creatorOwed?.map((a) => [a.bucket, a.formatted])).toEqual([
      ["quote", "0.15"],
      ["launchToken", "0.025"],
    ]);
    expect(r.liquidityReserved?.map((a) => a.raw)).toEqual(["20", "30"]);
    expect(r.holderRewards?.available.raw).toBe("60");
    expect(r.allocationBps?.treasury).toBe(100);
    expect(r.execution.enabled).toBe(false);
    for (const call of f.rpc.call.mock.calls) expect(call[0]).toBeDefined();
    expect(
      f.rpc.call.mock.calls.every((c) => (c as unknown[])[1] === head.number),
    ).toBe(true);
    expect(
      f.rpc.tokenBalance.mock.calls.every(
        (c) => (c as unknown[])[2] === head.number,
      ),
    ).toBe(true);
    expect(f.rpc.broadcast).not.toHaveBeenCalled();
    expect(f.rpc.nonce).not.toHaveBeenCalled();
    expect(feeReportLines(r).join("\n")).not.toContain("@FAKE");
  });
  it("labels Portal 7's separate USDC credit bucket", async () => {
    const f = fixture(PORTAL7);
    const r = await readFeeReport({ token }, f.deps);
    expect(r.creatorOwed?.find((a) => a.bucket === "usdc")?.raw).toBe("2");
  });
  it("reports Portal 8 quote debt without pretending it is payout proceeds or known crank funds", async () => {
    const f = fixture(PORTAL8);
    const r = await readFeeReport({ token }, f.deps);
    expect(r.status).toBe("partial");
    expect(r.family).toBe("portal8-escrow");
    expect(r.creatorOwed?.[0]).toMatchObject({
      address: quote,
      raw: "17",
      formatted: "0.17",
    });
    expect(r.assets?.payout.address).toBe(payout);
    expect(r.unallocated).toBeNull();
    expect(r.signals.unprocessedFees).toBe(false);
    expect(r.escrowBudgets?.holderLiability).toMatchObject({address: quote, raw: "7"});
    expect(r.allocationBps?.lock).toBe(0);
    expect(feeReportLines(r).join("\n")).toContain("Automatic; no crank needed");
    expect(r.beneficiaries).toEqual([{ address: creator, shareBps: 10000 }]);
    expect(f.deps.verifyPortal8).toHaveBeenCalledWith(f.deps.rpc, head.number);
  });
  it.each([
    "accounting",
    "tracker",
    "registry",
    "allocation",
    "reorg",
    "rpc",
    "chain",
  ])(
    "fails closed on %s failure without returning zero or partial balances",
    async (kind) => {
      const f = fixture(kind === "registry" ? PORTAL8 : address(9));
      if (kind === "accounting") f.values.accountedQuote6 = 101n;
      if (kind === "tracker") f.values.token = address(99);
      if (kind === "registry") f.values.escrowOf = address(99);
      if (kind === "allocation") f.values.creatorBps = 1;
      if (kind === "reorg")
        f.rpc.block.mockResolvedValue({
          ...head,
          hash: `0x${"34".repeat(32)}`,
        });
      if (kind === "rpc")
        f.rpc.call.mockRejectedValue(Error("secret RPC credential"));
      if (kind === "chain") f.rpc.chainId.mockResolvedValue(1);
      const r = await readFeeReport({ token }, f.deps);
      expect(r.status).toBe("unavailable");
      expect(r.balances).toBeNull();
      expect(r.signals.creatorFeesOwed).toBeNull();
      expect(JSON.stringify(r)).not.toContain("secret");
    },
  );
  it("distinguishes absent launch from failed discovery", async () => {
    const f = fixture();
    f.deps.discover = vi.fn(async () => null);
    expect((await readFeeReport({ token }, f.deps)).status).toBe("unsupported");
    f.deps.discover = vi.fn(async () => {
      throw Error("offline");
    });
    expect((await readFeeReport({ token }, f.deps)).status).toBe("unavailable");
  });
  it("rejects unknown implementations rather than guessing their accounting", async () => {
    const f = fixture();
    f.rpc.code.mockResolvedValue("0x01");
    expect((await readFeeReport({ token }, f.deps)).status).toBe("unsupported");
  });
  it("requires explicit valid input and never accepts execution options", () => {
    for (const input of [
      {},
      { token: zeroAddress },
      { token, chain: "base" },
      { token, action: "claim" },
    ])
      expect(feeReportInput.safeParse(input).success).toBe(false);
  });
});
