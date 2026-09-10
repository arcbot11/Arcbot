/** Match creation requests, not token symbols that happen to use these words. */
export function disabledCreationRequest(text: string): boolean {
  const clean=text.replace(/"[^"\n]*"|“[^”\n]*”/g," ").replace(/\$[\w]+|0x[a-fA-F0-9]{40}/g,"TOKEN").replace(/^\s*(?:@\w+\s+)*/,"").trim();
  return /^(?:launch(?:es|ing)?|deploy(?:ment|ing)?)\b/i.test(clean)
    || /\b(?:please|and|then|also|can you|could you|would you|help me|i want to|i would like to)\s+(?:please\s+)?(?:launch|deploy)\b/i.test(clean)
    || /\b(?:how|help|explain|about|support|supported|can i|can you|do you|what|instructions|guide)\b[^.!?\n]*\b(?:launch(?:es|ing)?|deploy(?:ment|ing)?)\b/i.test(clean)
    || /\b(?:create|make)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:token|coin)\b/i.test(clean)
    || /\b(?:new token|token request|need a coin|need a token deployed)\b/i.test(clean);
}
export function disabledCreationKind(kind: unknown): boolean {
  return typeof kind === "string" && /(?:^|[_:])launch(?:$|[_:])/.test(kind);
}
export function suppressCreationReply(text: string): boolean {
  return !text.trim() || disabledCreationRequest(text)
    || /\/launch\/|\b(?:token|coin)\s+(?:was\s+|is\s+)?launched\b|\blaunch\s+(?:confirmed|successful|completed|request|workflow|format|integration)\b|\bcommands:[^\n]*\blaunch\b/i.test(text);
}
