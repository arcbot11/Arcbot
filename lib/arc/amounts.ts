export const UINT256_MAX = (1n << 256n) - 1n;
export const USDC_SCALE = 10n ** 12n;

/** Unlike parseUnits, rejects excess precision rather than rounding money. */
export function exactAmount(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error("Invalid token decimals");
  if (value.length > 340 || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) throw new Error("Use a positive decimal amount without exponents or separators");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error("Amount exceeds token precision");
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n || amount > UINT256_MAX) throw new Error("Amount outside uint256 range");
  return amount;
}

export function usdcBalance(nativeWei: bigint) {
  if (nativeWei < 0n || nativeWei > UINT256_MAX) throw new Error("Invalid native balance");
  return { nativeWei, erc20Units: nativeWei / USDC_SCALE, dustWei: nativeWei % USDC_SCALE };
}

export function reserveGas(nativeBalance: bigint, spendWei: bigint, gas: bigint, feePerGas: bigint, otherReservedWei = 0n) {
  if ([nativeBalance, spendWei, otherReservedWei].some((n) => n < 0n) || gas <= 0n || feePerGas <= 0n) throw new Error("Invalid gas reservation");
  const feeReserve = gas * feePerGas;
  if (spendWei + feeReserve + otherReservedWei > nativeBalance) throw new Error("Insufficient USDC for transfer and gas reserve");
  return feeReserve;
}
