import { assertOutsideOtcWallet } from "../otc/spend-guard.ts";
import { getAddress, keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex } from "viem";
import type { BaseConfig } from "./config.ts";
import { validateWalletJournal, type BaseJournal, type SendRecord } from "./journal.ts";
import { baseReceiptFinality, checkBaseRpc, type BaseRpc } from "./rpc.ts";
import { prepareSend, sendIntent, sendDigest, type BaseTransaction } from "./transfers.ts";
export { sendDigest } from "./transfers.ts";

/** Must sign only: broadcasting here would bypass persistence-before-submission. */
export interface BaseSigner { address: Address; signTransaction(tx: BaseTransaction): Promise<Hex> }
const terminal = (record: SendRecord) => record.status === "mined" || record.status === "reverted" || record.status === "cancelled";

export async function verifySignedSend(raw: Hex, expected: BaseTransaction, owner: Address) {
  if (!/^0x02(?:[0-9a-fA-F]{2})+$/.test(raw)) throw new Error("Expected a signed EIP-1559 Base transaction");
  const tx = parseTransaction(raw);
  if (tx.type !== "eip1559" || tx.chainId !== expected.chainId || tx.to?.toLowerCase() !== expected.to.toLowerCase()
    || (tx.data ?? "0x") !== expected.data || (tx.value ?? 0n) !== expected.value || (tx.nonce ?? 0) !== expected.nonce
    || tx.gas !== expected.gas || tx.maxFeePerGas !== expected.maxFeePerGas || tx.maxPriorityFeePerGas !== expected.maxPriorityFeePerGas
    || (tx.accessList?.length ?? 0) !== 0
    || (await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Signed transaction does not match the authorized Base send");
  }
  return keccak256(raw);
}

function publicStatus(record: SendRecord) {
  // Never expose raw signatures or the private journal through an application API.
  return { requestId: record.intent.requestId, status: record.status, hash: record.hash,
    chainId: 8453, asset: "ETH", receipt: record.receipt,
    l2ExecutionFeeWei: record.receipt ? record.receipt.gasUsed * record.receipt.effectiveGasPrice : undefined,
    l1FeeWei: record.receipt?.l1Fee, totalFeeVerified: false, deliveryVerified: false, otcPayoutAuthorized: false };
}

/** Read chain state and update the journal. Never signs or submits. */
async function reconcileRecord(record: SendRecord, rpc: BaseRpc, config: BaseConfig, save: () => Promise<void>, now: number) {
  if (!record.raw || !record.hash || !record.prepared) throw new Error("Incomplete signed Base journal");
  if (await verifySignedSend(record.raw, record.prepared.transaction, record.intent.from) !== record.hash) throw new Error("Base journal hash mismatch");
  const head = await checkBaseRpc(rpc, config, now);
  const receipt = await rpc.receipt(record.hash);
  if (receipt) {
    if (receipt.hash !== record.hash || receipt.blockNumber > head.number || (await rpc.block(receipt.blockNumber)).hash !== receipt.blockHash) throw new Error("Base receipt is not on the observed canonical chain");
    record.receipt = receipt;
    record.status = receipt.status === "success" ? "mined" : "reverted";
    await save();
    return;
  }
  if (record.receipt) throw new Error("Previously recorded Base receipt is unavailable; reconcile provider state");
  const nonce = await rpc.nonce(record.intent.from, false);
  if (!Number.isSafeInteger(nonce) || nonce < record.prepared.transaction.nonce) throw new Error("Base nonce moved backwards; reconcile provider state");
  if (nonce > record.prepared.transaction.nonce || (record.status === "signed" && now >= record.prepared.expiresAt)) {
    record.status = "reconciliation_required";
    await save();
  }
}

export async function inspectBaseSend(rpc: BaseRpc, config: BaseConfig, journal: BaseJournal, wallet: Address, requestId: string, now = Date.now()) {
  const owner = getAddress(wallet);
  return journal.withWallet(owner, async (state, save) => {
    validateWalletJournal(state, owner);
    const record = state.records.find((item) => item.intent.requestId === requestId);
    if (!record) throw new Error("Unknown Base request");
    if (record.raw) await reconcileRecord(record, rpc, config, save, now);
    return { ...publicStatus(record), finality: record.receipt ? await baseReceiptFinality(rpc, record.receipt) : { safe: null, finalized: null } };
  });
}

/** Local operator mutation. Signed requests cannot be cancelled this way. */
export async function cancelUnsignedBaseSend(journal: BaseJournal, wallet: Address, requestId: string) {
  const owner = getAddress(wallet);
  return journal.withWallet(owner, async (state, save) => {
    validateWalletJournal(state, owner);
    const record = state.records.find((item) => item.intent.requestId === requestId);
    if (!record) throw new Error("Unknown Base request");
    if (record.raw || !["created", "prepared", "cancelled"].includes(record.status)) throw new Error("A signed Base send cannot be cancelled by changing its journal status");
    record.status = "cancelled";
    await save();
    return publicStatus(record);
  });
}

export class BaseSendExecutor {
  private readonly rpc: BaseRpc;
  private readonly config: BaseConfig;
  private readonly journal: BaseJournal;
  private readonly signer: BaseSigner;
  private readonly now: () => number;
  constructor(rpc: BaseRpc, config: BaseConfig, journal: BaseJournal, signer: BaseSigner, now: () => number = Date.now) {
    this.rpc = rpc; this.config = config; this.journal = journal; this.signer = signer; this.now = now;
  }

  async cancelUnsigned(requestId: string) {
    return cancelUnsignedBaseSend(this.journal, this.signer.address, requestId);
  }

  /** Internal operator API. A future web/Convex adapter must authorize wallet ownership first. */
  async execute(input: unknown) {
    const intent = sendIntent.parse(input);
    await assertOutsideOtcWallet(intent.from, 8453);
    if (this.signer.address.toLowerCase() !== intent.from.toLowerCase()) throw new Error("Base signer does not own the requested wallet");
    return this.journal.withWallet(intent.from, async (journal, save) => {
      validateWalletJournal(journal, intent.from);
      const digest = sendDigest(intent);
      let record = journal.records.find((r) => r.intent.requestId === intent.requestId);
      if (record && record.digest !== digest) throw new Error("Idempotency key was already used for a different send");
      if (record && terminal(record)) {
        if (record.raw) await reconcileRecord(record, this.rpc, this.config, save, this.now());
        return publicStatus(record);
      }
      if (journal.records.some((r) => r !== record && !terminal(r))) throw new Error("Resolve the wallet's unfinished Base send first");
      if (!record) {
        record = { intent, digest, status: "created" };
        journal.records.push(record);
        await save();
      }
      if (record.raw) return this.resume(record, save);
      // Unsigned proposals may be refreshed. Signed envelopes must never be regenerated.
      record.prepared = await prepareSend(intent, this.rpc, this.config, this.now());
      if (journal.records.some((previous) => previous !== record && previous.raw && previous.prepared
        && previous.prepared.transaction.nonce >= record.prepared!.transaction.nonce)) {
        throw new Error("Base nonce was already reserved. Reconcile provider state before signing");
      }
      record.status = "prepared";
      await save();
      if (this.now() >= record.prepared.expiresAt) throw new Error("Base send proposal expired before signing");
      const raw = await this.signer.signTransaction(record.prepared.transaction);
      const hash = await verifySignedSend(raw, record.prepared.transaction, intent.from);
      record.raw = raw;
      record.hash = hash;
      record.status = "signed";
      await save(); // The deterministic hash and envelope reach durable storage before any broadcast.
      return this.resume(record, save);
    });
  }

  private async resume(record: SendRecord, save: () => Promise<void>) {
    if (!record.raw || !record.hash || !record.prepared) throw new Error("Incomplete signed Base journal");
    await reconcileRecord(record, this.rpc, this.config, save, this.now());
    if (terminal(record) || record.status === "reconciliation_required") return publicStatus(record);
    // Expired signed-but-never-attempted proposals stay quarantined. Once attempted,
    // expiry cannot imply cancellation: reconcile or rebroadcast the exact same bytes.
    if (record.status === "signed" && this.now() >= record.prepared.expiresAt) {
      record.status = "reconciliation_required";
      await save();
      return publicStatus(record);
    }
    // Recheck total affordability and variable L1/operator fees before the first submission.
    // A signed request stays on disk if this fails; it must never be silently replaced.
    if (record.status === "signed") {
      const head = await checkBaseRpc(this.rpc, this.config, this.now());
      const extra = await this.rpc.extraFees(record.prepared.transaction, head.number);
      const p = record.prepared;
      if (extra.l1FeeUpperBoundWei < 0n || extra.operatorFeeWei < 0n
        || p.transaction.gas * p.transaction.maxFeePerGas + extra.l1FeeUpperBoundWei + extra.operatorFeeWei > p.gasReserveWei
        || p.gasReserveWei > this.config.maxTotalFeeWei
        || await this.rpc.balance(record.intent.from, head.number) < p.amountUnits + p.gasReserveWei
        || this.now() >= p.expiresAt) {
        record.status = "reconciliation_required";
        await save();
        return publicStatus(record);
      }
    }
    record.status = "unknown";
    await save();
    try {
      const hash = await this.rpc.broadcast(record.raw);
      if (hash !== record.hash) throw new Error("RPC returned a different transaction hash");
      record.status = "submitted";
    } catch { record.status = "unknown"; }
    await save();
    return publicStatus(record);
  }
}
