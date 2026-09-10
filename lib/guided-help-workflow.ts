import { tokenPattern } from "./token-pattern";
export const GUIDED_HELP_TTL_MS = 10 * 60_000;

export const GENERAL_GUIDED_HELP_MESSAGE =
  "Commands: wallet, balance, buy, sell, swap, send, burn, claim fees.\n\nEnter a command.";

export const X_GENERAL_GUIDED_HELP_MESSAGE =
  "Commands: wallet, balance, buy, sell, swap, send, burn.\n\nEnter a command.";

export const GUIDED_HELP_COMPLETION_PROMPT = "Next command.";
export const GUIDED_REASSIGN_TOKEN_PROMPT =
  "Enter the token ticker or contract address.";

export type GuidedHelpOperation =
  | "root"
  | "wallet"
  | "balance"
  | "buy"
  | "sell"
  | "swap"
  | "send"
  | "burn"
  | "launch"
  | "claim"
  | "claim_fees"
  | "reassign_fees";

const PREFIX = "guided_help";
const PENDING_PREFIX = "guided_help_pending";

export function guidedHelpCommandKind(operation: GuidedHelpOperation) {
  return operation === "root" ? PREFIX : `${PREFIX}:${operation}`;
}

export function guidedHelpPendingCommandKind(operation: string) {
  return `${PENDING_PREFIX}:${operation}`;
}

export function isGuidedHelpPendingCommandKind(kind?: string) {
  return Boolean(kind?.startsWith(`${PENDING_PREFIX}:`));
}

export function withGuidedHelpCompletion(message: string) {
  const trimmed = message.trim();
  return trimmed.endsWith(GUIDED_HELP_COMPLETION_PROMPT)
    ? trimmed
    : `${trimmed}\n\n${GUIDED_HELP_COMPLETION_PROMPT}`;
}

export function isGuidedHelpCompletion(message: string) {
  // Recognize completed workflows saved before the voice change.
  return message.trim().endsWith(GUIDED_HELP_COMPLETION_PROMPT) || message.trim().endsWith("Anything else?");
}

export function guidedHelpOperationFromCommandKind(kind?: string): GuidedHelpOperation | null {
  if (kind === PREFIX) return "root";
  if (!kind?.startsWith(`${PREFIX}:`)) return null;
  const operation = kind.slice(PREFIX.length + 1);
  return ["wallet", "balance", "buy", "sell", "swap", "send", "burn", "launch", "claim", "claim_fees", "reassign_fees"].includes(operation)
    ? operation as GuidedHelpOperation
    : null;
}

export function guidedHelpPrompt(operation: Exclude<GuidedHelpOperation, "root">) {
  const prompts: Record<Exclude<GuidedHelpOperation, "root">, string> = {
    wallet: "Open your wallet. Create one if needed.",
    balance: "Enter a token or contract address. Example: “ETH” or “ARCBOT.”",
    buy: "Enter the buy amount and token. Example: “$5 of ARCBOT.”",
    sell: "Enter the sell amount and token. Example: “100 ARCBOT” or “all ARCBOT.”",
    swap: "Enter the amount, input token, and output token. Example: “$25 of ETH for USDG.”",
    send: "Enter the amount, token, and recipient. Example: “10 ARCBOT to @user.”",
    burn: "Enter the burn amount and token. Example: “100 ARCBOT.”",
    launch: "",
    claim: "Select creator fees. Enter “all” or provide a ticker or contract address.",
    claim_fees: "Select creator fees. Enter “all” or provide a ticker or contract address for one token.",
    reassign_fees: "Reply with “Reassign fees to user,” “Reassign fees to ADDRESS,” or “Reassign fees to holders.”",
  };
  return prompts[operation];
}

export function guidedHelpExplanation(operation: Exclude<GuidedHelpOperation, "root">) {
  const explanations: Record<Exclude<GuidedHelpOperation, "root">, string> = {
    wallet: "Your wallet is linked to your account. Keep the address for deposits.",
    balance: "Balance lists native funds and indexed tokens. A contract address selects one asset.",
    buy: "Buy spends the specified amount on the selected token. Review the quote before execution.",
    sell: "Sell exchanges the selected token for the quoted output. Specify an amount or percentage.",
    swap: "Swap exchanges one token for another through an available route. No route means no trade.",
    send: "Send transfers tokens to the specified recipient. Verify the address and network.",
    burn: "Burn transfers tokens to the burn address. Permanent. No recovery.",
    launch: "",
    claim: "Creator fees require an eligible token.",
    claim_fees: "Claim fees from all eligible tokens or one token contract.",
    reassign_fees: "Reassign changes who receives future creator fees. Only the current controller can authorize it.",
  };
  return explanations[operation];
}

export function guidedHelpQuestion(text: string) {
  const clean = cleanChoice(text);
  return /^(?:what does (?:this|that|it) mean|what do (?:these|those) mean|can you explain|could you explain|please explain|explain (?:this|that|it)|tell me more|help me understand|why (?:is|are|does|do|would)|how (?:does|do|would|can) (?:this|that|it))\b/i.test(clean)
    || /^(?:how (?:do|can|would|should) i|what (?:can|should) i|can you (?:show|tell) me how|could you (?:show|tell) me how)\b/i.test(clean)
    || (/\?$/.test(text.trim()) && /\b(?:mean|explain|work|difference|option|choice|supported|available)\b/i.test(clean));
}

export function guidedHelpQuestionResponse(
  operation: Exclude<GuidedHelpOperation, "root">,
  answer?: string,
) {
  return `${answer?.trim() || guidedHelpExplanation(operation)}\n\n${guidedHelpPrompt(operation)}`;
}

function cleanChoice(text: string) {
  return text
    .replace(/^(?:@[A-Za-z0-9_]{1,15}[\s,:-]+)+/, "")
    .replace(/[\s.!?,;:]+$/, "")
    .replace(/^(?:please\s+)+/i, "")
    .replace(/\s+(?:please|thanks|thank you)$/i, "")
    .replace(/[\s.!?,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bare menu selections only. Complete commands continue to the normal parser. */
export function guidedHelpSelection(text: string): Exclude<GuidedHelpOperation, "root"> | null {
  const clean = cleanChoice(text);
  if (/^(?:wallet|my wallet|wallet address|show (?:me )?my wallet)$/i.test(clean)) return "wallet";
  if (/^(?:balance|balances|wallet balance|token balance|show (?:me )?my balance)$/i.test(clean)) return "balance";
  if (/^(?:buy(?:\s*back)?|purchase|i (?:want|would like) to (?:buy(?:\s*back)?|purchase))$/i.test(clean)) return "buy";
  if (/^(?:sell|i (?:want|would like) to sell)$/i.test(clean)) return "sell";
  if (/^(?:swap|i (?:want|would like) to swap)$/i.test(clean)) return "swap";
  if (/^(?:send|transfer|i (?:want|would like) to (?:send|transfer))$/i.test(clean)) return "send";
  if (/^(?:burn|i (?:want|would like) to burn)$/i.test(clean)) return "burn";
  if (/^(?:claim(?:\s+fees?)?|(?:i\s+(?:want|would\s+like)\s+to|help\s+me)\s+claim\s+fees?)$/i.test(clean)) return "claim_fees";

  if (/^(?:reassign|reassign\s+(?:my\s+|creator\s+)?fees?|fee\s+reassignment|transfer\s+(?:creator\s+)?fees?|(?:i\s+(?:want|would\s+like)\s+to|help\s+me)\s+reassign\s+(?:my\s+|creator\s+)?fees?)$/i.test(clean)) return "reassign_fees";
  return null;
}

export function guidedHelpImmediateCommand(operation: GuidedHelpOperation | null) {
  if (operation === "wallet") return "show my wallet";
  if (operation === "balance") return "show all my wallet holdings";
  return null;
}

export function guidedHelpOperationFromHelp(text: string, topic?: string): Exclude<GuidedHelpOperation, "root"> | null {
  const clean = cleanChoice(text);
  // A question inside a guided chain asks for an explanation. It does not
  // select or start an operation merely because the question names one.
  if (guidedHelpQuestion(clean)) return null;
  if (/\breassign\b[^.!?]{0,30}\bfees?\b/i.test(clean)) return "reassign_fees";

  if (/\b(?:buy(?:\s*back)?|purchase)\b/i.test(clean)) return "buy";
  if (/\bsell\b/i.test(clean)) return "sell";
  if (/\bswap\b/i.test(clean)) return "swap";
  if (/\b(?:send|transfer)\b/i.test(clean)) return "send";
  if (/\bburn\b/i.test(clean)) return "burn";
  if (/\b(?:claim|creator fees?)\b/i.test(clean)) return "claim_fees";
  if (/\b(?:balance|holdings?|portfolio)\b/i.test(clean) || topic === "balance") return "balance";
  if (/\b(?:wallet|address)\b/i.test(clean) || topic === "wallet" || topic === "fund") return "wallet";
  if (topic === "send") return "send";
  if (topic === "burn") return "burn";
  if (topic === "fees") return "claim_fees";
  return null;
}

export function guidedHelpCancelled(text: string) {
  return /^(?:cancel|stop|never mind|nevermind|cancel this|stop this)$/i.test(cleanChoice(text));
}

export function guidedHelpClaimSelection(text: string) {
  const clean = cleanChoice(text);
  if (/^(?:creator|creator fees?|token creator fees?|claim (?:my )?creator fees?)$/i.test(clean)) return "creator" as const;
  return null;
}

export type GuidedReassignState = { version: 1; type: "reassign_fees"; token?: string };

export function decodeGuidedReassignState(value?: string): GuidedReassignState | null {
  if (!value || value.length > 1_000) return null;
  try {
    const parsed = JSON.parse(value) as GuidedReassignState;
    return parsed.version === 1 && parsed.type === "reassign_fees"
      && (parsed.token === undefined || tokenPattern(/^(?:0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9]{0,31})$/).test(parsed.token))
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function guidedReassignTokenSelection(text: string) {
  const clean = cleanChoice(text).replace(/^\$/, "");
  return tokenPattern(/^(?:0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9]{0,31})$/).test(clean) ? clean : null;
}

export function guidedReassignRecipientSelection(text: string) {
  const clean = cleanChoice(text).replace(/^reassign\s+fees\s+to\s+/i, "").trim();
  if (/^holders$/i.test(clean)) return "holders";
  if (/^0x[a-fA-F0-9]{40}$/.test(clean)) return clean;
  const handle = clean.match(/^@?([A-Za-z0-9_]{1,15})$/)?.[1];
  return handle ? `@${handle}` : null;
}

function alreadyNamesOperation(text: string) {
  return /^(?:please\s+)?(?:buy|buyback|purchase|sell|swap|send|transfer|give|pay|burn|claim|collect|show|create|what|check)\b/i.test(cleanChoice(text));
}

/** Adds only the operation selected by the same user in the immediately prior prompt. */
export function guidedHelpCommandText(text: string, operation: GuidedHelpOperation) {
  const clean = cleanChoice(text);
  if (!clean || operation === "root" || guidedHelpQuestion(text)) return clean;

  if (alreadyNamesOperation(clean)) return clean;
  if (operation === "claim_fees")
    return /^(?:all|everything)$/i.test(clean) ? "claim my fees" : `claim my fees for ${clean}`;

  if (operation === "reassign_fees") return /^reassign\b/i.test(clean) ? clean : `reassign ${clean}`;
  if (operation === "balance")
    return /^(?:all|everything|all balances?|my balance|balance|balances|holdings|portfolio)$/i.test(clean)
      ? "show all my wallet holdings"
      : `what is my ${clean} balance`;
  if (operation === "wallet") return clean;
  return `${operation} ${clean}`;
}

export function guidedHelpOperationFromPrompt(text: string): GuidedHelpOperation | null {
  if (text === GENERAL_GUIDED_HELP_MESSAGE || text === X_GENERAL_GUIDED_HELP_MESSAGE) return "root";
  if (text === GUIDED_REASSIGN_TOKEN_PROMPT || text.trim().endsWith(GUIDED_REASSIGN_TOKEN_PROMPT)) return "reassign_fees";

  for (const operation of ["wallet", "balance", "buy", "sell", "swap", "send", "burn", "launch", "claim", "claim_fees", "reassign_fees"] as const)
    if (text === guidedHelpPrompt(operation) || text.trim().endsWith(guidedHelpPrompt(operation))) return operation;
  return null;
}
