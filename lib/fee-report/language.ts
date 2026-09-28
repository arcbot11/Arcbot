/** Anchored present requests only: quoted, conditional and negated instructions do not match. */
export function feeRequest(text:string): {kind:"check_fees"|"claim_fees";token?:string}|null {
  const clean=text.trim().replace(/^(?:@TheArgosBot\s+)?/i,"").replace(/^(?:(?:hey|hi)[, ]+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?/i,"").replace(/\s+please[.!?]?$/i,"");
  const m=clean.match(/^(check|show|show me|get|claim|collect)(?:\s+the)?\s+(?:creator\s+)?fees(?:\s+(?:for|from|on))?(?:\s+\$?(0x[a-f\d]{40}|[a-z\d][a-z\d_]{0,31}))?[.!?]?$/i)
    ??clean.match(/^(fee report)\s+(?:for|on)\s+\$?(0x[a-f\d]{40}|[a-z\d][a-z\d_]{0,31})[.!?]?$/i);
  if(!m)return null;
  return {kind:/^(claim|collect)$/i.test(m[1])?"claim_fees":"check_fees",...(m[2]?{token:m[2]}:{})};
}
