/** Public status text must never contain RPC URLs, request bodies, or credentials. */
export function settlementFailure(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    if (typeof current !== "object") break;
    const item = current as { message?: unknown; details?: unknown; errorType?: unknown; cause?: unknown };
    const text = [item.message, item.details, item.errorType].filter(v => typeof v === "string").join(" ");
    if(/Signed transaction is underfunded/i.test(text))return 'The signed transaction has insufficient funds. It is not cancelled and may execute if funds return. Resolve it before submitting another.';
    if(/External transaction is awaiting finality/i.test(text))return 'Another transaction used this nonce. Waiting for finality before releasing this request.';
    if(/External transaction may have funded escrow/i.test(text))return 'External escrow payment differs from this request. Operator reconciliation is required before another payment.';
    if(/Checking the external transaction|External nonce change|External replacement receipt/i.test(text))return 'Checking the external transaction that replaced this request.';
    if(/Wallet balance changed/i.test(text))return 'Wallet balance changed. The requested amount and gas are no longer covered.';
    if(/Token approval or input balance changed|trade no longer simulates/i.test(text))return 'Token balance, approval or price changed. Review a new request.';
    if(/Base broadcast was not acknowledged/i.test(text))return "Base submission is retrying. Payment confirmation is pending.";
    if (/wallet authentication|wallet_authentication/i.test(text)) return "Wallet signing needs operator attention. This request remains unresolved.";
    if (/Nonce consumed|Wallet nonce changed|Nonce changed\. Reconcile|Another transaction changed/i.test(text)) return "Another transaction changed the wallet nonce. Checking the original request.";
    if (/rate limit|too many requests|429/i.test(text)) return "Base RPC is busy. Settlement will retry automatically.";
    if (/Gas exceeds the escrow allowance/i.test(text)) return "Settlement paused: gas exceeds this order's allowance.";
    if (/recovery allowance is already used/i.test(text)) return "Settlement blocked: gas recovery allowance is exhausted. Operator assistance is required.";
    if (/gas.*(?:recovery allowance|small network allowance)|Gas recovery exceeds/i.test(text)) return "Settlement blocked: gas exceeds the automatic recovery limit. Operator assistance is required.";
    if (/Not enough funds for the amount and gas|Wallet reservation is not covered|Signed request is no longer covered|insufficient funds/i.test(text)) return "The paying wallet no longer covers the required amount and gas. Check its balance and transaction history.";
    if(/needs gas to return|Add funds for settlement gas/i.test(text))return 'Settlement needs additional gas in the paying wallet.';
    if (/gas.*(?:configured policy|configured cap|reserved allowance)|Base fees exceed/i.test(text)) return "Settlement blocked: network fees exceed the allowed gas budget. Operator assistance is required.";
    current = item.cause;
  }
  return "Pending verification";
}

export function withdrawalFailure(error:unknown){
  const text=error instanceof Error?error.message:"";
  if(/Not enough Base ETH for withdrawal gas/i.test(text))return "Withdrawal needs more Base ETH for gas. Check transaction history before submitting another transfer.";
  if(/fee.*(?:cap|limit|allowance)|gas.*(?:policy|allowance)/i.test(text))return "Withdrawal is waiting for a network fee recheck. It will retry automatically.";
  const message=settlementFailure(error);
  return message.replace(/Settlement/g,"Withdrawal").replace(/settlement/g,"withdrawal");
}
