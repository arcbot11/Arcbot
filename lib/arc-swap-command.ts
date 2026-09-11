import { tokenPattern } from "./token-pattern";

/** Explicit roles only; never infer assets or turn a dollar value into token units. */
export function explicitArcSwap(text: string) {
  const match = text.match(tokenPattern(/\bswap\s+(\$)?([0-9][0-9,]*(?:\.[0-9]+)?|\.[0-9]+|all)(%)?(?:\s+(USD|USDC))?\s+(?:(?:worth\s+)?of\s+)?(?:my\s+)?\$?(0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9_]{0,31})\s+(?:for|to)\s+\$?(0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9_]{0,31})\b/i));
  if (!match) return null;
  const all = match[2].toLowerCase() === "all";
  if ((all && (match[1] || match[3] || match[4])) || (match[3] && (match[1] || match[4]))) return null;
  const amount = all ? "100" : match[2].replaceAll(",", "").replace(/^\./, "0.");
  const unit = all || match[3] ? "percent" : match[1] || match[4] ? "usd" : "token";
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || (unit === "percent" && Number(amount) > 100)) return null;
  if (match[5].toLowerCase() === match[6].toLowerCase()) return null;
  return { amount, unit, fromToken: match[5], toToken: match[6] } as const;
}
