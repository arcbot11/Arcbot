import { z } from "zod";
export const CRA_API = "https://api.cra-agent.tech";
const count = z.number().int().nonnegative();
const infoSchema = z.object({
  ok: z.literal(true),
  network: z.literal("eip155:5042"),
  scheme: z.literal("exact"),
  asset: z.string(),
  dailyCap: count,
  sharedDailyCap: count,
  sharedSettledToday: count,
});
const sellerSchema = z.object({
  registered: z.boolean(),
  settledToday: count,
  dailyCap: count,
});
/** Read-only readiness check. Never registers a seller or signs an authorization. */
export async function directAvailability(
  payTo: string,
  fetcher: typeof fetch = fetch,
) {
  try {
    const responses = await Promise.all(
      ["/v1/facilitator", `/v1/facilitator/sellers/${payTo}`].map((path) =>
        fetcher(`${CRA_API}${path}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        }),
      ),
    );
    if (responses.some((r) => !r.ok))
      return { available: false, reason: "facilitator_unavailable" };
    const info = infoSchema.parse(await responses[0].json()),
      seller = sellerSchema.parse(await responses[1].json());
    if (
      info.asset.toLowerCase() !== "0x3600000000000000000000000000000000000000"
    )
      return { available: false, reason: "unexpected_asset" };
    if (!seller.registered)
      return { available: false, reason: "seller_registration_required" };
    if (
      seller.settledToday >= Math.min(seller.dailyCap, info.dailyCap) ||
      info.sharedSettledToday >= info.sharedDailyCap
    )
      return { available: false, reason: "daily_allowance_exhausted" };
    return {
      available: true,
      reason: "ready",
      sellerRemaining:
        Math.min(seller.dailyCap, info.dailyCap) - seller.settledToday,
      sharedRemaining: info.sharedDailyCap - info.sharedSettledToday,
    };
  } catch {
    return { available: false, reason: "facilitator_unavailable" };
  }
}
export function registrationMessage(payTo: string, issuedAt: string) {
  return [
    "CRA AGENT facilitator",
    "",
    "Register this wallet as a seller. Payments to it may be settled by the CRA facilitator on Arc, within its daily allowance. No funds move by signing this.",
    "",
    `Wallet: ${payTo}`,
    `Issued: ${issuedAt}`,
  ].join("\n");
}
