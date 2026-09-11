import { parseBurnedTokenInquiry } from "./burned-token-inquiry";

export function retiredSocialKind(kind?: string) {
  return ["show_burned", "claim_fees", "reassign_fees", "upgrade_fees", "fee_assignment_info"].includes(kind ?? "");
}

export function retiredSocialRequest(text: string) {
  const clean = text.replace(/^(?:\s*@\w+\s*)+/, "").trim();
  return Boolean(parseBurnedTokenInquiry(clean))
    || /\bwho\b.*\b(?:fees?|claim)\b/i.test(clean)
    || /\b(?:claim|collect|reassign|upgrade)\b[^.!?\n]*\b(?:fees?|revenue|rewards?|everything)\b/i.test(clean)
    || /^(?:please\s+)?claim\b/i.test(clean);
}
