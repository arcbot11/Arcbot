import { ARC_BOT_SITE_URL } from "./project-config";

export const ARC_EXPLORER_URL = "https://www.arcexplorer.org";
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
export function arcCommandResponse(message: string, address: string, hash?: string) {
  const links = [hash && /^0x[0-9a-f]{64}$/i.test(hash) ? `Arc Explorer: ${arcTransactionUrl(hash)}` : "", `Your wallet: ${arcWalletUrl(address)}`];
  return [message, ...links.filter(line => line && !message.includes(line.split(": ").slice(1).join(": ")))].join("\n");
}
