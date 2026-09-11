import {tokenPattern} from "./token-pattern";
/** Normalize explicit command wording only. Keep every amount, asset and recipient.
 * Negation, conditions and quoted examples remain for the authority checks. */
export function normalizeXCommandLanguage(text:string){
  let result=text.replace(/(?:^|\s)@TheArgosBot\b/gi," ").trim();
  result=result.replace(/^(?:(?:hey|hi|hello|yo|gm)[,!:\s]+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?=(?:buy|purchase|grab|pick\s+up|sell|dump|unload|send|transfer|move|burn|swap|convert|exchange|trade|spend)\b)/i,"");
  result=result.replace(/^(?:purchase|grab(?:\s+me)?|pick\s+up)\s+/i,"buy ")
    .replace(/^(?:dump|unload|cash\s+out)\s+/i,"sell ")
    .replace(/^(?:transfer|move|forward|ship)\s+/i,"send ")
    .replace(/^(?:convert|exchange|trade)\s+/i,"swap ");
  // A token-first buy is unambiguous only with an explicit dollar/USDC budget.
  result=result.replace(/^buy\s+(\$?(?:0x[a-f0-9]{40}|[a-z][a-z0-9_]{0,31}))\s+(?:for|with|using)\s+(\$[0-9][0-9,.]*|[0-9][0-9,.]*\s+(?:USDC|USD|dollars?))(?=\s|[.!?]|$)/i,"buy $2 of $1");
  result=result.replace(/^(sell|send|burn|swap)\s+(?:a\s+|one\s+)?quarter\s+(?:of\s+)?(?:my\s+)?/i,"$1 25% ")
    .replace(/^(sell|send|burn|swap)\s+(?:half|half\s+of)\s+(?:of\s+)?(?:my\s+)?/i,"$1 50% ")
    .replace(/^(sell|send|burn|swap)\s+three\s+quarters\s+(?:of\s+)?(?:my\s+)?/i,"$1 75% ");
  return result;
}

/** Fast parsing is limited to a complete instruction, not a command buried in
 * narration or extra conditions. Other language still uses grounded extraction. */
export function completeXCommand(text:string){
  const number="(?:[0-9][0-9,]*(?:\\.[0-9]+)?|\\.[0-9]+)";
  const token="\\$?(?:0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_]{0,31})";
  const recipient="(?:@[a-zA-Z0-9_]{1,15}|0x[a-fA-F0-9]{40})";
  const dollars=`(?:\\$${number}|${number}\\s+(?:USDC|USD|dollars?))`;
  const quantity=`(?:${dollars}|${number}\\s*%?|all)`;
  const asset=`(?:worth\\s+)?(?:of\\s+)?(?:my\\s+)?${token}`;
  const end="(?:\\s+(?:with\\s+)?(?:[0-9]+(?:\\.[0-9]+)?%\\s+slippage|slippage\\s+[0-9]+(?:\\.[0-9]+)?%))?(?:,?\\s+(?:please|thanks|thank you))?[.!?]*$";
  return [
    `^buy\\s+${dollars}\\s+${asset}(?:\\s+and\\s+(?:burn(?:\\s+it)?|send(?:\\s+it)?\\s+to\\s+${recipient}))?`,
    `^(?:sell|burn)\\s+${quantity}\\s+${asset}`,
    `^send\\s+${quantity}\\s+${asset}\\s+to\\s+${recipient}`,
    `^swap\\s+${quantity}\\s+${asset}\\s+(?:for|to|into)\\s+${token}`,
  ].some(pattern=>tokenPattern(pattern+end,"i").test(text));
}
