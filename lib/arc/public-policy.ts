import { LAUNCH_EXECUTION_ENABLED } from "../launches/policy";
const commands = new Set(["claim_fees", "create_wallet", "show_wallet", "show_balance", "buy", "sell", "swap_token_for_token", "send", "burn", "buy_and_send", "buy_and_burn"]);
export function arcPublicCommand(kind: string) { return commands.has(kind) || kind === "launch" && LAUNCH_EXECUTION_ENABLED; }
export function arcSignerPath(path: string) {
  return ["v1/wallets", "v1/wallets/balance", "v1/tokens/metadata"].includes(path);
}

export function arcPublicSource(source?: string): boolean { return source === undefined || source === "x" || source === "telegram"; }
