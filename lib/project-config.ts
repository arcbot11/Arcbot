/** Public Arc Bot identity and transaction policy. Credentials stay in the environment. */
export const ARC_BOT_USERNAME = "ArcChainBot";
export const ARC_BOT_X_URL = "https://x.com/ArcChainBot";
export const ARC_BOT_SITE_URL = "https://www.arcchainbot.io";
export const ARC_GAS_POLICY = Object.freeze({ maxGas: "1000000", maxFeePerGas: "1000000000000" });
export const BASE_GAS_POLICY = Object.freeze({ maxGas: "1000000", maxFeePerGas: "1000000000000", maxTotalFeeWei: "1000000000000000" });

export function otcWorkerUrl(site = ARC_BOT_SITE_URL) {
  const origin = new URL(site);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("Configure an HTTPS website origin for the wallet worker.");
  return new URL("/api/otc/worker", origin).href;
}
