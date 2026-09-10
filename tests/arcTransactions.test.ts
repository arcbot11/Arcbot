import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, keccak256, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_USDC, arcConfig, arcConfigFromEnv } from "../lib/arc/config.ts";
import { exactAmount, reserveGas, usdcBalance, UINT256_MAX } from "../lib/arc/amounts.ts";
import { prepareSend, type ArcTransaction } from "../lib/arc/transfers.ts";
import { ArcSendExecutor, verifySignedSend, inspectArcSend, cancelUnsignedArcSend } from "../lib/arc/execution.ts";
import { FileArcJournal, parseJournalJson, journalJson, type WalletJournal } from "../lib/arc/journal.ts";
import { parseArcManageArgs } from "../lib/arc/manage-args.ts";
import { checkArcRpc, type ArcRpc } from "../lib/arc/rpc.ts";
import { localArcSigner } from "../lib/arc/local-signer.ts";

// Public deterministic fixture account, never funded or used for network calls.
const account = privateKeyToAccount(`0x${"1".padStart(64, "0")}`);
const recipient = "0x2222222222222222222222222222222222222222" as const;
const token = "0x3333333333333333333333333333333333333333" as const;
const blockHash = `0x${"a".repeat(64)}` as Hex;
const now = 1_800_000_000_000;
const config = arcConfig({ rpcUrl: "https://arc-rpc.example", checkpointNumber: "1", checkpointHash: blockHash });
const intent = { chainId: 5042, operation: "send", from: account.address, recipient, asset: "native", amount: "1", requestId: "request-0001" };
const success = `0x${"0".repeat(63)}1` as Hex;
function rpcFixture() {
  return {
    chainId: vi.fn(async () => 5042),
    block: vi.fn(async (number?: bigint) => ({ number: number ?? 100n, hash: blockHash, timestamp: BigInt(now / 1000) })),
    balance: vi.fn(async () => 10n ** 20n), code: vi.fn(async () => "0x6000" as Hex),
    decimals: vi.fn(async () => 6), tokenBalance: vi.fn(async () => 10n ** 10n),
    call: vi.fn(async () => success), estimateGas: vi.fn(async () => 21_000n),
    fees: vi.fn(async () => ({ maxFeePerGas: 100n, maxPriorityFeePerGas: 1n })),
    nonce: vi.fn(async () => 0), broadcast: vi.fn(async (raw: Hex) => keccak256(raw)),
    receipt: vi.fn<ArcRpc["receipt"]>(async () => null),
  } satisfies ArcRpc;
}
const directories: string[] = [];
async function journal() {
  const directory = await mkdtemp(join(tmpdir(), "arc-send-test-")); directories.push(directory);
  return { directory, store: new FileArcJournal(directory) };
}
afterEach(async () => { await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

describe("Arc amounts and network identity", () => {
  it.each(["1e6", "-1", "+1", "01", "1,000", "NaN", "0", "1.0000001"])("rejects ambiguous or inexact six-decimal amount %s", (value) => {
    expect(() => exactAmount(value, 6)).toThrow();
  });
  it("preserves integer precision, native dust, and uint256 boundaries", () => {
    expect(exactAmount("1.234567", 6)).toBe(1_234_567n);
    expect(exactAmount("0.000000000000000001", 18)).toBe(1n);
    expect(exactAmount(UINT256_MAX.toString(), 0)).toBe(UINT256_MAX);
    expect(() => exactAmount((UINT256_MAX + 1n).toString(), 0)).toThrow();
    expect(usdcBalance(1_234_567_000_000_000_001n)).toEqual({ nativeWei: 1_234_567_000_000_000_001n, erc20Units: 1_234_567n, dustWei: 1n });
    expect(() => reserveGas(100n, 50n, 10n, 3n, 21n)).toThrow();
  });
  it("never inherits an old provider or a testnet default", () => {
    expect(() => arcConfigFromEnv({ LEGACY_NETWORK_RPC_URL: "https://example.com" })).toThrow(/Configure/);
    expect(() => arcConfig({ ...config, rpcUrl: "http://example.com" })).toThrow();
  });
  it.each([1, 4663, 5042002])("rejects chain %s", async (chain) => {
    const rpc = rpcFixture(); rpc.chainId.mockResolvedValue(chain);
    await expect(checkArcRpc(rpc, config, now)).rejects.toThrow(/5042/);
    expect(rpc.block).not.toHaveBeenCalled();
  });
  it("rejects a matching chain ID with the wrong checkpoint", async () => {
    await expect(checkArcRpc(rpcFixture(), { ...config, checkpointHash: `0x${"b".repeat(64)}` }, now)).rejects.toThrow(/checkpoint/);
  });
  it.each([-31, 6])("rejects stale or future timestamps (%s seconds)", async (offset) => {
    const rpc = rpcFixture(); rpc.block.mockImplementation(async (number) => ({ number: number ?? 100n, hash: blockHash, timestamp: BigInt(now / 1000 + offset) }));
    await expect(checkArcRpc(rpc, config, now)).rejects.toThrow(/stale/);
  });
});

describe("Arc transfer preparation", () => {
  it("builds native USDC with 18 decimals, exact recipient, and a gas reserve", async () => {
    const rpc = rpcFixture();
    const plan = await prepareSend(intent, rpc, config, now);
    expect(plan.transaction).toMatchObject({ chainId: 5042, to: recipient, data: "0x", value: 10n ** 18n, gas: 25_200n });
    expect(plan.gasReserveWei).toBe(2_520_000n);
    expect(rpc.decimals).not.toHaveBeenCalled();
    expect(rpc.call).toHaveBeenCalledWith({ from: account.address, to: recipient, data: "0x", value: 10n ** 18n }, 100n);
  });
  it("builds arbitrary ERC-20 transfers without launchpad lookup", async () => {
    const plan = await prepareSend({ ...intent, asset: token, amount: "2.123456" }, rpcFixture(), config, now);
    expect(plan.transaction.value).toBe(0n);
    expect(plan.transaction.to).toBe(token);
    expect(decodeFunctionData({ abi: parseAbi(["function transfer(address,uint256) returns (bool)"]), data: plan.transaction.data }).args).toEqual([recipient, 2_123_456n]);
    expect(plan.delivery).toBe("token-contract-defined");
  });
  it("does not double count ERC-20 USDC when reserving gas", async () => {
    const rpc = rpcFixture(); rpc.balance.mockResolvedValue(10n ** 18n);
    await expect(prepareSend({ ...intent, asset: ARC_USDC }, rpc, config, now)).rejects.toThrow(/USDC/);
    rpc.balance.mockResolvedValue(10n ** 18n + 2_520_000n);
    expect((await prepareSend({ ...intent, asset: ARC_USDC }, rpc, config, now)).amountUnits).toBe(1_000_000n);
  });
  it("does not require a boolean result from old empty-return tokens", async () => {
    const rpc = rpcFixture(); rpc.call.mockResolvedValue("0x");
    await expect(prepareSend({ ...intent, asset: token }, rpc, config, now)).resolves.toHaveProperty("transaction");
  });
  it.each([`0x${"0".repeat(64)}`, "0x01", `0x${"0".repeat(63)}2`])("rejects unsuccessful token return data %s", async (result) => {
    const rpc = rpcFixture(); rpc.call.mockResolvedValue(result as Hex);
    await expect(prepareSend({ ...intent, asset: token }, rpc, config, now)).rejects.toThrow(/false or malformed/);
  });
  it("propagates transfer reverts without estimating, signing or submitting", async () => {
    const rpc = rpcFixture(); rpc.call.mockRejectedValue(new Error("blocklisted"));
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow("blocklisted");
    expect(rpc.estimateGas).not.toHaveBeenCalled(); expect(rpc.broadcast).not.toHaveBeenCalled();
  });
  it("rejects missing code and unavailable metadata", async () => {
    const rpc = rpcFixture(); rpc.code.mockResolvedValue("0x");
    await expect(prepareSend({ ...intent, asset: token }, rpc, config, now)).rejects.toThrow(/no contract/);
    rpc.code.mockResolvedValue("0x6000"); rpc.decimals.mockRejectedValue(new Error("unavailable"));
    await expect(prepareSend({ ...intent, asset: token }, rpc, config, now)).rejects.toThrow("unavailable");
  });
  it("rejects incorrect USDC decimals, gas policy violations, and pending nonces", async () => {
    const rpc = rpcFixture(); rpc.decimals.mockResolvedValue(18);
    await expect(prepareSend({ ...intent, asset: ARC_USDC }, rpc, config, now)).rejects.toThrow(/USDC decimals/);
    rpc.estimateGas.mockResolvedValue(1_000_000n);
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow(/policy/);
    rpc.estimateGas.mockResolvedValue(21_000n); rpc.nonce.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(prepareSend(intent, rpc, config, now)).rejects.toThrow(/pending/);
  });
  it.each([{ recipient: "0x0000000000000000000000000000000000000000" }, { recipient: account.address }, { asset: "USDC" }, { chainId: 5042002 }])("rejects unsafe or ambiguous intent %j", async (change) => {
    const rpc = rpcFixture(); await expect(prepareSend({ ...intent, ...change }, rpc, config, now)).rejects.toThrow();
    expect(rpc.chainId).not.toHaveBeenCalled();
  });
});

describe("Arc signed-envelope persistence and recovery", () => {
  function signer() { return { address: account.address, signTransaction: vi.fn((tx: ArcTransaction) => account.signTransaction(tx)) }; }
  it("requires isolated signer credentials and signs the prepared transaction locally", async () => {
    expect(() => localArcSigner({ PRIVATE_KEY: `0x${"1".repeat(64)}` })).toThrow(/dedicated/);
    const local = localArcSigner({ ARC_SIGNER_PRIVATE_KEY: `0x${"1".padStart(64, "0")}` });
    const prepared = await prepareSend(intent, rpcFixture(), config, now);
    const raw = await local.signTransaction(prepared.transaction);
    expect(await verifySignedSend(raw, prepared.transaction, account.address)).toBe(keccak256(raw));
  });
  it("persists the signed envelope before broadcast and recovers it after a timeout/restart", async () => {
    const { store, directory } = await journal(); const rpc = rpcFixture(); const signing = signer();
    let rawBeforeBroadcast: Hex | undefined;
    rpc.broadcast.mockImplementationOnce(async (raw) => {
      const file = (await readdir(directory)).find((f) => f.endsWith(".json"))!;
      const persisted = parseJournalJson(await readFile(join(directory, file), "utf8"));
      expect(persisted.records[0]).toMatchObject({ raw, hash: keccak256(raw), status: "unknown" });
      rawBeforeBroadcast = raw; throw new Error("accepted then connection lost");
    });
    const executor = new ArcSendExecutor(rpc, config, store, signing, () => now);
    const initial = await executor.execute(intent);
    expect(initial.status).toBe("unknown"); expect(initial).not.toHaveProperty("raw");
    const resumed = new ArcSendExecutor(rpc, config, new FileArcJournal(directory), signing, () => now + 5_000);
    const retried = await resumed.execute({ ...intent, amount: "1.0" });
    expect(retried.hash).toBe(initial.hash); expect(retried.status).toBe("submitted");
    expect(rpc.broadcast.mock.calls[1][0]).toBe(rawBeforeBroadcast);
    expect(signing.signTransaction).toHaveBeenCalledTimes(1);
    rpc.receipt.mockResolvedValue({ hash: initial.hash!, status: "success", blockNumber: 100n, blockHash, gasUsed: 21_000n, effectiveGasPrice: 80n });
    expect((await resumed.execute(intent)).status).toBe("mined");
    expect((await resumed.execute(intent)).status).toBe("mined");
    expect(rpc.broadcast).toHaveBeenCalledTimes(2);
  });
  it("rejects a changed recipient for an existing request and another unresolved send", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); const executor = new ArcSendExecutor(rpc, config, store, signer(), () => now);
    await executor.execute(intent);
    await expect(executor.execute({ ...intent, recipient: token })).rejects.toThrow(/Idempotency/);
    await expect(executor.execute({ ...intent, requestId: "request-0002" })).rejects.toThrow(/unfinished/);
    expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("quarantines a consumed nonce instead of creating another spend", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); const signing = signer();
    const executor = new ArcSendExecutor(rpc, config, store, signing, () => now);
    await executor.execute(intent); rpc.nonce.mockResolvedValue(1);
    expect((await executor.execute(intent)).status).toBe("reconciliation_required");
    expect(signing.signTransaction).toHaveBeenCalledTimes(1); expect(rpc.broadcast).toHaveBeenCalledTimes(1);
    await expect(executor.cancelUnsigned(intent.requestId)).rejects.toThrow(/cannot be cancelled/);
  });
  it("does not rebroadcast when receipt lookup is unavailable", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); const executor = new ArcSendExecutor(rpc, config, store, signer(), () => now);
    await executor.execute(intent); rpc.receipt.mockRejectedValue(new Error("quota"));
    await expect(executor.execute(intent)).rejects.toThrow("quota"); expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("records reverted execution without claiming token delivery or retrying", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); const executor = new ArcSendExecutor(rpc, config, store, signer(), () => now);
    const first = await executor.execute(intent);
    rpc.receipt.mockResolvedValue({ hash: first.hash!, status: "reverted", blockNumber: 100n, blockHash, gasUsed: 21_000n, effectiveGasPrice: 80n });
    expect(await executor.execute(intent)).toMatchObject({ status: "reverted", deliveryVerified: false });
    expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("rejects a signer that changes chain, recipient, amount, nonce, fees, calldata or account", async () => {
    const plan = await prepareSend(intent, rpcFixture(), config, now);
    for (const change of [{ chainId: 1 }, { to: token }, { value: 1n }, { nonce: 1 }, { maxFeePerGas: 101n }, { data: "0x1234" as Hex }]) {
      const raw = await account.signTransaction({ ...plan.transaction, ...change });
      await expect(verifySignedSend(raw, plan.transaction, account.address)).rejects.toThrow(/does not match/);
    }
    const other = privateKeyToAccount(`0x${"2".padStart(64, "0")}`);
    await expect(verifySignedSend(await other.signTransaction(plan.transaction), plan.transaction, account.address)).rejects.toThrow(/does not match/);
  });
  it("allows cancellation of an unsigned failed preflight and then a new request", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); rpc.call.mockRejectedValueOnce(new Error("revert"));
    const signing = signer(); const executor = new ArcSendExecutor(rpc, config, store, signing, () => now);
    await expect(executor.execute(intent)).rejects.toThrow("revert");
    expect((await executor.cancelUnsigned(intent.requestId)).status).toBe("cancelled");
    expect((await executor.execute({ ...intent, requestId: "request-0002" })).status).toBe("submitted");
    expect(signing.signTransaction).toHaveBeenCalledTimes(1);
  });
  it("serializes the same wallet across independent journal instances", async () => {
    const { store, directory } = await journal();
    await store.withWallet(account.address, async () => {
      await expect(new FileArcJournal(directory).withWallet(account.address, async () => undefined)).rejects.toThrow(/locked/);
    });
    await expect(store.withWallet(account.address, async () => "released")).resolves.toBe("released");
  });
  it("never sends if durable persistence fails", async () => {
    const rpc = rpcFixture(); const signing = signer();
    const executor = new ArcSendExecutor(rpc, config, { withWallet: async (_wallet, action) => action({ version: 1, records: [] }, async () => { throw new Error("disk full"); }) }, signing, () => now);
    await expect(executor.execute(intent)).rejects.toThrow("disk full");
    expect(signing.signTransaction).not.toHaveBeenCalled(); expect(rpc.broadcast).not.toHaveBeenCalled();
  });
  it("never broadcasts if persisting the signed envelope fails", async () => {
    const rpc = rpcFixture(); const signing = signer(); let saves = 0;
    const executor = new ArcSendExecutor(rpc, config, { withWallet: async (_wallet, action) => action({ version: 1, records: [] }, async () => {
      saves += 1; if (saves === 3) throw new Error("disk full at signed envelope");
    }) }, signing, () => now);
    await expect(executor.execute(intent)).rejects.toThrow("disk full at signed envelope");
    expect(signing.signTransaction).toHaveBeenCalledTimes(1); expect(rpc.broadcast).not.toHaveBeenCalled();
  });
  it("quarantines a proposal that expires while the signer is working", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); let clock = now;
    rpc.block.mockImplementation(async (number) => ({ number: number ?? 100n, hash: blockHash, timestamp: BigInt(clock / 1000) }));
    const slowSigner = { address: account.address, signTransaction: async (tx: ArcTransaction) => {
      const raw = await account.signTransaction(tx); clock += 31_000; return raw;
    } };
    const executor = new ArcSendExecutor(rpc, config, store, slowSigner, () => clock);
    expect((await executor.execute(intent)).status).toBe("reconciliation_required");
    expect(rpc.broadcast).not.toHaveBeenCalled();
  });
  it("rejects a receipt from a different canonical block", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); const executor = new ArcSendExecutor(rpc, config, store, signer(), () => now);
    const first = await executor.execute(intent);
    rpc.receipt.mockResolvedValue({ hash: first.hash!, status: "success", blockNumber: 100n, blockHash: `0x${"b".repeat(64)}`, gasUsed: 21_000n, effectiveGasPrice: 80n });
    await expect(executor.execute(intent)).rejects.toThrow(/canonical/);
    expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
});

describe("Arc operator status and journal integrity", () => {
  async function submitted() {
    const { store, directory } = await journal();
    const rpc = rpcFixture();
    const signing = { address: account.address, signTransaction: vi.fn((tx: ArcTransaction) => account.signTransaction(tx)) };
    const executor = new ArcSendExecutor(rpc, config, store, signing, () => now);
    const result = await executor.execute(intent);
    const file = join(directory, (await readdir(directory)).find((f) => f.endsWith(".json"))!);
    return { store, rpc, signing, executor, result, file };
  }
  it("checks pending and mined status without signing or rebroadcasting", async () => {
    const { store, rpc, signing, result } = await submitted();
    expect((await inspectArcSend(rpc, config, store, account.address, intent.requestId, now)).status).toBe("submitted");
    rpc.receipt.mockResolvedValue({ hash: result.hash!, status: "success", blockNumber: 100n, blockHash, gasUsed: 21_000n, effectiveGasPrice: 80n });
    const status = await inspectArcSend(rpc, config, store, account.address, intent.requestId, now);
    expect(status).toMatchObject({ status: "mined", gasPaidWei: 1_680_000n, deliveryVerified: false });
    expect(status).not.toHaveProperty("raw"); expect(status).not.toHaveProperty("prepared");
    expect(signing.signTransaction).toHaveBeenCalledTimes(1); expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("retains an uncertain result until a receipt exists", async () => {
    const { store } = await journal(); const rpc = rpcFixture();
    rpc.broadcast.mockRejectedValue(new Error("timeout after submission"));
    const executor = new ArcSendExecutor(rpc, config, store, { address: account.address, signTransaction: (tx) => account.signTransaction(tx) }, () => now);
    await executor.execute(intent);
    expect((await inspectArcSend(rpc, config, store, account.address, intent.requestId, now)).status).toBe("unknown");
    expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("rejects a provider nonce already used by a completed journal entry", async () => {
    const { store, rpc, signing, executor, result } = await submitted();
    rpc.receipt.mockResolvedValueOnce({ hash: result.hash!, status: "success", blockNumber: 100n, blockHash, gasUsed: 21_000n, effectiveGasPrice: 80n });
    await inspectArcSend(rpc, config, store, account.address, intent.requestId, now);
    const second = { ...intent, requestId: "request-0002" };
    await expect(executor.execute(second)).rejects.toThrow(/already reserved/);
    expect(signing.signTransaction).toHaveBeenCalledTimes(1);
    rpc.nonce.mockResolvedValue(1);
    expect((await executor.execute(second)).status).toBe("submitted");
    expect(signing.signTransaction).toHaveBeenCalledTimes(2);
  });
  it("detects a disappeared recorded receipt during status inspection", async () => {
    const { store, rpc, result } = await submitted();
    rpc.receipt.mockResolvedValueOnce({ hash: result.hash!, status: "success", blockNumber: 100n, blockHash, gasUsed: 21_000n, effectiveGasPrice: 80n });
    await inspectArcSend(rpc, config, store, account.address, intent.requestId, now);
    await expect(inspectArcSend(rpc, config, store, account.address, intent.requestId, now)).rejects.toThrow(/receipt is unavailable/);
    expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("cancels an unsigned failed proposal without a signer or RPC", async () => {
    const { store } = await journal(); const rpc = rpcFixture(); rpc.call.mockRejectedValue(new Error("simulation failed"));
    const signing = { address: account.address, signTransaction: vi.fn((tx: ArcTransaction) => account.signTransaction(tx)) };
    await expect(new ArcSendExecutor(rpc, config, store, signing, () => now).execute(intent)).rejects.toThrow();
    expect((await cancelUnsignedArcSend(store, account.address, intent.requestId)).status).toBe("cancelled");
    rpc.chainId.mockClear();
    expect((await inspectArcSend(rpc, config, store, account.address, intent.requestId, now)).status).toBe("cancelled");
    expect(rpc.chainId).not.toHaveBeenCalled(); expect(signing.signTransaction).not.toHaveBeenCalled();
  });
  it.each([
    ["missing envelope", (j: WalletJournal) => { delete j.records[0].raw; }],
    ["missing hash", (j: WalletJournal) => { delete j.records[0].hash; }],
    ["duplicate request", (j: WalletJournal) => { j.records.push(structuredClone(j.records[0])); }],
    ["wrong wallet", (j: WalletJournal) => { j.records[0].intent.from = recipient; }],
    ["changed recipient", (j: WalletJournal) => { j.records[0].prepared!.transaction.to = token; }],
    ["changed amount", (j: WalletJournal) => { j.records[0].prepared!.amountUnits += 1n; }],
    ["wrong decimals", (j: WalletJournal) => { j.records[0].prepared!.decimals = 6; }],
    ["missing receipt", (j: WalletJournal) => { j.records[0].status = "mined"; }],
    ["wrong gas reservation", (j: WalletJournal) => { j.records[0].prepared!.gasReserveWei = 0n; }],
    ["extra calldata", (j: WalletJournal) => { j.records[0].prepared!.transaction.data = "0x1234"; }],
  ] as const)("rejects %s before executing or cancelling", async (_name, corrupt) => {
    const { store, executor, rpc, signing, file } = await submitted();
    const persisted = parseJournalJson(await readFile(file, "utf8")); corrupt(persisted);
    await writeFile(file, journalJson(persisted));
    const damaged = await readFile(file, "utf8");
    await expect(executor.execute(intent)).rejects.toThrow();
    await expect(inspectArcSend(rpc, config, store, account.address, intent.requestId, now)).rejects.toThrow();
    await expect(cancelUnsignedArcSend(store, account.address, intent.requestId)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(damaged);
    expect(rpc.broadcast).toHaveBeenCalledTimes(1); expect(signing.signTransaction).toHaveBeenCalledTimes(1);
  });
  it("never cancels a signed request through the operator function", async () => {
    const { store, rpc } = await submitted();
    await expect(cancelUnsignedArcSend(store, account.address, intent.requestId)).rejects.toThrow(/cannot be cancelled/);
    expect(rpc.broadcast).toHaveBeenCalledTimes(1);
  });
  it("validates management arguments without accepting paths as request IDs", () => {
    expect(parseArcManageArgs(["status", "--wallet", account.address, "--request", intent.requestId])).toMatchObject({ mode: "status", requestId: intent.requestId });
    for (const args of [[], ["status"], ["status", "--wallet", account.address, "--request", "../wallet"],
      ["send", "--wallet", account.address, "--request", intent.requestId],
      ["status", "--wallet", "USDC", "--request", intent.requestId]]) {
      expect(() => parseArcManageArgs(args)).toThrow();
    }
  });
});
