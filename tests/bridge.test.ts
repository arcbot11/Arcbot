import { describe, it, expect, vi } from "vitest";
import { encodeFunctionData, zeroAddress, type Address } from "viem";
import {
  abi,
  ownerlessId,
  OWNERLESS,
  SERVICE,
  type Prepared,
} from "../lib/bridge/contracts";
import {
  assertOwnerless,
  originalAllowed,
  assertRiskAcknowledged,

} from "../lib/bridge/policy";
import {
  exactBridgeAmount,
  quoteExpiry,
  verifySeal,
  prepare,
} from "../lib/bridge/prepare";
import { validateCall, sendReviewed } from "../lib/bridge/browser";
import { contractAbsent, notRegistered } from "../lib/bridge/read";
const original = "0xece5ca8bf9220718e5727754026757512212cb3c" as Address,
  account = "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC",
  manager = "0x0AF07dDfd8F1ea073f780981895f5970705CF42f";
function approval(): Prepared {
  return {
    intent: {
      chain: 5042,
      token: original,
      account,
      action: "transfer",
      riskAcknowledged: true,
      amount: "10",
    },
    route: {
      source: 5042,
      destination: 8453,
      origin: 5042,
      original,
      token: original,
      manager,
      tokenId: ownerlessId(5042, original),
      name: "Argus",
      symbol: "ARGUS",
      decimals: 18,
      state: "ready",
      compatible: true,
    },
    step: "approve",
    to: original,
    data: encodeFunctionData({
      abi,
      functionName: "approve",
      args: [manager, 10n ** 19n],
    }),
    value: "0",
    circleFee: "0",
    gas: "100000",
    maxFeePerGas: "1000",
    maxPriorityFeePerGas: "1",
    gasBudget: "200000000",
    nonce: 1,
    expiresAt: Date.now() + 30000,
    seal: "0".repeat(64),
  };
}
it("does not journal an expired review or changed wallet", async () => {
  const before = vi.fn(),
    request = vi.fn(async ({ method }: { method: string }) =>
      method === "eth_accounts" ? [account] : "0x2105",
    );
  await expect(sendReviewed({ request }, approval(), before)).rejects.toThrow(
    "changed",
  );
  expect(before).not.toHaveBeenCalled();
  const p = approval();
  p.expiresAt = Date.now() - 1;
  await expect(sendReviewed({ request }, p, before)).rejects.toThrow("expired");
  expect(before).not.toHaveBeenCalled();
});
it("rechecks expiry after wallet identity reads", async () => {
  const p = approval(),
    before = vi.fn(),
    request = vi.fn(async ({ method }: { method: string }) => {
      p.expiresAt = 1;
      return method === "eth_accounts" ? [account] : "0x13b2";
    });
  await expect(sendReviewed({ request }, p, before)).rejects.toThrow("expired");
  expect(before).not.toHaveBeenCalled();
  expect(request.mock.calls).toHaveLength(2);
});
it("persists before requesting a signature and aborts if persistence fails", async () => {
  const calls: string[] = [];
  const request = vi.fn(async ({ method }: { method: string }) => {
    calls.push(method);
    return method === "eth_accounts"
      ? [account]
      : method === "eth_chainId"
        ? "0x13b2"
        : "0x" + "11".repeat(32);
  });
  await sendReviewed({ request }, approval(), () => {
    calls.push("persist");
  });
  expect(calls.indexOf("persist")).toBeLessThan(
    calls.indexOf("eth_sendTransaction"),
  );
  request.mockClear();
  await expect(
    sendReviewed({ request }, approval(), () => {
      throw Error("storage full");
    }),
  ).rejects.toThrow("storage full");
  expect(
    request.mock.calls.some((c) => c[0].method === "eth_sendTransaction"),
  ).toBe(false);
});
it("fails closed for unknown steps and action/route mismatches", () => {
  const p = approval();
  expect(() =>
    validateCall({ ...p, step: "unexpected" } as unknown as Prepared),
  ).toThrow("step");
  expect(() =>
    validateCall({ ...p, intent: { ...p.intent, action: "register" } }),
  ).toThrow("step");
  expect(() =>
    validateCall({ ...p, route: { ...p.route, compatible: false } }),
  ).toThrow("route");
});
describe("external bridge safety", () => {
  it("derives the existing ownerless ARGUS identity", () =>
    expect(ownerlessId(5042, original)).toBe(
      "0xc476e1fea404e28b324c727a1bba343ab29413af46f01ea9ce16b2f7838f7c54",
    ));
  it("does not interpret renounced or assigned ownership as ownerless", () => {
    expect(() =>
      assertOwnerless(OWNERLESS, zeroAddress, SERVICE),
    ).not.toThrow();
    expect(() => assertOwnerless(zeroAddress, zeroAddress, SERVICE)).toThrow();
    expect(() => assertOwnerless(OWNERLESS, account, SERVICE)).toThrow();
  });
  it("allows arbitrary originals but blocks configured originals on their origin chain", () => {
    expect(originalAllowed(5042, account, undefined)).toBe(true);
    const blocked = JSON.stringify([{ chain: 5042, token: original }]);
    expect(originalAllowed(5042, original, blocked)).toBe(false);
    expect(originalAllowed(8453, original, blocked)).toBe(true);
    expect(() => originalAllowed(5042, original, '[{}]')).toThrow();
    expect(() => originalAllowed(5042, original, 'bad json')).toThrow();
  });
  it("requires acknowledgement for transfers and approvals but leaves setup open", () => {
    const p = approval();
    delete p.intent.riskAcknowledged;
    expect(() => validateCall(p)).toThrow("Acknowledge");
    expect(() => assertRiskAcknowledged({ action: "register" })).not.toThrow();
    expect(() => assertRiskAcknowledged({ action: "deploy" })).not.toThrow();
    expect(() => assertRiskAcknowledged({ action: "transfer", riskAcknowledged: false })).toThrow();
    expect(() => assertRiskAcknowledged({ action: "transfer", riskAcknowledged: true })).not.toThrow();
  });
  it("rejects a missing acknowledgement on the server before RPC or quote work", async () => {
    const intent = approval().intent;
    delete intent.riskAcknowledged;
    await expect(prepare(intent)).rejects.toThrow("Acknowledge");
  });
  it.each(["0", "-1", "1e18", "0.0000001", "1.0000001", "01", "Infinity"])(
    "rejects invalid or rounded amounts %s",
    (value) => expect(() => exactBridgeAmount(value, 6)).toThrow(),
  );
  it("preserves precise token units", () =>
    expect(exactBridgeAmount("1.000001", 6)).toBe(1000001n));
  it("fails closed on network errors", () => {
    expect(contractAbsent(Error("timeout"))).toBe(false);
    expect(notRegistered(Error("timeout"))).toBe(false);
  });
  it("rejects expired forwarding quotes and non-native fees", () => {
    const q = {
      signedQuote: "0x1234" as const,
      feeToken: zeroAddress,
      feeTotalAmount: "1",
      expiry: {
        mode: "TIMESTAMP" as const,
        expiresAt: Math.floor(Date.now() / 1000) + 120,
      },
    };
    expect(quoteExpiry(q, 1n)).toBeGreaterThan(Date.now());
    expect(() => quoteExpiry({ ...q, feeToken: account }, 1n)).toThrow();
    expect(() =>
      quoteExpiry({ ...q, expiry: { mode: "TIMESTAMP", expiresAt: 1 } }, 1n),
    ).toThrow();
  });
  it("rejects tampering with signed reviews", () => {
    vi.stubEnv("BRIDGE_QUOTE_SECRET", "x".repeat(32));
    expect(() => verifySeal(approval())).toThrow("Invalid bridge review");
    vi.unstubAllEnvs();
  });
  it("allows only exact manager approvals", () => {
    const p = approval();
    expect(() => validateCall(p)).not.toThrow();
    p.data = encodeFunctionData({
      abi,
      functionName: "approve",
      args: [account, 10n ** 19n],
    });
    expect(() => validateCall(p)).toThrow("Invalid token approval");
  });
  it("does not request signing after an account change", async () => {
    const request = vi.fn(async ({ method }: { method: string }) =>
      method === "eth_accounts" ? [zeroAddress] : "0x13b2",
    );
    await expect(sendReviewed({ request }, approval())).rejects.toThrow(
      "changed",
    );
    expect(
      request.mock.calls.some((c) => c[0].method === "eth_sendTransaction"),
    ).toBe(false);
  });
  it("does not request signing on the wrong chain", async () => {
    const request = vi.fn(async ({ method }: { method: string }) =>
      method === "eth_accounts" ? [account] : "0x2105",
    );
    await expect(sendReviewed({ request }, approval())).rejects.toThrow(
      "changed",
    );
    expect(
      request.mock.calls.some((c) => c[0].method === "eth_sendTransaction"),
    ).toBe(false);
  });
});
