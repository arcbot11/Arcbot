import { formatUnits, parseTransaction, type Hex } from "viem";
import { formatBalanceUsd } from "../balance-display";
import { tokenUsdEstimate } from "./token-value";
import type { Transaction } from "../otc/model";

/** Value the verified delivered amount, never the requested burn or rounded display. */
export async function xBurnReceipt(tx: Transaction, amountLabel: string) {
  let usd: string | undefined;
  try {
    const output = tx.settlement?.output;
    const token = parseTransaction(tx.unsigned as Hex).to;
    if (tx.status === "completed" && token && output?.decimals !== undefined) {
      const value = await tokenUsdEstimate(token, formatUnits(BigInt(output.raw), output.decimals));
      if (value.usdValue !== null) usd = formatBalanceUsd(value.usdValue);
    }
  } catch { /* A price lookup must not change a confirmed burn into a failed command. */ }
  return `Burned ${amountLabel}${usd ? ` (${usd})` : ""}`;
}
