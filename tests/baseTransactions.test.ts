import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseConfig, baseConfigFromEnv } from "../lib/base/config.ts";
import { prepareSend, type BaseTransaction } from "../lib/base/transfers.ts";
import { BaseSendExecutor, inspectBaseSend, cancelUnsignedBaseSend, verifySignedSend } from "../lib/base/execution.ts";
import { FileBaseJournal, parseJournalJson, journalJson } from "../lib/base/journal.ts";
import { baseReceiptFinality, checkBaseRpc, type BaseRpc, type BaseReceipt } from "../lib/base/rpc.ts";
import { localBaseSigner } from "../lib/base/local-signer.ts";
// Public test fixture. Never funded or used against a live RPC.
const key = `0x${"1".padStart(64, "0")}` as Hex;
const account = privateKeyToAccount(key);
const recipient = "0x2222222222222222222222222222222222222222";
const hash = `0x${"a".repeat(64)}` as Hex;
const now = 1_800_000_000_000;
const config = baseConfig({ rpcUrl: "https://base.example", checkpointNumber: "1", checkpointHash: hash });
const intent = { chainId: 8453, operation: "send", from: account.address, recipient, asset: "native", amount: "1", requestId: "base-request-1" };
function rpcFixture() {
  return {
    chainId: vi.fn(async () => 8453),
    block: vi.fn(async (number = 100n) => ({ number, hash, timestamp: BigInt(now / 1000) })),
    settlementBlock: vi.fn<BaseRpc["settlementBlock"]>(async () => ({ number: 99n, hash, timestamp: BigInt(now / 1000) })),
    balance: vi.fn(async () => 10n ** 20n), call: vi.fn(async () => "0x" as Hex), estimateGas: vi.fn(async () => 21000n),
    fees: vi.fn(async () => ({ maxFeePerGas: 100n, maxPriorityFeePerGas: 1n })),
    extraFees: vi.fn(async () => ({ l1FeeUpperBoundWei: 1000n, operatorFeeWei: 200n })),
    nonce: vi.fn(async () => 0), broadcast: vi.fn(async (raw: Hex) => keccak256(raw)),
    receipt: vi.fn<BaseRpc["receipt"]>(async () => null),
  } satisfies BaseRpc;
}
const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "base-send-test-")); directories.push(directory);
  const journal = new FileBaseJournal(directory), rpc = rpcFixture();
  const signer = { address: account.address, signTransaction: vi.fn((tx: BaseTransaction) => account.signTransaction(tx)) };
  const executor = new BaseSendExecutor(rpc, config, journal, signer, () => now);
  return { directory, journal, rpc, signer, executor };
}
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

describe("Base ETH preparation", () => {
  it("uses 8453 and exact ETH units with L1/operator reserves", async () => {
    const p = await prepareSend(intent, rpcFixture(), config, now);
    expect(p.transaction).toMatchObject({ chainId: 8453, value: 10n ** 18n, data: "0x", to: recipient, gas: 25200n });
    expect(p.gasReserveWei).toBe(2522400n);
  });
  it.each([1, 84532, 5042])("rejects chain %s before touching wallet state", async chain => {
    const rpc = rpcFixture(); rpc.chainId.mockResolvedValue(chain);
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow(/8453/);
    expect(rpc.call).not.toHaveBeenCalled();
  });
  it.each(["1e-3", "0", "-1", "1.0000000000000000001"])("rejects invalid ETH amount %s", async amount => {
    await expect(prepareSend({ ...intent, amount }, rpcFixture(), config, now)).rejects.toThrow();
  });
  it("rejects token sends, calldata and a mismatched intent chain", async () => {
    for (const change of [{ asset: recipient }, { data: "0x1234" }, { chainId: 5042 }]) {
      await expect(prepareSend({ ...intent, ...change }, rpcFixture(), config, now)).rejects.toThrow();
    }
  });
  it("does not inherit Arc credentials or provider settings", () => {
    expect(() => baseConfigFromEnv({ ARC_MAINNET_RPC_URL: "https://example.com" })).toThrow();
    expect(() => localBaseSigner({ ARC_SIGNER_PRIVATE_KEY: key })).toThrow();
    expect(localBaseSigner({ BASE_SIGNER_PRIVATE_KEY: key }).address).toBe(account.address);
  });
  it("fails closed when the fee oracle is unavailable", async () => {
    const rpc = rpcFixture(); rpc.extraFees.mockRejectedValue(new Error("unavailable"));
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow(/unavailable/);
  });
  it("reserves L1 fees even when L2 gas alone is affordable", async () => {
    const rpc = rpcFixture(); rpc.balance.mockResolvedValue(10n ** 18n + 2520000n);
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow(/Insufficient/);
    await expect(prepareSend(intent, rpcFixture(), { ...config, maxTotalFeeWei: 2520000n }, now)).rejects.toThrow(/total fee/);
  });
  it("rejects pending nonces and a stale head", async () => {
    const rpc = rpcFixture(); rpc.nonce.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow(/pending/);
    await expect(checkBaseRpc(rpcFixture(), config, now + 31000)).rejects.toThrow(/stale/);
  });
  it("simulates contract recipients instead of assuming 21000 gas", async () => {
    const rpc = rpcFixture(); rpc.call.mockRejectedValue(new Error("receive reverted"));
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow(/receive/);
  });
});

describe("Base durable sends", () => {
  it("persists before broadcast and resumes the identical envelope after a timeout", async () => {
    const f = await fixture();
    let raw: Hex | undefined;
    f.rpc.broadcast.mockImplementation(async tx => {
      const state = parseJournalJson(await readFile(join(f.directory, `8453-${account.address.toLowerCase()}.json`), "utf8"));
      expect(state.records[0].raw).toBe(tx); raw = tx; throw new Error("timeout");
    });
    expect((await f.executor.execute(intent)).status).toBe("unknown");
    f.rpc.broadcast.mockImplementation(async tx => { expect(tx).toBe(raw); return keccak256(tx); });
    expect((await f.executor.execute(intent)).status).toBe("submitted");
    expect(f.signer.signTransaction).toHaveBeenCalledTimes(1);
  });
  it("rejects reuse with another amount and unresolved concurrent sends", async () => {
    const f = await fixture(); await f.executor.execute(intent);
    await expect(f.executor.execute({ ...intent, amount: "2" })).rejects.toThrow(/Idempotency/);
    await expect(f.executor.execute({ ...intent, requestId: "base-request-2" })).rejects.toThrow(/unfinished/);
  });
  it("checks signer ownership and the signed chain", async () => {
    const f = await fixture();
    await expect(f.executor.execute({ ...intent, from: recipient, recipient: account.address })).rejects.toThrow(/own/);
    const p = await prepareSend(intent, f.rpc, config, now);
    const raw = await account.signTransaction({ ...p.transaction, chainId: 5042 });
    await expect(verifySignedSend(raw, p.transaction, account.address)).rejects.toThrow(/authorized/);
  });
  it("quarantines a signed proposal if extra fees exceed its reserve", async () => {
    const f = await fixture();
    f.rpc.extraFees.mockResolvedValueOnce({ l1FeeUpperBoundWei: 1000n, operatorFeeWei: 0n }).mockResolvedValue({ l1FeeUpperBoundWei: 999999n, operatorFeeWei: 0n });
    expect((await f.executor.execute(intent)).status).toBe("reconciliation_required");
    expect(f.rpc.broadcast).not.toHaveBeenCalled();
    await expect(cancelUnsignedBaseSend(f.journal, account.address, intent.requestId)).rejects.toThrow(/signed/);
  });
  it("lets operators cancel an unsigned failure", async () => {
    const f = await fixture(); f.rpc.balance.mockResolvedValue(0n);
    await expect(f.executor.execute(intent)).rejects.toThrow();
    expect((await cancelUnsignedBaseSend(f.journal, account.address, intent.requestId)).status).toBe("cancelled");
  });
  it("blocks concurrent workers with a per-chain wallet lock", async () => {
    const f = await fixture();
    await f.journal.withWallet(account.address, async () => {
      await expect(f.executor.execute(intent)).rejects.toThrow(/locked/);
    });
    expect(f.signer.signTransaction).not.toHaveBeenCalled();
  });
  it("quarantines an externally consumed nonce without resubmitting", async () => {
    const f = await fixture(); await f.executor.execute(intent);
    f.rpc.nonce.mockResolvedValue(1);
    expect((await f.executor.execute(intent)).status).toBe("reconciliation_required");
    expect(f.rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("does not broadcast when persistence fails", async () => {
    const f = await fixture();
    const executor = new BaseSendExecutor(f.rpc, config, { withWallet: async (_wallet, action) => action({ version: 1, records: [] }, async () => { throw new Error("disk failed"); }) }, f.signer, () => now);
    await expect(executor.execute(intent)).rejects.toThrow(/disk/);
    expect(f.rpc.broadcast).not.toHaveBeenCalled();
  });
  it("does not rebroadcast when receipt lookup fails", async () => {
    const f = await fixture(); await f.executor.execute(intent);
    f.rpc.receipt.mockRejectedValue(new Error("offline"));
    await expect(f.executor.execute(intent)).rejects.toThrow(/offline/);
    expect(f.rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("reports reverted execution without a replacement send", async () => {
    const f = await fixture(); const sent = await f.executor.execute(intent);
    f.rpc.receipt.mockResolvedValue({ hash: sent.hash!, status: "reverted", blockNumber: 100n, blockHash: hash, gasUsed: 21000n, effectiveGasPrice: 1n });
    expect((await f.executor.execute(intent)).status).toBe("reverted");
    expect(f.rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("rejects tampered fee reserves before accepting a cached record", async () => {
    const f = await fixture(); await f.executor.execute(intent);
    const file = join(f.directory, `8453-${account.address.toLowerCase()}.json`);
    const state = parseJournalJson(await readFile(file, "utf8")); state.records[0].prepared!.gasReserveWei += 1n;
    await writeFile(file, journalJson(state));
    await expect(f.executor.execute(intent)).rejects.toThrow(/proposal/);
  });
  it("reports mined separately from finality and never authorizes OTC payout", async () => {
    const f = await fixture(); const sent = await f.executor.execute(intent);
    const receipt: BaseReceipt = { hash: sent.hash!, status: "success", blockNumber: 100n, blockHash: hash, gasUsed: 21000n, effectiveGasPrice: 50n, l1Fee: 321n };
    f.rpc.receipt.mockResolvedValue(receipt);
    const result = await inspectBaseSend(f.rpc, config, f.journal, account.address, intent.requestId, now);
    expect(result.status).toBe("mined"); expect(result.finality).toEqual({ safe: false, finalized: false });
    expect(result.l1FeeWei).toBe(321n); expect(result.otcPayoutAuthorized).toBe(false);
    f.rpc.settlementBlock.mockResolvedValue({ number: 100n, hash, timestamp: BigInt(now / 1000) });
    expect((await baseReceiptFinality(f.rpc, receipt)).finalized).toBe(true);
    f.rpc.settlementBlock.mockRejectedValue(new Error("unsupported"));
    expect((await baseReceiptFinality(f.rpc, receipt)).finalized).toBeNull();
    f.rpc.receipt.mockResolvedValue(null);
    await expect(f.executor.execute(intent)).rejects.toThrow(/Previously/);
  });
});
