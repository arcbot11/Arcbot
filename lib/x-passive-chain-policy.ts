import { xBotUsername } from "./x-bot-identity";
import { directPostCommandText } from "./x-direct-post-policy";
import { completeXCommand, normalizeXCommandLanguage } from "./x-command-language";
type XReference = { type: "replied_to" | "quoted" | "retweeted"; id: string };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Identifies replies where the bot is only an automatically carried member of
 * a leading participant block (or is absent from the direct text entirely).
 * A sole @TheArgosBot invocation, or another direct mention later in the
 * post, remains explicit.
 */
export function isPassiveBotChainReply(text: string, references: XReference[] | undefined, botUsername = xBotUsername()) {
  if (!references?.some((reference) => reference.type === "replied_to")) return false;
  const bot = new RegExp(`@${escapeRegExp(botUsername)}\\b`, "ig");
  const mentions = [...text.matchAll(bot)];
  if (!mentions.length) return true;
  // X carries a participant into a reply prefix once. If the author includes
  // the bot again in that same leading block, treat the repeated mention as
  // an explicit invocation even when X has normalized both mentions ahead of
  // the body text.
  if (mentions.length >= 2) return false;
  const leading = text.trimStart().match(/^(?:@[A-Za-z0-9_]{1,15}(?:[\s,:-]+|$))+/)?.[0] || "";
  const leadingHandles = leading.match(/@[A-Za-z0-9_]{1,15}/g) || [];
  const distinctHandles = new Set(leadingHandles.map((handle) => handle.toLowerCase()));
  if (distinctHandles.size < 2 || !bot.test(leading)) return false;
  bot.lastIndex = 0;
  return !bot.test(text.trimStart().slice(leading.length));
}

/**
 * Launches require an explicit bot mention in the current post. In a reply,
 * the bot appearing only inside X's multi-participant prefix is inherited and
 * does not count; a sole leading invocation or a later mention does.
 */
export function hasExplicitBotMention(text: string, references: XReference[] | undefined, botUsername = xBotUsername()) {
  if (!new RegExp(`@${escapeRegExp(botUsername)}\\b`, "i").test(text)) return false;
  if (!isPassiveBotChainReply(text, references, botUsername)) return true;
  // X does not identify which leading reply handles the author typed. A full
  // current-post wallet command must not disappear merely because another
  // participant precedes the bot. This only admits parsing: normal intent,
  // ownership, funds, execution and duplicate-request checks still apply.
  const body = directPostCommandText(text, botUsername);
  if (completeXCommand(normalizeXCommandLanguage(body))) return true;
  return /^(?:please\s+)?(?:show(?:\s+me)?|give\s+me|what(?:'s|\s+is)|where(?:'s|\s+is))\s+my\s+(?:wallet|wallet\s+address|balance|balances|holdings|portfolio)[.!?]*$/i.test(body);
}

/** Current post only. Links, parent posts and inherited thread participants cannot opt in. */
export function explicitReplyRequest(text: string, parentPostId?: string) {
  const body=text.replace(/https?:\/\/\S+/gi, "");
  if(!new RegExp(`(^|[^A-Za-z0-9_@/])@${escapeRegExp(xBotUsername())}(?![A-Za-z0-9_])`,"i").test(body))return false;
  return hasExplicitBotMention(body,parentPostId?[{type:"replied_to",id:parentPostId}]:undefined);
}

/**
 * Launch authorization is satisfied by a direct invocation in the current
 * post or by the platform-verifiable fact that its direct parent is the bot.
 * Intent parsing must still classify the current post as a launch before this
 * authorization is consulted.
 */
export function launchPostAuthorized(
  text: string,
  references: XReference[] | undefined,
  botParentAuthorized: boolean,
  botUsername = xBotUsername(),
) {
  return botParentAuthorized || hasExplicitBotMention(text, references, botUsername);
}

/**
 * Applies transaction/wallet-only reply handling to every deeper reply and to
 * any first-level reply where the bot is merely inherited from the thread.
 */
export function shouldRestrictChainReply(
  text: string,
  references: XReference[] | undefined,
  parentIsReply: boolean,
  botUsername = xBotUsername(),
) {
  if (hasExplicitBotMention(text, references, botUsername)) return false;
  return parentIsReply || isPassiveBotChainReply(text, references, botUsername);
}
