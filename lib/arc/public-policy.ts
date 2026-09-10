const commands = new Set(["create_wallet", "show_wallet", "show_balance", "show_burned", "buy", "sell", "swap_token_for_token", "send", "burn", "buy_and_send", "buy_and_burn"]);
export function arcPublicCommand(kind: string) { return commands.has(kind); }
export function arcSignerPath(path: string) {
  return ["v1/wallets", "v1/wallets/balance", "v1/tokens/metadata", "v1/tokens/burned"].includes(path);
}

export function arcPublicSource(source?: string): boolean { return source === undefined || source === "x" || source === "telegram"; }
