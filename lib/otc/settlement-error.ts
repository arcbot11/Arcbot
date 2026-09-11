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
    if (/recovery allowance is already used/i.test(text)) return "Settlement blocked: gas recovery allowance is exhausted. Operator assistance is required.";
    if (/gas.*(?:recovery allowance|small network allowance)|Gas recovery exceeds/i.test(text)) return "Settlement blocked: gas exceeds the automatic recovery limit. Operator assistance is required.";
    if (/Not enough funds for the amount and gas|Wallet reservation is not covered|needs gas to return|insufficient funds|Add funds for settlement gas/i.test(text)) return "Settlement blocked: insufficient funds for gas. Add funds to the paying wallet and contact support to resume settlement.";
    if (/gas.*(?:configured policy|configured cap|reserved allowance)|Base fees exceed/i.test(text)) return "Settlement blocked: network fees exceed the allowed gas budget. Operator assistance is required.";
    current = item.cause;
  }
  return "Pending verification";
}
