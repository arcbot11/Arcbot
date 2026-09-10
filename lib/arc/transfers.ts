import { encodeFunctionData, getAddress, isAddress, keccak256, stringToHex, parseAbi, zeroAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { exactAmount, reserveGas, USDC_SCALE } from "./amounts.ts";
import { ARC_CHAIN_ID, ARC_USDC, type ArcConfig } from "./config.ts";
import { checkArcRpc, type ArcCall, type ArcRpc } from "./rpc.ts";

const address = z.string().refine((s) => isAddress(s, { strict: true }) && s.toLowerCase() !== zeroAddress, "Use a nonzero address with a valid checksum").transform((s) => getAddress(s));
export const ARC_BURN_ADDRESS = getAddress("0x000000000000000000000000000000000000dead");
export const sendIntent = z.object({
  chainId: z.literal(ARC_CHAIN_ID), operation: z.enum(["send", "burn"]),
  from: address, recipient: address,
  asset: z.union([z.literal("native"), address]),
  amount: z.string().min(1).max(340).regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
}).strict().refine((s) => s.from !== s.recipient, "Recipient must differ from sender")
  .refine(s => s.operation !== "burn" || (s.asset !== "native" && s.recipient === ARC_BURN_ADDRESS), "Burn requires an ERC-20 token and the fixed dead address");
const burnIntent = z.object({
  chainId: z.literal(ARC_CHAIN_ID), operation: z.literal("burn"), from: address, asset: address,
  amount: z.string().min(1).max(340).regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
}).strict();
/** Dead-address transfer, not a token-specific burn() call or a totalSupply claim. */
export function burnTransfer(input: unknown): SendIntent {
  return sendIntent.parse({ ...burnIntent.parse(input), recipient: ARC_BURN_ADDRESS });
}
export type SendIntent = z.infer<typeof sendIntent>;
export type ArcTransaction = {
  chainId: typeof ARC_CHAIN_ID; type: "eip1559"; to: Address; data: Hex; value: bigint;
  nonce: number; gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint;
};
export type PreparedSend = {
  intent: SendIntent; transaction: ArcTransaction; amountUnits: bigint; decimals: number;
  snapshot: { number: bigint; hash: Hex }; expiresAt: number; gasReserveWei: bigint;
  delivery: "native" | "token-contract-defined";
};
const transferAbi = parseAbi(["function transfer(address recipient, uint256 amount) returns (bool)"]);
const trueResult = `0x${"0".repeat(63)}1`;

export function sendDigest(intent: SendIntent): Hex {
  const [whole, fraction = ""] = intent.amount.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return keccak256(stringToHex(JSON.stringify({ chainId: intent.chainId, operation: intent.operation,
    from: intent.from.toLowerCase(), recipient: intent.recipient.toLowerCase(), asset: intent.asset.toLowerCase(),
    amount: decimals ? `${whole}.${decimals}` : whole,
  })));
}

export function sendCall(intent: SendIntent, amountUnits: bigint): ArcCall {
  return { from: intent.from, to: intent.asset === "native" ? intent.recipient : intent.asset,
    value: intent.asset === "native" ? amountUnits : 0n,
    data: intent.asset === "native" ? "0x" : encodeFunctionData({ abi: transferAbi, functionName: "transfer", args: [intent.recipient, amountUnits] }),
  };
}

export async function prepareSend(input: unknown, rpc: ArcRpc, config: ArcConfig, now = Date.now()): Promise<PreparedSend> {
  const intent = sendIntent.parse(input);
  const head = await checkArcRpc(rpc, config, now);
  const nativeBalance = await rpc.balance(intent.from, head.number);
  let decimals = 18;
  if (intent.asset !== "native") {
    const code = await rpc.code(intent.asset, head.number);
    if (!code || code === "0x") throw new Error("Token address has no contract code");
    decimals = await rpc.decimals(intent.asset, head.number); // Never guess metadata or resolve by ticker.
    if (intent.asset === ARC_USDC && decimals !== 6) throw new Error("Unexpected Arc USDC decimals");
  }
  const amountUnits = exactAmount(intent.amount, decimals);
  const nativeSpend = intent.asset === "native" ? amountUnits : intent.asset === ARC_USDC ? amountUnits * USDC_SCALE : 0n;
  if (intent.asset !== "native" && await rpc.tokenBalance(intent.asset, intent.from, head.number) < amountUnits) throw new Error("Insufficient token balance");
  const call = sendCall(intent, amountUnits);
  const result = await rpc.call(call, head.number);
  // Empty-return ERC-20s are supported; false or malformed results are not.
  if (intent.asset !== "native" && result !== "0x" && result.toLowerCase() !== trueResult) throw new Error("Token transfer returned false or malformed data");
  const estimate = await rpc.estimateGas(call, head.number);
  const gas = (estimate * 120n + 99n) / 100n;
  const fees = await rpc.fees();
  if (estimate <= 0n || gas > config.maxGas || fees.maxFeePerGas <= 0n || fees.maxFeePerGas > config.maxFeePerGas
    || fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > fees.maxFeePerGas) throw new Error("Arc gas estimate exceeds configured policy");
  const gasReserveWei = reserveGas(nativeBalance, nativeSpend, gas, fees.maxFeePerGas);
  const latestNonce = await rpc.nonce(intent.from, false);
  const nonce = await rpc.nonce(intent.from, true);
  if (!Number.isSafeInteger(nonce) || nonce < 0 || nonce !== latestNonce) throw new Error("Wallet has pending transactions; reconcile before sending");
  if ((await rpc.block(head.number)).hash.toLowerCase() !== head.hash.toLowerCase()) throw new Error("Arc preparation snapshot changed");
  return { intent, transaction: { chainId: ARC_CHAIN_ID, type: "eip1559", to: call.to, value: call.value, data: call.data, nonce, gas, ...fees },
    amountUnits, decimals, snapshot: { number: head.number, hash: head.hash }, expiresAt: now + 30_000, gasReserveWei,
    delivery: intent.asset === "native" ? "native" : "token-contract-defined",
  };
}
