/** Public Argos Bot identity and transaction policy. Credentials stay in the environment. */
export const ARC_BOT_TELEGRAM_USERNAME = "The_ArgosBot";
export const ARC_BOT_TELEGRAM_USER_ID = "8280311402";
export const ARC_BOT_TELEGRAM_URL = "https://t.me/The_ArgosBot";
export const ARC_BOT_USERNAME = "TheArgosBot";
export const ARC_BOT_X_USER_ID = "2097696306135220226";
export const ARC_BOT_X_URL = "https://x.com/TheArgosBot";
export const ARC_BOT_SITE_URL = "https://www.argosbot.io";
export const OTC_FEE_RECIPIENT = "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC"; // @arctos_arc
export const ARC_GAS_POLICY = Object.freeze({ maxGas: "1000000", maxFeePerGas: "1000000000000" });
export const BASE_GAS_POLICY = Object.freeze({ maxGas: "1000000", maxFeePerGas: "1000000000000", maxTotalFeeWei: "1000000000000000" });

export function otcWorkerUrl(site = ARC_BOT_SITE_URL) {
  const origin = new URL(site);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("Configure an HTTPS website origin for the wallet worker.");
  return new URL("/api/otc/worker", origin).href;
}
