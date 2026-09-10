import { ARC_USDC } from "../arc/config";
import { USDC_SCALE } from "../arc/amounts";
import { tokenTransfer } from "./token-delivery";
import type { Hex } from "viem";

/** Arc's ERC-20 USDC and native gas currency spend the same balance. */
export function nativeSpend(chainId: number, call: {to?: string | null; value?: bigint; data?: Hex}) {
  const value = call.value ?? 0n;
  if (chainId !== 5042 || call.to?.toLowerCase() !== ARC_USDC.toLowerCase()
    || !call.data?.startsWith("0xa9059cbb")) return value;
  const transfer = tokenTransfer(call.data, value);
  if (!transfer) throw new Error("Arc USDC transfer amount is unavailable.");
  return value + transfer.amount * USDC_SCALE;
}
