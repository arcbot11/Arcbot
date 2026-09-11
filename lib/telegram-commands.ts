import { ARC_BOT_TELEGRAM_USERNAME } from "./project-config";
import type { WalletCommand } from "../convex/walletCommands";

export const TELEGRAM_HELP = "Argos Bot\nYour Arc Chain wallet.\n\nUse the buttons or a full /command. Arc gas is paid in USDC. Token names accept a ticker or contract address. Sends require a full wallet address.";
export const TELEGRAM_FORMATS: Record<string, string> = {
  buy: "Buy with Arc USDC:\n/buy 10 USDC ARGOS\n/buy $10 ARGOS",
  sell: "Sell for Arc USDC:\n/sell 100 ARGOS\n/sell $10 ARGOS\n/sell 50% ARGOS\n/sell all ARGOS",
  swap: "Swap Arc tokens:\n/swap 100 ARGUS for TOKEN\n/swap $10 ARGUS for TOKEN\n/swap 50% ARGUS for TOKEN\n/swap all ARGUS for TOKEN",
  send: "Send Arc tokens:\n/send 10 USDC to ADDRESS\n/send 100 ARGUS to ADDRESS\n/send $10 ARGUS to ADDRESS\n/send 50% ARGUS to ADDRESS\nReplace ADDRESS with a full 0x wallet address.",
  withdraw: "Withdraw Base ETH:\n/withdraw 0.001 ETH to ADDRESS\n/withdraw $10 to ADDRESS\nReplace ADDRESS with a full 0x wallet address. Base gas is paid in ETH.",
  burn: "Burn Arc tokens. Burns are permanent.\n/burn 100 ARGUS",
};
export const TELEGRAM_MENU = { inline_keyboard: [
  [{ text: "Wallet", callback_data: "/wallet" }, { text: "Balances", callback_data: "/balance" }],
  [{ text: "Buy", callback_data: "/buy" }, { text: "Sell", callback_data: "/sell" }, { text: "Swap", callback_data: "/swap" }],
  [{ text: "Send", callback_data: "/send" }, { text: "Burn", callback_data: "/burn" }],
  [{ text: "Withdraw Base ETH", callback_data: "/withdraw" }],
  [{ text: "Help", callback_data: "/help" }, { text: "Unlink X", callback_data: "/unlink" }],
] };
const walletNavigation = ["createtg", "usetg", "usex", "link"];
export function telegramMenu(state: { native: unknown; link: unknown; selected: string | null }) {
  const rows = state.native || state.link ? TELEGRAM_MENU.inline_keyboard.slice(0, -1).concat([[{ text: "Help", callback_data: "/help" }]]) : [];
  if (!state.native) rows.push([{ text: "Create TG Linked Wallet", callback_data: "/createtg" }]);
  if (!state.link) rows.push([{ text: "Link X", callback_data: "/link" }]);
  if (state.native && state.link) rows.push([{ text: state.selected === "tg" ? "Switch to X Wallet" : "Switch to TG Wallet", callback_data: state.selected === "tg" ? "/usex" : "/usetg" }]);
  if (state.link) rows.push([{ text: "Unlink X", callback_data: "/unlink" }]);
  return { inline_keyboard: rows };
}
export function telegramWalletLabel(selected: string | null, username?: string | null) {
  return selected === "tg" ? "You are using your TG linked wallet" : selected === "x" ? `You are using your X linked wallet${username ? ` for @${username.replace(/^@/, "")}` : ""}` : "Choose a wallet for Telegram. A TG wallet is permanently linked to your Telegram account.";
}
const commands = new Set(["start", "help", "link", "unlink", "wallet", "balance", ...walletNavigation, ...Object.keys(TELEGRAM_FORMATS)]);
export function telegramInput(text: string, callback = false, username = ARC_BOT_TELEGRAM_USERNAME) {
  const match = text.trim().match(/^\/([a-z]+)(?:@([a-z0-9_]+))?(?:\s+([^\r\n]+))?$/i);
  if (!match || !commands.has(match[1].toLowerCase())) return null;
  if (match[2] && (!username || match[2].toLowerCase() !== username.replace(/^@/, "").toLowerCase())) return null;
  const name = match[1].toLowerCase(), args = match[3]?.trim() || "";
  // Callback payloads are navigation only. They never carry transaction arguments.
  if (callback && (args || !(walletNavigation.includes(name) || TELEGRAM_MENU.inline_keyboard.flat().some(b => b.callback_data === `/${name}`)))) return null;
  return { name, args };
}

const token = "(0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9_]{0,31})";
const number = "((?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+))";
const slippageBps = 100;
/** Anchored formats only: no AI, inferred amounts, or prior-message context. */
export function telegramWalletCommand(name: string, args: string): WalletCommand | null {
  if (name === "wallet") return args ? null : { kind: "show_wallet" };
  if (name === "balance") return !args ? { kind: "show_balance" } : new RegExp(`^${token}$`).test(args) ? { kind: "show_balance", token: args } : null;
  let match: RegExpMatchArray | null;
  if (name === "withdraw") {
    match=args.match(/^(?:(\d+(?:\.\d+)?|\.\d+)\s+ETH|\$(\d+(?:\.\d+)?|\.\d+))\s+to\s+(0x[a-fA-F0-9]{40})$/i);
    if(!match)return null;
    const amount=match[1]||match[2];
    if(!(Number(amount)>0)||!Number.isFinite(Number(amount)))return null;
    return {kind:"send",chainId:8453,amount,unit:match[1]?"eth":"usd",recipient:match[3]};
  }
  if (name === "buy") {
    match = args.match(new RegExp(`^(?:\\$${number}|${number}\\s+USDC)\\s+(?:of\\s+)?${token}$`, "i"));
    if (!match) return null;
    const amount = match[1] || match[2];
    if (!(Number(amount) > 0) || !Number.isFinite(Number(amount))) return null;
    const base = { amount, unit: "usd" as const, token: match[3], slippageBps };
    return { kind: "buy", ...base };
  }
  if (!["sell", "swap", "send", "burn"].includes(name)) return null;
  const suffix = name === "swap" ? `\\s+(?:for|to)\\s+${token}` : name === "send" ? "\\s+to\\s+(0x[a-fA-F0-9]{40})" : "";
  match = args.match(new RegExp(`^(\\$)?(${number.slice(1,-1)}|all)(%)?\\s+${token}${suffix}$`, "i"));
  if (!match) return null;
  const all = match[2].toLowerCase() === "all", amount = all ? "100" : match[2];
  const unit = match[1] ? "usd" : all || match[3] ? "percent" : "token";
  if ((match[1] && (all || match[3])) || !(Number(amount) > 0) || !Number.isFinite(Number(amount)) || (unit === "percent" && Number(amount) > 100)) return null;
  if (name === "swap") return { kind: "swap_token_for_token", amount, unit, fromToken: match[4], toToken: match[5], slippageBps };
  if (name === "send") return { kind: "send", amount, unit, token: match[4], recipient: match[5] };
  if (name === "burn") return { kind: "burn", amount, unit, token: match[4] };
  return { kind: "sell", amount, unit, token: match[4], slippageBps };
}

export function telegramResponse(text: string) {
  return text.replace(/^(?:Confirmed: |Action needed: |Pending: )/, "")
    .replace(/reply\s+[“"']?resume[”"']?/gi, "submit the full /command again")
    .replace(/Reply with a CA to buy this token\./gi, "Use its contract address in a full /buy command.")
    .replace(/Enter the contract address\./gi, "Use the contract address in the full /command.")
    .replace(/(?:then )?reply with (?:it|its contract address|the contract address)([^.]*\.)/gi, "submit the full /command with the contract address.")
    .replace(/\s*(?:Next command\.?|Anything else\?)\s*$/i, "");
}
