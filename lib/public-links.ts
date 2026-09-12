import { ARC_BOT_SITE_URL } from "./project-config";

export const ARC_EXPLORER_URL = "https://www.arcexplorer.org";
export function tokenClarificationWithoutWallet(text: string): string | undefined {
  if (!/^(?:Action needed: )?(?:Token .+ is not in the index\.|More than one (?:indexed token|token|token in your wallet) uses )/.test(text)) return undefined;
  return text.replace(/\r?\nYour wallet:[^\r\n]*/g, "").trim();
}
export function arcWalletUrl(address: string, requestId?: string) {
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw Error("Invalid wallet address");
  return `${ARC_BOT_SITE_URL}/wallet/${address}${requestId ? `?request=${encodeURIComponent(requestId)}` : ""}`;
}
export function arcTransactionUrl(hash: string) {
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw Error("Invalid Arc transaction hash");
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}
export function arcAddressUrl(address: string) {
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw Error("Invalid Arc address");
  return `${ARC_EXPLORER_URL}/address/${address}`;
}
export function arcCommandResponse(message: string, address: string, hash?: string, chainId:5042|8453=5042) {
  const clarification = tokenClarificationWithoutWallet(message);
  if (clarification !== undefined) return clarification;
  const links = [hash && /^0x[0-9a-f]{64}$/i.test(hash) ? `Transaction: ${chainId===8453?`https://basescan.org/tx/${hash}`:arcTransactionUrl(hash)}` : "", `Your wallet: ${arcWalletUrl(address)}`];
  return [message, ...links.filter(line => line && !message.includes(line.split(": ").slice(1).join(": ")))].join("\n");
}
