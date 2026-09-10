import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, keccak256, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcConfig, ARC_USDC } from "../lib/arc/config.ts";
import { ARC_BURN_ADDRESS, burnTransfer, prepareSend, sendDigest, sendIntent } from "../lib/arc/transfers.ts";
import { ArcSendExecutor, inspectArcSend } from "../lib/arc/execution.ts";
import { FileArcJournal } from "../lib/arc/journal.ts";
import type { ArcRpc } from "../lib/arc/rpc.ts";
const account = privateKeyToAccount(`0x${"1".padStart(64, "0")}`);
const token = "0x3333333333333333333333333333333333333333";
const input = { chainId: 5042, operation: "burn", from: account.address, asset: token, amount: "1.25", requestId: "arc-burn-0001" };
const hash = `0x${"a".repeat(64)}` as Hex;
const now = 1_800_000_000_000;
const config = arcConfig({ rpcUrl: "https://arc.example", checkpointNumber: "1", checkpointHash: hash });
function rpcFixture() {
  return {
    chainId: vi.fn(async () => 5042), block: vi.fn(async (number = 100n) => ({ number, hash, timestamp: BigInt(now / 1000) })),
    balance: vi.fn(async () => 10n ** 20n), code: vi.fn(async () => "0x6000" as Hex), decimals: vi.fn(async () => 6),
    tokenBalance: vi.fn(async () => 10n ** 10n), call: vi.fn(async () => `0x${"0".repeat(63)}1` as Hex),
    estimateGas: vi.fn(async () => 50000n), fees: vi.fn(async () => ({ maxFeePerGas: 100n, maxPriorityFeePerGas: 1n })),
    nonce: vi.fn(async () => 0), broadcast: vi.fn(async (raw: Hex) => keccak256(raw)), receipt: vi.fn<ArcRpc["receipt"]>(async () => null),
  } satisfies ArcRpc;
}
describe("Arc token burns", () => {
  it("builds transfer(dead, exact token units), without approvals or burn()", async () => {
    const rpc = rpcFixture(); const p = await prepareSend(burnTransfer(input), rpc, config, now);
    const decoded = decodeFunctionData({ abi: parseAbi(["function transfer(address,uint256) returns (bool)"]), data: p.transaction.data });
    expect(decoded.functionName).toBe("transfer"); expect(decoded.args).toEqual([ARC_BURN_ADDRESS, 1250000n]);
    expect(p.transaction.to).toBe(token); expect(p.transaction.value).toBe(0n);
    expect(p.intent.operation).toBe("burn");
  });
  it.each([{ recipient: token }, { asset: "native" }, { chainId: 8453 }, { amount: "1e9" }, { operation: "send" }])("rejects invalid burn input %j", change => {
    expect(() => burnTransfer({ ...input, ...change })).toThrow();
  });
  it("enforces the dead recipient at the executor/journal schema boundary too", () => {
    expect(() => sendIntent.parse({ ...input, recipient: token })).toThrow(/dead/);
    expect(() => sendIntent.parse({ ...input, asset: "native", recipient: ARC_BURN_ADDRESS })).toThrow(/ERC-20/);
  });
  it("binds burn intent separately from an ordinary send", () => {
    const burn = burnTransfer(input);
    expect(sendDigest(burn)).not.toBe(sendDigest({ ...burn, operation: "send" }));
  });
  it("rejects false-returning tokens and insufficient balances", async () => {
    const rpc = rpcFixture(); rpc.call.mockResolvedValue(`0x${"0".repeat(64)}`);
    await expect(prepareSend(burnTransfer(input), rpc, config, now)).rejects.toThrow(/false/);
    rpc.tokenBalance.mockResolvedValue(0n);
    await expect(prepareSend(burnTransfer(input), rpc, config, now)).rejects.toThrow(/Insufficient/);
  });
  it("reserves gas from the shared balance when burning ERC-20 USDC", async () => {
    const rpc = rpcFixture(); rpc.balance.mockResolvedValue(1250000n * 10n ** 12n);
    await expect(prepareSend(burnTransfer({ ...input, asset: ARC_USDC }), rpc, config, now)).rejects.toThrow();
  });
  it("shares send locking, idempotency and recovery, without claiming supply reduction", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arc-burn-test-"));
    try {
      const rpc = rpcFixture(), journal = new FileArcJournal(directory);
      const sign = vi.fn(account.signTransaction);
      const executor = new ArcSendExecutor(rpc, config, journal, { address: account.address, signTransaction: sign }, () => now);
      rpc.broadcast.mockRejectedValueOnce(new Error("timeout"));
      const first = await executor.burn(input);
      expect(first.status).toBe("unknown");
      expect(first.destination).toBe(ARC_BURN_ADDRESS); expect(first.supplyReductionVerified).toBe(false);
      expect((await executor.burn(input)).status).toBe("submitted"); expect(sign).toHaveBeenCalledTimes(1);
      expect(rpc.broadcast.mock.calls[0][0]).toBe(rpc.broadcast.mock.calls[1][0]);
      await expect(executor.execute({ ...burnTransfer(input), operation: "send" })).rejects.toThrow(/Idempotency/);
      await expect(executor.execute({ ...burnTransfer(input), operation: "send", requestId: "another-send-1" })).rejects.toThrow(/unfinished/);
      rpc.receipt.mockResolvedValue({ hash: first.hash!, status: "success", blockHash: hash, blockNumber: 100n, gasUsed: 50000n, effectiveGasPrice: 100n });
      const status = await inspectArcSend(rpc, config, journal, account.address, input.requestId, now);
      expect(status.status).toBe("mined"); expect(status.supplyReductionVerified).toBe(false); expect(status.deliveryVerified).toBe(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
