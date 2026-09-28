import { describe, expect, it } from "vitest";
import { apiConfig } from "../lib/bridge-api/config";
import {
  admitFeeWorkflow,
  feeAdmissionInput,
  DAY_MS,
  type FeeAdmission,
} from "../lib/fee-report/admission";
import {
  FEE_EXECUTOR,
  FEE_CALL_GAS_CAP,
  FEE_JOB_GAS_CAP,
  FEE_RESERVE,
  assertFeeExecutor,
  assertFeeGasBudget,
  feePrincipal,
} from "../lib/fee-report/policy";

const now = 1_800_000_000_000;
const token = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const input = (
  n = 1,
  channel: "x" | "telegram" | "x402" = "x",
  owner = "123",
) => feeAdmissionInput(`request:${n}`, channel, owner, token(n));
const record = (
  n: number,
  extra: Partial<FeeAdmission> = {},
): FeeAdmission => ({
  ...input(n),
  createdAt: now - 1000,
  active: true,
  ...extra,
});

describe("fee service wallet and gas policy", () => {
  it("uses the existing x402 recipient, with no channel-specific wallet", () => {
    expect(FEE_EXECUTOR).toBe(apiConfig().payTo);
    expect(() => assertFeeExecutor(FEE_EXECUTOR.toLowerCase())).not.toThrow();
    expect(() => assertFeeExecutor(token(1))).toThrow(/revenue wallet/);
    expect(feePrincipal("x", "123")).toBe(feePrincipal("telegram", "123"));
    expect(feePrincipal("x402", "123")).not.toBe(feePrincipal("x", "123"));
  });
  const gas = {
    balanceWei: FEE_RESERVE + FEE_CALL_GAS_CAP,
    otherReservedWei: 0n,
    spentWei: 0n,
    maximumCallWei: FEE_CALL_GAS_CAP,
    calls: 0,
  };
  it("preserves exactly five calls after the maximum transaction cost", () => {
    expect(() => assertFeeGasBudget(gas)).not.toThrow();
    expect(() =>
      assertFeeGasBudget({ ...gas, balanceWei: gas.balanceWei - 1n }),
    ).toThrow(/reserve/);
    expect(() => assertFeeGasBudget({ ...gas, otherReservedWei: 1n })).toThrow(
      /reserve/,
    );
  });
  it("bounds call count, each call and total job gas separately", () => {
    expect(() => assertFeeGasBudget({ ...gas, calls: 3 })).toThrow(/budget/);
    expect(() =>
      assertFeeGasBudget({ ...gas, maximumCallWei: FEE_CALL_GAS_CAP + 1n }),
    ).toThrow(/budget/);
    expect(() =>
      assertFeeGasBudget({
        ...gas,
        spentWei: FEE_JOB_GAS_CAP - FEE_CALL_GAS_CAP,
      }),
    ).not.toThrow();
    expect(() =>
      assertFeeGasBudget({ ...gas, spentWei: FEE_JOB_GAS_CAP }),
    ).toThrow(/budget/);
    expect(() => assertFeeGasBudget({ ...gas, spentWei: -1n })).toThrow(
      /accounting/,
    );
    expect(() => assertFeeGasBudget({ ...gas, calls: NaN })).toThrow(
      /accounting/,
    );
  });
});

describe("fee admission replay and shared sponsorship budgets", () => {
  it("recovers the same request without consuming another allowance", () => {
    const first = admitFeeWorkflow(input(), [], now);
    expect(first.existing).toBe(false);
    expect(admitFeeWorkflow(input(), [first.job], now + 1)).toEqual({
      existing: true,
      job: first.job,
    });
    expect(() =>
      admitFeeWorkflow({ ...input(), token: token(2) }, [first.job], now),
    ).toThrow(/different inputs/);
    expect(() =>
      admitFeeWorkflow({ ...input(), channel: "telegram" }, [first.job], now),
    ).toThrow(/different inputs/);
  });
  it("combines linked social quotas across X and TG", () => {
    const jobs = [record(1), record(2, { channel: "telegram" }), record(3)];
    expect(() => admitFeeWorkflow(input(4, "telegram"), jobs, now)).toThrow(
      /three per user/,
    );
    expect(
      admitFeeWorkflow(input(4, "telegram", "456"), jobs, now).existing,
    ).toBe(false);
    expect(admitFeeWorkflow(input(4, "x402"), jobs, now).existing).toBe(false);
  });
  it("blocks overlapping token workflows across users and payment rails", () => {
    expect(() =>
      admitFeeWorkflow(
        { ...input(2, "x402", "456"), token: token(1) },
        [record(1)],
        now,
      ),
    ).toThrow(/cooldown/);
    expect(() =>
      admitFeeWorkflow(
        { ...input(2), token: token(1) },
        [record(1, { active: false, actualGasWei: "0" })],
        now,
      ),
    ).toThrow(/cooldown/);
    expect(() =>
      admitFeeWorkflow(
        { ...input(2), token: token(1) },
        [record(1, { createdAt: now - DAY_MS * 2 })],
        now,
      ),
    ).toThrow(/cooldown/);
  });
  it("retains unresolved reservations across day boundaries", () => {
    const jobs = Array.from({ length: 33 }, (_, n) =>
      record(n + 1, {
        principal: `social:${n}`,
        createdAt: now - 2 * DAY_MS,
      }),
    );
    expect(() => admitFeeWorkflow(input(99), jobs, now)).toThrow(/gas budget/);
    expect(admitFeeWorkflow(input(99, "x402"), jobs, now).existing).toBe(false);
  });
  it("uses actual receipt gas for resolved jobs; never trusts missing accounting", () => {
    const jobs = Array.from({ length: 33 }, (_, n) =>
      record(n + 1, {
        principal: `social:${n}`,
        active: false,
      }),
    );
    expect(() => admitFeeWorkflow(input(99), jobs, now)).toThrow(/gas budget/);
    expect(
      admitFeeWorkflow(
        input(99),
        jobs.map((j) => ({ ...j, actualGasWei: "100", completedAt: now })),
        now,
      ).existing,
    ).toBe(false);
    expect(() =>
      admitFeeWorkflow(input(99), [record(1, { actualGasWei: "-1" })], now),
    ).toThrow(/recorded fee gas/);
  });
  it("caps paid traffic too", () => {
    const jobs = Array.from({ length: 166 }, (_, n) =>
      record(n + 1, { channel: "x402" }),
    );
    expect(() => admitFeeWorkflow(input(999, "x402"), jobs, now)).toThrow(
      /gas budget/,
    );
  });
  it("counts delayed finality in the current day's spend, not its old admission day", () => {
    const jobs = Array.from({ length: 34 }, (_, n) =>
      record(n + 1, {
        principal: `social:${n}`,
        active: false,
        createdAt: now - 3 * DAY_MS,
        actualGasWei: FEE_JOB_GAS_CAP.toString(),
        completedAt: now - 1,
      }),
    );
    expect(() => admitFeeWorkflow(input(999), jobs, now)).toThrow(/gas budget/);
    expect(
      admitFeeWorkflow(
        input(999),
        jobs.map((j) => ({ ...j, completedAt: now - 2 * DAY_MS })),
        now,
      ).existing,
    ).toBe(false);
    expect(() =>
      admitFeeWorkflow(
        input(999),
        jobs.map((j) => ({
          ...j,
          completedAt: now - 2 * DAY_MS,
          actualGasWei: undefined,
        })),
        now,
      ),
    ).toThrow(/gas budget/);
  });
  it("rejects arbitrary caller, token and id input", () => {
    expect(() => feeAdmissionInput("", "x", "123", token(1))).toThrow();
    expect(() => feeAdmissionInput("a", "x", "bad user", token(1))).toThrow();
    expect(() => feeAdmissionInput("a", "x", "123", token(0))).toThrow();
  });
});
