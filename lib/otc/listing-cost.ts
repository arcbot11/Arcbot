import { SERVICE_FEE_BPS } from "./model";

/** Fee applies to the seller's price including premium. Network gas is separate. */
export function listingCostPercent(premiumBps: number) {
  const scaled = (10_000 + premiumBps) * (10_000 + SERVICE_FEE_BPS);
  return { total: scaled / 1_000_000, aboveFaceValue: (scaled - 100_000_000) / 1_000_000 };
}
