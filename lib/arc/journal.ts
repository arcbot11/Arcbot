import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { keccak256, type Address, type Hex } from "viem";
import { z } from "zod";
import { sendIntent, sendDigest, sendCall, type PreparedSend, type SendIntent } from "./transfers.ts";
import { exactAmount, UINT256_MAX } from "./amounts.ts";
import { ARC_USDC } from "./config.ts";
import type { ArcReceipt } from "./rpc.ts";

export type SendRecord = {
  intent: SendIntent; digest: Hex;
  status: "created" | "prepared" | "signed" | "unknown" | "submitted" | "mined" | "reverted" | "reconciliation_required" | "cancelled";
  prepared?: PreparedSend; raw?: Hex; hash?: Hex; receipt?: ArcReceipt;
};
export type WalletJournal = { version: 1; records: SendRecord[] };
export interface ArcJournal {
  withWallet<T>(wallet: Address, action: (journal: WalletJournal, save: () => Promise<void>) => Promise<T>): Promise<T>;
}
export const journalJson = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? { arcBigInt: item.toString() } : item);
export const parseJournalJson = (text: string): WalletJournal => JSON.parse(text, (_, item) =>
  item && typeof item === "object" && Object.keys(item).length === 1 && typeof item.arcBigInt === "string" ? BigInt(item.arcBigInt) : item);

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const hex = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
const uint = z.bigint().min(0n).max(UINT256_MAX);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const receiptSchema = z.object({ hash, status: z.enum(["success", "reverted"]), blockNumber: uint,
  blockHash: hash, gasUsed: uint, effectiveGasPrice: uint }).strict();
const recordSchema = z.object({
  intent: sendIntent, digest: hash,
  status: z.enum(["created", "prepared", "signed", "unknown", "submitted", "mined", "reverted", "reconciliation_required", "cancelled"]),
  prepared: z.object({ intent: sendIntent, amountUnits: uint, decimals: z.number().int().min(0).max(255),
    snapshot: z.object({ number: uint, hash }).strict(), expiresAt: z.number().int().nonnegative().safe(), gasReserveWei: uint,
    delivery: z.enum(["native", "token-contract-defined"]),
    transaction: z.object({ chainId: z.literal(5042), type: z.literal("eip1559"), to: address, data: hex, value: uint,
      nonce: z.number().int().nonnegative().safe(), gas: uint.refine((v) => v > 0n),
      maxFeePerGas: uint.refine((v) => v > 0n), maxPriorityFeePerGas: uint }).strict(),
  }).strict().optional(),
  raw: hex.optional(), hash: hash.optional(), receipt: receiptSchema.optional(),
}).strict();

/** Validate before signing, monitoring, cancellation, or accepting any cached result. */
export function validateWalletJournal(journal: WalletJournal, wallet: Address) {
  z.object({ version: z.literal(1), records: z.array(recordSchema) }).strict().parse(journal);
  const ids = new Set<string>();
  for (const record of journal.records) {
    if (record.intent.from.toLowerCase() !== wallet.toLowerCase() || ids.has(record.intent.requestId)
      || sendDigest(record.intent) !== record.digest) throw new Error("Arc journal identity mismatch");
    ids.add(record.intent.requestId);
    const signed = !["created", "prepared", "cancelled"].includes(record.status);
    if (signed !== !!record.raw || signed !== !!record.hash || (signed && !record.prepared)
      || (record.status === "prepared" && !record.prepared)) throw new Error("Arc journal state is incomplete");
    if (record.raw && keccak256(record.raw) !== record.hash) throw new Error("Arc journal hash mismatch");
    const mined = record.status === "mined" || record.status === "reverted";
    if (mined !== !!record.receipt || (record.receipt && (record.receipt.hash !== record.hash
      || (record.receipt.status === "success") !== (record.status === "mined")))) throw new Error("Arc journal receipt mismatch");
    if (record.prepared) {
      const p = record.prepared, tx = p.transaction;
      const amount = exactAmount(record.intent.amount, p.decimals);
      const call = sendCall(record.intent, amount);
      if (sendDigest(p.intent) !== record.digest || p.intent.requestId !== record.intent.requestId
        || p.amountUnits !== amount || (record.intent.asset === "native" && p.decimals !== 18)
        || (record.intent.asset === ARC_USDC && p.decimals !== 6)
        || tx.to.toLowerCase() !== call.to.toLowerCase() || tx.value !== call.value || tx.data !== call.data
        || tx.maxPriorityFeePerGas > tx.maxFeePerGas || p.gasReserveWei !== tx.gas * tx.maxFeePerGas) {
        throw new Error("Arc journal proposal differs from its intent");
      }
    }
  }
}

/** Single-host operator storage. A stale lock is deliberately never auto-stolen. */
export class FileArcJournal implements ArcJournal {
  private readonly directory: string;
  constructor(directory: string) { this.directory = resolve(directory); }
  async withWallet<T>(wallet: Address, action: (journal: WalletJournal, save: () => Promise<void>) => Promise<T>): Promise<T> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new Error("Invalid journal wallet");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, `5042-${wallet.toLowerCase()}.json`);
    const lock = `${file}.lock`;
    let handle;
    try { handle = await open(lock, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Arc wallet is locked; reconcile any stopped worker before clearing its lock");
      throw error;
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      await handle.sync();
      let journal: WalletJournal;
      try { journal = parseJournalJson(await readFile(file, "utf8")); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        journal = { version: 1, records: [] };
      }
      validateWalletJournal(journal, wallet);
      const save = async () => {
        validateWalletJournal(journal, wallet);
        const temporary = `${file}.${randomUUID()}.tmp`;
        const output = await open(temporary, "wx", 0o600);
        try {
          try { await output.writeFile(journalJson(journal)); await output.sync(); }
          finally { await output.close(); }
          await rename(temporary, file);
        }
        finally { await unlink(temporary).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; }); }
      };
      return await action(journal, save);
    } finally { await handle.close(); await unlink(lock); }
  }
}
