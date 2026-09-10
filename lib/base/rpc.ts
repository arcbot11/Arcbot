import { createPublicClient, http, parseAbi, serializeTransaction, size, TransactionReceiptNotFoundError, type Address, type Hex } from "viem";
import { BASE_CHAIN_ID, baseChain, type BaseConfig } from "./config";
import type { BaseTransaction } from "./transfers";
export type BaseBlock = { number: bigint; hash: Hex; timestamp: bigint };
export type BaseCall = { from: Address; to: Address; data: Hex; value: bigint };
export type BaseReceipt = { hash: Hex; status: "success" | "reverted"; blockNumber: bigint; blockHash: Hex;
  gasUsed: bigint; effectiveGasPrice: bigint; l1Fee?: bigint };
export interface BaseRpc {
  chainId(): Promise<number>;
  block(number?: bigint): Promise<BaseBlock>;
  settlementBlock(tag: "safe" | "finalized"): Promise<BaseBlock>;
  balance(owner: Address, block: bigint): Promise<bigint>;
  call(tx: BaseCall, block: bigint): Promise<Hex>;
  estimateGas(tx: BaseCall, block: bigint): Promise<bigint>;
  fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  extraFees(tx: BaseTransaction, block: bigint): Promise<{ l1FeeUpperBoundWei: bigint; operatorFeeWei: bigint }>;
  nonce(owner: Address, pending: boolean): Promise<number>;
  broadcast(raw: Hex): Promise<Hex>;
  receipt(hash: Hex): Promise<BaseReceipt | null>;
}
const oracle = "0x420000000000000000000000000000000000000F";
const feeAbi = parseAbi(["function getL1FeeUpperBound(uint256) view returns (uint256)", "function getOperatorFee(uint256) view returns (uint256)"]);
export function createBaseRpc(config: BaseConfig): BaseRpc {
  const client = createPublicClient({ chain: baseChain(config), transport: http(config.rpcUrl, { batch: false, retryCount: 0, timeout: 12000 }) });
  const mined = (b: { number: bigint | null; hash: Hex | null; timestamp: bigint }): BaseBlock => {
    if (b.number === null || !b.hash) throw new Error("Unmined Base block");
    return { number: b.number, hash: b.hash, timestamp: b.timestamp };
  };
  const request = (tx: BaseCall) => ({ account: tx.from, to: tx.to, data: tx.data, value: tx.value });
  return {
    chainId: () => client.getChainId(),
    block: async number => mined(await client.getBlock(number === undefined ? { blockTag: "latest" } : { blockNumber: number })),
    settlementBlock: async blockTag => mined(await client.getBlock({ blockTag })),
    balance: (address, blockNumber) => client.getBalance({ address, blockNumber }),
    call: async (tx, blockNumber) => (await client.call({ ...request(tx), blockNumber })).data ?? "0x",
    estimateGas: (tx, blockNumber) => client.estimateGas({ ...request(tx), blockNumber }),
    fees: () => client.estimateFeesPerGas({ type: "eip1559" }),
    extraFees: async (tx, blockNumber) => {
      const unsigned = serializeTransaction(tx);
      const [l1FeeUpperBoundWei, operatorFeeWei] = await Promise.all([
        client.readContract({ address: oracle, abi: feeAbi, functionName: "getL1FeeUpperBound", args: [BigInt(size(unsigned))], blockNumber }),
        client.readContract({ address: oracle, abi: feeAbi, functionName: "getOperatorFee", args: [tx.gas], blockNumber }),
      ]);
      return { l1FeeUpperBoundWei, operatorFeeWei }; // RPC/oracle errors must never become zero fees.
    },
    nonce: (address, pending) => client.getTransactionCount({ address, blockTag: pending ? "pending" : "latest" }),
    broadcast: serializedTransaction => client.sendRawTransaction({ serializedTransaction }),
    receipt: async hash => {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return { hash: receipt.transactionHash, status: receipt.status, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
          gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice,
          ...(receipt.l1Fee !== undefined && receipt.l1Fee !== null ? { l1Fee: receipt.l1Fee } : {}) };
      } catch (error) { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; }
    },
  };
}
export async function checkBaseRpc(rpc: BaseRpc, config: BaseConfig, now = Date.now()): Promise<BaseBlock> {
  if (await rpc.chainId() !== BASE_CHAIN_ID) throw new Error("RPC is not Base mainnet (8453)");
  const checkpoint = await rpc.block(config.checkpointNumber);
  if (checkpoint.number !== config.checkpointNumber || checkpoint.hash.toLowerCase() !== config.checkpointHash.toLowerCase()) throw new Error("Base checkpoint mismatch");
  const head = await rpc.block();
  const age = BigInt(Math.floor(now / 1000)) - head.timestamp;
  if (head.number < checkpoint.number || age < -5n || age > BigInt(config.maxHeadAgeSeconds)) throw new Error("Base RPC head is stale or invalid");
  return head;
}

/** Read-only settlement evidence. This does not authorize an OTC payout. */
export async function baseReceiptFinality(rpc: BaseRpc, receipt: BaseReceipt) {
  const canonical = await rpc.block(receipt.blockNumber);
  if (canonical.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("Base receipt left the canonical chain");
  const result: { safe: boolean | null; finalized: boolean | null } = { safe: null, finalized: null };
  for (const tag of ["safe", "finalized"] as const) {
    try {
      const tip = await rpc.settlementBlock(tag);
      const canonicalTip = await rpc.block(tip.number);
      if (canonicalTip.hash.toLowerCase() !== tip.hash.toLowerCase()) throw new Error("Settlement block mismatch");
      result[tag] = tip.number >= receipt.blockNumber;
    } catch { result[tag] = null; } // Unsupported/unavailable tags are unknown, never final.
  }
  if ((await rpc.block(receipt.blockNumber)).hash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("Base receipt changed during finality check");
  return result;
}
