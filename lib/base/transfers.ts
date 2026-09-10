import { getAddress, isAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { exactAmount } from "../arc/amounts";
import { BASE_CHAIN_ID, type BaseConfig } from "./config";
import { checkBaseRpc, type BaseRpc } from "./rpc";

const address = z.string().refine(s => isAddress(s, { strict: true }) && s.toLowerCase() !== zeroAddress, "Use a nonzero checksummed address").transform(s => getAddress(s));
export const sendIntent = z.object({ chainId: z.literal(BASE_CHAIN_ID), operation: z.literal("send"), from: address, recipient: address,
  asset: z.literal("native"), amount: z.string().min(1).max(100).regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
}).strict().refine(s => s.from !== s.recipient, "Recipient must differ from sender");
export type SendIntent = z.infer<typeof sendIntent>;
export type BaseTransaction = { chainId: typeof BASE_CHAIN_ID; type: "eip1559"; to: Address; data: Hex; value: bigint;
  nonce: number; gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
export type PreparedSend = { intent: SendIntent; transaction: BaseTransaction; amountUnits: bigint; decimals: 18;
  snapshot: { number: bigint; hash: Hex }; expiresAt: number; gasReserveWei: bigint;
  l1FeeUpperBoundWei: bigint; operatorFeeWei: bigint; delivery: "native" };
export function sendDigest(intent: SendIntent): Hex {
  const [whole, fraction = ""] = intent.amount.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return keccak256(stringToHex(JSON.stringify({ chainId: intent.chainId, operation: intent.operation,
    from: intent.from.toLowerCase(), recipient: intent.recipient.toLowerCase(), asset: intent.asset,
    amount: decimals ? `${whole}.${decimals}` : whole })));
}
export function sendCall(intent: SendIntent, amountUnits: bigint) {
  return { from: intent.from, to: intent.recipient, value: amountUnits, data: "0x" as Hex };
}
export async function prepareSend(input: unknown, rpc: BaseRpc, config: BaseConfig, now = Date.now()): Promise<PreparedSend> {
  const intent = sendIntent.parse(input);
  const head = await checkBaseRpc(rpc, config, now);
  const amountUnits = exactAmount(intent.amount, 18);
  const call = sendCall(intent, amountUnits);
  await rpc.call(call, head.number); // Includes contract receive/fallback behavior.
  const estimate = await rpc.estimateGas(call, head.number);
  const gas = (estimate * 120n + 99n) / 100n;
  const fees = await rpc.fees();
  if (estimate <= 0n || gas > config.maxGas || fees.maxFeePerGas <= 0n || fees.maxFeePerGas > config.maxFeePerGas
    || fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > fees.maxFeePerGas) throw new Error("Base gas exceeds policy");
  const latestNonce = await rpc.nonce(intent.from, false);
  const nonce = await rpc.nonce(intent.from, true);
  if (!Number.isSafeInteger(nonce) || nonce < 0 || nonce !== latestNonce) throw new Error("Wallet has pending transactions; reconcile before sending");
  const transaction: BaseTransaction = { chainId: BASE_CHAIN_ID, type: "eip1559", to: call.to, data: call.data, value: call.value, nonce, gas, ...fees };
  const { l1FeeUpperBoundWei, operatorFeeWei } = await rpc.extraFees(transaction, head.number);
  if (l1FeeUpperBoundWei < 0n || operatorFeeWei < 0n) throw new Error("Invalid Base fee estimate");
  // Extra fees are not capped by maxFeePerGas. Reserve twice the current oracle estimates.
  const gasReserveWei = gas * fees.maxFeePerGas + 2n * (l1FeeUpperBoundWei + operatorFeeWei);
  if (gasReserveWei > config.maxTotalFeeWei) throw new Error("Base total fee reserve exceeds policy");
  if (await rpc.balance(intent.from, head.number) < amountUnits + gasReserveWei) throw new Error("Insufficient ETH including L1 and L2 fees");
  if ((await rpc.block(head.number)).hash.toLowerCase() !== head.hash.toLowerCase()) throw new Error("Base preparation snapshot changed");
  return { intent, transaction, amountUnits, decimals: 18, snapshot: { number: head.number, hash: head.hash }, expiresAt: now + 30000,
    gasReserveWei, l1FeeUpperBoundWei, operatorFeeWei, delivery: "native" };
}
