import { parseTransaction, type Hex, type PublicClient } from "viem";
import type { Transaction } from "./model";

export const OTC_DEPOSIT_WAIT_SECONDS = 30n;
type Client = Pick<PublicClient, "getTransactionReceipt" | "getTransaction" | "getBlock">;

/** A short confirmation window, not Ethereum finality. Never authorize from elapsed time alone. */
export async function otcDepositConfirmed(client: Client, deposit: Transaction, now = Date.now()) {
  if (deposit.chainId !== 8453 || deposit.escrowRef?.step !== "deposit" || !deposit.hash) return false;
  const receipt = await client.getTransactionReceipt({ hash: deposit.hash as Hex }).catch(error => {
    if (error?.name === "TransactionReceiptNotFoundError") return null;
    throw error;
  });
  if (!receipt || receipt.status !== "success" || receipt.transactionHash.toLowerCase() !== deposit.hash.toLowerCase()) return false;
  const expected = parseTransaction(deposit.unsigned as Hex);
  if (expected.chainId !== 8453 || !expected.to || receipt.blockNumber <= 0n) return false;
  const [tx, block, head] = await Promise.all([
    client.getTransaction({ hash: deposit.hash as Hex }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBlock({ blockTag: "latest" }),
  ]);
  const seconds = BigInt(Math.floor(now / 1000));
  if (block.hash !== receipt.blockHash || tx.blockHash !== receipt.blockHash
    || tx.from.toLowerCase() !== deposit.wallet.toLowerCase() || tx.to?.toLowerCase() !== expected.to?.toLowerCase()
    || tx.value !== (expected.value ?? 0n) || tx.input !== (expected.data ?? "0x")) return false;
  if (head.number === null || head.number <= receipt.blockNumber || head.timestamp > seconds + 5n || seconds - head.timestamp > 30n
    || seconds - block.timestamp < OTC_DEPOSIT_WAIT_SECONDS || head.timestamp - block.timestamp < OTC_DEPOSIT_WAIT_SECONDS) return false;
  // Catch a reorganisation during the preceding reads as well.
  return (await client.getBlock({ blockNumber: receipt.blockNumber })).hash === receipt.blockHash;
}
