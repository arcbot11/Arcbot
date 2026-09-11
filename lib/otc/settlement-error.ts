/** Public status text must never contain RPC URLs, request bodies, or credentials. */
export function settlementFailure(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    if (typeof current !== "object") break;
    const item = current as { message?: unknown; details?: unknown; errorType?: unknown; cause?: unknown };
    const text = [item.message, item.details, item.errorType].filter(v => typeof v === "string").join(" ");
    if (/wallet authentication|wallet_authentication/i.test(text)) return "Settlement blocked: wallet signing needs operator attention. Funds remain protected.";
    if (/rate limit|too many requests|429/i.test(text)) return "Base RPC is busy. Settlement will retry automatically.";
    if (/Gas exceeds the escrow allowance/i.test(text)) return "Settlement paused: gas exceeds this order's allowance.";
    current = item.cause;
  }
  return "Pending verification";
}
