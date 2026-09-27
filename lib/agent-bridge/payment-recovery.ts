import { decodeEventLog, decodeFunctionData, parseAbi, type Hex } from "viem";
import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { bridgeClient } from "../bridge/read";

const events = parseAbi([
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const calls = parseAbi([
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);
const assets = {
  "eip155:5042": "0x3600000000000000000000000000000000000000",
  "eip155:8453": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
} as const;
const same = (a: unknown, b: unknown) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();

// Called only for an already verified, durably settling/uncertain payment.
// The caller supplies a receipt locator, never new authority to charge a wallet.
export async function reconcileDirectPayment(
  payload: PaymentPayload,
  transaction: string | null,
  clientFactory = bridgeClient,
): Promise<SettleResponse | null> {
  if (!transaction || !/^0x[\da-fA-F]{64}$/.test(transaction)) return null;
  const network = payload.accepted.network;
  if (network !== "eip155:5042" && network !== "eip155:8453") return null;
  const asset = assets[network];
  if (
    !same(payload.accepted.asset, asset) ||
    payload.accepted.extra?.name !==
      (network === "eip155:5042" ? "USDC" : "USD Coin") ||
    payload.accepted.extra?.version !== "2"
  )
    return null;
  const auth = payload.payload.authorization as {
    from: string;
    to: string;
    value: string;
    nonce: string;
    validAfter: string;
    validBefore: string;
  };
  if (
    !same(auth.to, payload.accepted.payTo) ||
    auth.value !== payload.accepted.amount
  )
    return null;
  const chain = network === "eip155:5042" ? 5042 : 8453;
  const client = clientFactory(chain);
  const [chainId, receipt, finalized, tx] = await Promise.all([
    client.getChainId(),
    client.getTransactionReceipt({ hash: transaction as Hex }),
    client.getBlock({ blockTag: "finalized" }),
    client.getTransaction({ hash: transaction as Hex }),
  ]);
  if (!same(tx.to, asset) || !same(tx.hash, transaction)) return null;
  // Fail closed for batched/unknown call shapes. Events from two different
  // authorizations in one receipt must never be combined into payment proof.
  let args;
  try {
    args = decodeFunctionData({ abi: calls, data: tx.input }).args;
  } catch {
    return null;
  }
  if (
    !same(args[0], auth.from) ||
    !same(args[1], auth.to) ||
    args[2] !== BigInt(auth.value) ||
    args[3] !== BigInt(auth.validAfter) ||
    args[4] !== BigInt(auth.validBefore) ||
    !same(args[5], auth.nonce)
  )
    return null;
  if (
    chainId !== chain ||
    receipt.status !== "success" ||
    !same(receipt.transactionHash, transaction) ||
    finalized.number === null ||
    receipt.blockNumber > finalized.number
  )
    return null;
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (!same(block.hash, receipt.blockHash)) return null;
  const decoded = receipt.logs
    .filter((log) => same(log.address, asset))
    .flatMap((log) => {
      try {
        return [
          decodeEventLog({ abi: events, data: log.data, topics: log.topics }),
        ];
      } catch {
        return [];
      }
    });
  // A nonce can be consumed only once by canonical USDC. Require its event and
  // an exact transfer in the same successful, canonical, finalized receipt.
  const used = decoded.filter(
    (log) =>
      log.eventName === "AuthorizationUsed" &&
      same(log.args.authorizer, auth.from) &&
      same(log.args.nonce, auth.nonce),
  );
  const transfers = decoded.filter(
    (log) =>
      log.eventName === "Transfer" &&
      same(log.args.from, auth.from) &&
      same(log.args.to, auth.to) &&
      log.args.value === BigInt(auth.value),
  );
  if (used.length !== 1 || transfers.length !== 1) return null;
  return { success: true, network, transaction, payer: auth.from };
}
