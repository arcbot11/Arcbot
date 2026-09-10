import { repository } from "./repository.ts";

/** Older/operator executors cannot bypass website reservations for managed wallets. */
export async function assertOutsideOtcWallet(address: string, chainId: 5042 | 8453) {
  if (process.env.OTC_ENABLED === "true") throw new Error("Use the website executor while OTC reservations are enabled.");
  // Missing storage configuration is not evidence that this wallet has no holds.
  // Fail closed even when OTC is disabled: existing listings can still be locked.
  const record = await repository().read({id:`wallet:${chainId}:${address.toLowerCase()}`});
  if(record) throw new Error("This wallet uses website fund reservations. Use the website to spend its available funds.");
}
