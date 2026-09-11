import { retiredSocialKind, retiredSocialRequest } from "./retired-social-commands";
import { socialAddressLinks } from "./social-address-links";
export const X_CONTRACT_CLARIFICATION_TTL_MS = 10 * 60_000;

export const X_COMMAND_HELP = "Tag @TheArgosBot with a full command.\n\nshow my wallet\nbuy 10 USDC of TICKER\nsell 100 TICKER\nswap 50% TOKEN for OTHER\nsend 10 USDC to @user\nburn 100 TICKER\n\nGuide: https://www.argosbot.io/guide";

export function duplicateTickerReply(text: string) {
  return /^Action needed: More than one (?:indexed token|token|token in your wallet) uses that ticker\. Enter the contract address\.$/.test(text);
}

export function tokenClarificationReply(text:string):{reason:"duplicate_ticker"|"unknown_ticker";ticker?:string}|null {
  const line=text.split(/\r?\n/,1)[0];
  if(duplicateTickerReply(line))return {reason:"duplicate_ticker"};
  const duplicate=/^More than one token uses (.{1,64})\. Enter its contract address\.$/.exec(line);
  if(duplicate)return {reason:"duplicate_ticker",ticker:duplicate[1]};
  const missing=/^Token (.{1,64}) is not in the index\. Enter its contract address\.$/.exec(line);
  return missing?{reason:"unknown_ticker",ticker:missing[1]}:null;
}

/** Persisted guided state must never grant authority to a new X command. */
export function retiredXWorkflow(commandKind?: string, stateJson?: string) {
  if (retiredSocialKind(commandKind)) return true;
  if (commandKind?.startsWith("guided_help") || commandKind?.startsWith("gas_resume") || commandKind === "workflow_expired") return true;
  if (!stateJson) return false;
  try {
    const state = JSON.parse(stateJson) as { type?: unknown; reason?: unknown; intent?: {command?: {kind?: string}} };
    if (retiredSocialKind(state.intent?.command?.kind)) return true;
    return state.type !== "ambiguous_token" || !["duplicate_ticker","unknown_ticker"].includes(String(state.reason));
  } catch { return true; }
}

/** Shared wallet errors must not invite an X conversation to execute a command. */
export function xCommandReply(text: string, contractClarification = false) {
  let result = text.replace(/\s*(?:Next command\.?|Anything else\?)\s*$/i, "");
  if (retiredSocialRequest(text) || /^Fees are assigned to |^Could not verify who fees are assigned|^Could not verify the fee assignment/.test(text)) return "";
  result = result.replace(/^Arc mainnet \(5042\)\r?\n/gm, "")
    .replace(/Gas paid: [0-9.,]+ USDC\.?\s*/g, "")
    .replace(/Arc Explorer:/g, "Transaction:")
    .replace(/More than one indexed token uses that ticker/g, "More than one token uses that ticker");
  const buy = /^Buy confirmed\. Input: ([0-9.,]+) USDC\. Received: ([0-9.,]+) ([^\r\n]+?)\.(?:\s|$)/.exec(result);
  const transaction = /Transaction:\s*(https:\/\/www\.arcexplorer\.org\/tx\/0x[0-9a-f]{64})(?![0-9a-f])/i.exec(result);
  if (buy && transaction) {
    return socialAddressLinks(`Bought ${buy[2]} ${buy[3]} for ${buy[1]} USDC.\n\nTransaction: ${transaction[1]}`);
  }
  const burn = /^(Burned [^\r\n]+)(?:\r?\n|$)/.exec(result);
  if (burn && transaction) return socialAddressLinks(`${burn[1]}\n\nTransaction: ${transaction[1]}`);
  result = result.replace(/reply\s+[“"']resume[”"']/gi, "submit the full command again");
  if (contractClarification && tokenClarificationReply(result)) {
    return socialAddressLinks(result.replace(/Enter (?:the|its) contract address\./, "Reply with the contract address and tag @TheArgosBot."));
  }
  if (!contractClarification) {
    result = result.replace("Reply with its contract address to check how much has been burned.", "Submit a full burned-token query with its contract address.");
    result = result.replace(/Reply with a CA to buy this token\./gi, "Submit a full buy command with its contract address.");
    result = result.replace(/(?:then )?reply with (?:it|the contract address|a contract address|the CA)(?: again shortly)?\./gi, "submit the full command with the contract address.");
  }
  return socialAddressLinks(result);
}

export function retiredXPrompt(kind: string, commandKind?: string, stateJson?: string) {
  // Keep previously queued transaction receipts; they do not authorize a follow-up.
  if (kind === "guided_execution" && !stateJson && commandKind?.startsWith("guided_help")) return false;
  return kind === "guided_reply" || retiredXWorkflow(commandKind, stateJson);
}
