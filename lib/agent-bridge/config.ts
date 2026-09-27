import { apiConfig } from "../bridge-api/config";
export const ORIGIN = "https://bridge-api.argosbot.io";
export const NAME = "Argos Bot CTS Bridge API";
export const DESCRIPTION =
  "Inspect ownerless Arc/Base connections and coordinate external-wallet registration, wrapper creation and transfers through Circle's Crosschain Token Standard (CTS), CrossChainTokenService and CCTP. Wallets sign their own transactions.";
export function config(kind: "lookup" | "job" = "job") {
  const base = apiConfig();
  const price = kind === "lookup" ? "0.005" : "0.01";
  const configured =
    base.configured &&
    (process.env.BRIDGE_AGENT_SERVICE_SECRET?.length || 0) >= 32 &&
    (process.env.BRIDGE_QUOTE_SECRET?.length || 0) >= 32;
  return {
    ...base,
    origin: ORIGIN,
    price,
    atomicPrice: kind === "lookup" ? "5000" : "10000",
    configured,
    enabled: configured,
  };
}
export function serviceSecret() {
  const value = process.env.BRIDGE_AGENT_SERVICE_SECRET;
  if (!value || value.length < 32)
    throw Error("Agent bridge authentication is not configured");
  return value;
}
