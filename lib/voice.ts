/** Message markers are plain text. Keep legacy recognition for persisted replies. */
export function isConfirmedReply(text: string) {
  return /^(?:Confirmed:|✅)/.test(text.trim());
}

export function replyBody(text: string) {
  return text.replace(/[’‘]/g, "'")
    .replace(/^(?:Confirmed|Failed|Unconfirmed|Action needed|Required|Pending):\s*/, "")
    .replace(/^[^a-zA-Z]+/, "").replace(/\s+/g, " ").trim();
}
