import { formatBalanceUsd } from "../balance-display";

export function formatTokenUsd(value?: number | null) {
  if (value == null || !Number.isFinite(value) || value < 0) return "";
  return `${formatBalanceUsd(value)} USD`;
}
