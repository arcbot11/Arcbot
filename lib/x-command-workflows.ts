export const X_CONTRACT_CLARIFICATION_TTL_MS = 10 * 60_000;

export const X_COMMAND_HELP = "Tag @ArcChainBot with a full command.\n\nshow my wallet\nbuy 10 USDC of TICKER\nsell 100 TICKER\nswap 50% TOKEN for OTHER\nsend 10 USDC to @user\nburn 100 TICKER\n\nGuide: https://www.arcchainbot.io/guide";

export function duplicateTickerReply(text: string) {
  return /^Action needed: More than one (?:indexed token|token in your wallet) uses that ticker\. Enter the contract address\.$/.test(text);
}

/** Persisted guided state must never grant authority to a new X command. */
export function retiredXWorkflow(commandKind?: string, stateJson?: string) {
  if (commandKind?.startsWith("guided_help") || commandKind?.startsWith("gas_resume") || commandKind === "workflow_expired") return true;
  if (!stateJson) return false;
  try {
    const state = JSON.parse(stateJson) as { type?: unknown; reason?: unknown };
    return state.type !== "ambiguous_token" || state.reason !== "duplicate_ticker";
  } catch { return true; }
}

/** Shared wallet errors must not invite an X conversation to execute a command. */
export function xCommandReply(text: string, contractClarification = false) {
  let result = text.replace(/\s*(?:Next command\.?|Anything else\?)\s*$/i, "");
  result = result.replace(/reply\s+[“"']resume[”"']/gi, "submit the full command again");
  if (contractClarification && duplicateTickerReply(result)) {
    return result.replace("Enter the contract address.", "Reply with the contract address and tag @ArcChainBot.");
  }
  if (!contractClarification) {
    result = result.replace("Reply with its contract address to check how much has been burned.", "Submit a full burned-token query with its contract address.");
    result = result.replace(/Reply with a CA to buy this token\./gi, "Submit a full buy command with its contract address.");
    result = result.replace(/(?:then )?reply with (?:it|the contract address|a contract address|the CA)(?: again shortly)?\./gi, "submit the full command with the contract address.");
  }
  return result;
}

export function retiredXPrompt(kind: string, commandKind?: string, stateJson?: string) {
  // Keep previously queued transaction receipts; they do not authorize a follow-up.
  if (kind === "guided_execution" && !stateJson && commandKind?.startsWith("guided_help")) return false;
  return kind === "guided_reply" || retiredXWorkflow(commandKind, stateJson);
}
