import { formatUnits, parseUnits } from "viem";
import { displayUsdc } from "../amount-display";

export function ethUsdDisplay(wei: string | null | undefined, eth: string | undefined, rate: string | null) {
  try {
    const amount = wei != null ? BigInt(wei) : eth && /^\d+(?:\.\d{0,18})?$/.test(eth) ? parseUnits(eth, 18) : null;
    if (amount === null || amount < 0n) return null;
    if (amount === 0n) return "$0.00";
    if (!rate || !/^\d+$/.test(rate) || BigInt(rate) <= 0n) return null;
    // Keep exact precision until formatting, including values below one cent.
    const value = displayUsdc(formatUnits(amount * BigInt(rate), 24));
    return `$${value}`;
  } catch { return null; }
}
