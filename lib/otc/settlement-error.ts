/** Public status text must never contain RPC URLs, request bodies, or credentials. */
export function settlementFailure(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    if (typeof current !== "object") break;
    const item = current as { message?: unknown; details?: unknown; errorType?: unknown; cause?: unknown };
    const text = [item.message, item.details, item.errorType].filter(v => typeof v === "string").join(" ");
    if(/Base broadcast was not acknowledged/i.test(text))return "Base submission is retrying. Payment confirmation is pending.";
    if (/wallet authentication|wallet_authentication/i.test(text)) return "Settlement blocked: wallet signing needs operator attention. Funds remain protected.";
    if (/Nonce consumed|Wallet nonce changed|Nonce changed\. Reconcile/i.test(text)) return "Transaction needs wallet recovery. Contact support. Funds remain protected.";
    if (/rate limit|too many requests|429/i.test(text)) return "Base RPC is busy. Settlement will retry automatically.";
    if (/Gas exceeds the escrow allowance/i.test(text)) return "Settlement paused: gas exceeds this order's allowance.";
    if (/recovery allowance is already used/i.test(text)) return "Settlement blocked: gas recovery allowance is exhausted. Operator assistance is required.";
    if (/gas.*(?:recovery allowance|small network allowance)|Gas recovery exceeds/i.test(text)) return "Settlement blocked: gas exceeds the automatic recovery limit. Operator assistance is required.";
    if (/Not enough funds for the amount and gas|Wallet reservation is not covered|Signed request is no longer covered|needs gas to return|insufficient funds|Add funds for settlement gas/i.test(text)) return "Settlement blocked: insufficient funds for gas. Add funds to the paying wallet and contact support to resume settlement.";
    if (/gas.*(?:configured policy|configured cap|reserved allowance)|Base fees exceed/i.test(text)) return "Settlement blocked: network fees exceed the allowed gas budget. Operator assistance is required.";
    current = item.cause;
  }
  return "Pending verification";
}

export function withdrawalFailure(error:unknown){
  const text=error instanceof Error?error.message:"";
  if(/Not enough Base ETH for withdrawal gas/i.test(text))return "Withdrawal needs more Base ETH for gas. The transfer remains protected.";
  if(/fee.*(?:cap|limit|allowance)|gas.*(?:policy|allowance)/i.test(text))return "Withdrawal is waiting for a network fee recheck. It will retry automatically.";
  const message=settlementFailure(error);
  return message.replace(/Settlement/g,"Withdrawal").replace(/settlement/g,"withdrawal");
}
