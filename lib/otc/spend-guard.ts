import { repository } from "./repository.ts";

/** Older/operator executors cannot bypass website reservations for managed wallets. */
export async function assertOutsideOtcWallet(address: string, chainId: 5042 | 8453) {
  if (process.env.OTC_ENABLED === "true") throw new Error("Use the website executor while OTC reservations are enabled.");
  if (!process.env.OTC_SERVICE_SECRET && process.env.OTC_ENABLED !== "true") return;
  const record = await repository().read({id:`wallet:${chainId}:${address.toLowerCase()}`});
  if(record) throw new Error("This wallet uses website fund reservations. Use the website to spend its available funds.");
}
