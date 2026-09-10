import { createPublicClient, parseAbi, TransactionReceiptNotFoundError, type Address, type Hex } from "viem";
import { arcTransport } from "./transport";
import { ARC_CHAIN_ID, arcChain, type ArcConfig } from "./config";

export type ArcBlock = { number: bigint; hash: Hex; timestamp: bigint };
export type ArcCall = { from: Address; to: Address; data: Hex; value: bigint };
export type ArcReceipt = { hash: Hex; status: "success" | "reverted"; blockNumber: bigint; blockHash: Hex; gasUsed: bigint; effectiveGasPrice: bigint };
export interface ArcRpc {
  chainId(): Promise<number>;
  block(number?: bigint): Promise<ArcBlock>;
  balance(owner: Address, block: bigint): Promise<bigint>;
  code(token: Address, block: bigint): Promise<Hex | undefined>;
  decimals(token: Address, block: bigint): Promise<number>;
  tokenBalance(token: Address, owner: Address, block: bigint): Promise<bigint>;
  call(tx: ArcCall, block: bigint): Promise<Hex>;
  estimateGas(tx: ArcCall, block: bigint): Promise<bigint>;
  fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  nonce(owner: Address, pending: boolean): Promise<number>;
  broadcast(raw: Hex): Promise<Hex>;
  receipt(hash: Hex): Promise<ArcReceipt | null>;
}
const tokenAbi = parseAbi(["function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"]);

export function createArcRpc(config: ArcConfig, transport = arcTransport(config)): ArcRpc {
  const client = createPublicClient({ chain: arcChain(config), transport });
  const request = (tx: ArcCall) => ({ account: tx.from, to: tx.to, value: tx.value, data: tx.data });
  return {
    chainId: () => client.getChainId(),
    block: async (number) => {
      const b = await client.getBlock(number === undefined ? { blockTag: "latest" } : { blockNumber: number });
      if (b.number === null || !b.hash) throw new Error("RPC returned an unmined block");
      return { number: b.number, hash: b.hash, timestamp: b.timestamp };
    },
    balance: (address, blockNumber) => client.getBalance({ address, blockNumber }),
    code: (address, blockNumber) => client.getCode({ address, blockNumber }),
    decimals: (address, blockNumber) => client.readContract({ address, abi: tokenAbi, functionName: "decimals", blockNumber }),
    tokenBalance: (address, owner, blockNumber) => client.readContract({ address, abi: tokenAbi, functionName: "balanceOf", args: [owner], blockNumber }),
    call: async (tx, blockNumber) => (await client.call({ ...request(tx), blockNumber })).data ?? "0x",
    estimateGas: (tx, blockNumber) => client.estimateGas({ ...request(tx), blockNumber }),
    fees: () => client.estimateFeesPerGas({ type: "eip1559" }),
    nonce: (address, pending) => client.getTransactionCount({ address, blockTag: pending ? "pending" : "latest" }),
    broadcast: (serializedTransaction) => client.sendRawTransaction({ serializedTransaction }),
    receipt: async (hash) => {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return { hash: receipt.transactionHash, status: receipt.status, blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice };
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null;
        throw error; // Unavailable RPC is not evidence that the transaction is absent.
      }
    },
  };
}

export async function checkArcRpc(rpc: ArcRpc, config: ArcConfig, now = Date.now()): Promise<ArcBlock> {
  if (await rpc.chainId() !== ARC_CHAIN_ID) throw new Error("RPC is not Arc mainnet (5042)");
  const checkpoint = await rpc.block(config.checkpointNumber);
  if (checkpoint.number !== config.checkpointNumber || checkpoint.hash.toLowerCase() !== config.checkpointHash.toLowerCase()) throw new Error("Arc checkpoint mismatch");
  const head = await rpc.block();
  const age = BigInt(Math.floor(now / 1000)) - head.timestamp;
  if (head.number < checkpoint.number || age < -5n || age > BigInt(config.maxHeadAgeSeconds)) throw new Error("Arc RPC head is stale or invalid");
  return head;
}
