import { assertOutsideOtcWallet } from "../otc/spend-guard.ts";
import { getAddress, keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex } from "viem";
import type { ArcConfig } from "./config.ts";
import { validateWalletJournal, type ArcJournal, type SendRecord } from "./journal.ts";
import { checkArcRpc, type ArcRpc } from "./rpc.ts";
import { burnTransfer, prepareSend, sendIntent, sendDigest, type ArcTransaction } from "./transfers.ts";
export { sendDigest } from "./transfers.ts";

/** Must sign only: broadcasting here would bypass persistence-before-submission. */
export interface ArcSigner { address: Address; signTransaction(tx: ArcTransaction): Promise<Hex> }
const terminal = (record: SendRecord) => record.status === "mined" || record.status === "reverted" || record.status === "cancelled";

export async function verifySignedSend(raw: Hex, expected: ArcTransaction, owner: Address) {
  if (!/^0x02(?:[0-9a-fA-F]{2})+$/.test(raw)) throw new Error("Expected a signed EIP-1559 Arc transaction");
  const tx = parseTransaction(raw);
  if (tx.type !== "eip1559" || tx.chainId !== expected.chainId || tx.to?.toLowerCase() !== expected.to.toLowerCase()
    || (tx.data ?? "0x") !== expected.data || (tx.value ?? 0n) !== expected.value || (tx.nonce ?? 0) !== expected.nonce
    || tx.gas !== expected.gas || tx.maxFeePerGas !== expected.maxFeePerGas || tx.maxPriorityFeePerGas !== expected.maxPriorityFeePerGas
    || (tx.accessList?.length ?? 0) !== 0
    || (await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Signed transaction does not match the authorized Arc send");
  }
  return keccak256(raw);
}

function publicStatus(record: SendRecord) {
  // Never expose raw signatures or the private journal through an application API.
  return { requestId: record.intent.requestId, status: record.status, hash: record.hash,
    receipt: record.receipt, gasPaidWei: record.receipt ? record.receipt.gasUsed * record.receipt.effectiveGasPrice : undefined,
    deliveryVerified: false,
    ...(record.intent.operation === "burn" ? { operation: "burn", token: record.intent.asset, destination: record.intent.recipient, method: "dead-address-transfer", supplyReductionVerified: false } : {}) };
}

/** Read chain state and update the journal. Never signs or submits. */
async function reconcileRecord(record: SendRecord, rpc: ArcRpc, config: ArcConfig, save: () => Promise<void>, now: number) {
  if (!record.raw || !record.hash || !record.prepared) throw new Error("Incomplete signed Arc journal");
  if (await verifySignedSend(record.raw, record.prepared.transaction, record.intent.from) !== record.hash) throw new Error("Arc journal hash mismatch");
  const head = await checkArcRpc(rpc, config, now);
  const receipt = await rpc.receipt(record.hash);
  if (receipt) {
    if (receipt.hash !== record.hash || receipt.blockNumber > head.number || (await rpc.block(receipt.blockNumber)).hash !== receipt.blockHash) throw new Error("Arc receipt is not on the observed canonical chain");
    record.receipt = receipt;
    record.status = receipt.status === "success" ? "mined" : "reverted";
    await save();
    return;
  }
  if (record.receipt) throw new Error("Previously recorded Arc receipt is unavailable; reconcile provider state");
  const nonce = await rpc.nonce(record.intent.from, false);
  if (!Number.isSafeInteger(nonce) || nonce < record.prepared.transaction.nonce) throw new Error("Arc nonce moved backwards; reconcile provider state");
  if (nonce > record.prepared.transaction.nonce || (record.status === "signed" && now >= record.prepared.expiresAt)) {
    record.status = "reconciliation_required";
    await save();
  }
}

export async function inspectArcSend(rpc: ArcRpc, config: ArcConfig, journal: ArcJournal, wallet: Address, requestId: string, now = Date.now()) {
  const owner = getAddress(wallet);
  return journal.withWallet(owner, async (state, save) => {
    validateWalletJournal(state, owner);
    const record = state.records.find((item) => item.intent.requestId === requestId);
    if (!record) throw new Error("Unknown Arc request");
    if (record.raw) await reconcileRecord(record, rpc, config, save, now);
    return publicStatus(record);
  });
}

/** Local operator mutation. Signed requests cannot be cancelled this way. */
export async function cancelUnsignedArcSend(journal: ArcJournal, wallet: Address, requestId: string) {
  const owner = getAddress(wallet);
  return journal.withWallet(owner, async (state, save) => {
    validateWalletJournal(state, owner);
    const record = state.records.find((item) => item.intent.requestId === requestId);
    if (!record) throw new Error("Unknown Arc request");
    if (record.raw || !["created", "prepared", "cancelled"].includes(record.status)) throw new Error("A signed Arc send cannot be cancelled by changing its journal status");
    record.status = "cancelled";
    await save();
    return publicStatus(record);
  });
}

export class ArcSendExecutor {
  private readonly rpc: ArcRpc;
  private readonly config: ArcConfig;
  private readonly journal: ArcJournal;
  private readonly signer: ArcSigner;
  private readonly now: () => number;
  constructor(rpc: ArcRpc, config: ArcConfig, journal: ArcJournal, signer: ArcSigner, now: () => number = Date.now) {
    this.rpc = rpc; this.config = config; this.journal = journal; this.signer = signer; this.now = now;
  }

  async cancelUnsigned(requestId: string) {
    return cancelUnsignedArcSend(this.journal, this.signer.address, requestId);
  }

  async burn(input: unknown) {
    return this.execute(burnTransfer(input));
  }

  /** Internal operator API. A future web/Convex adapter must authorize wallet ownership first. */
  async execute(input: unknown) {
    const intent = sendIntent.parse(input);
    await assertOutsideOtcWallet(intent.from, 5042);
    if (this.signer.address.toLowerCase() !== intent.from.toLowerCase()) throw new Error("Arc signer does not own the requested wallet");
    return this.journal.withWallet(intent.from, async (journal, save) => {
      validateWalletJournal(journal, intent.from);
      const digest = sendDigest(intent);
      let record = journal.records.find((r) => r.intent.requestId === intent.requestId);
      if (record && record.digest !== digest) throw new Error("Idempotency key was already used for a different send");
      if (record && terminal(record)) return publicStatus(record);
      if (journal.records.some((r) => r !== record && !terminal(r))) throw new Error("Resolve the wallet's unfinished Arc send first");
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
        throw new Error("Arc nonce was already reserved. Reconcile provider state before signing");
      }
      record.status = "prepared";
      await save();
      if (this.now() >= record.prepared.expiresAt) throw new Error("Arc send proposal expired before signing");
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
    if (!record.raw || !record.hash || !record.prepared) throw new Error("Incomplete signed Arc journal");
    await reconcileRecord(record, this.rpc, this.config, save, this.now());
    if (terminal(record) || record.status === "reconciliation_required") return publicStatus(record);
    // Expired signed-but-never-attempted proposals stay quarantined. Once attempted,
    // expiry cannot imply cancellation: reconcile or rebroadcast the exact same bytes.
    if (record.status === "signed" && this.now() >= record.prepared.expiresAt) {
      record.status = "reconciliation_required";
      await save();
      return publicStatus(record);
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
