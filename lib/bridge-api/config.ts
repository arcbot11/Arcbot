import { isAddress, parseUnits, zeroAddress } from "viem";
export const SERVICE_NAME = "Argos Bot CTS Bridge Lookup";
export const DESCRIPTION = "Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.";
export const LOOKUP_PATH = "/api/v1/bridge/lookup";
export const PROPOSED_PRICE = "0.005";
export function apiConfig() {
  const price = process.env.BRIDGE_API_PRICE_USDC || PROPOSED_PRICE;
  const payTo = process.env.BRIDGE_API_PAY_TO || "";
  const rail = process.env.BRIDGE_API_PAYMENT_RAIL || "gateway";
  const origin = process.env.BRIDGE_API_PUBLIC_ORIGIN || "";
  if (!/^\d+(\.\d{1,6})?$/.test(price) || parseUnits(price, 6) <= 0n || parseUnits(price, 6) > 1000000n) throw Error("Invalid bridge API price");
  if (!["gateway", "direct"].includes(rail)) throw Error("Invalid payment rail");
  const configured = isAddress(payTo) && payTo.toLowerCase() !== zeroAddress && /^https:\/\/[^/]+$/.test(origin) && !!process.env.BRIDGE_API_SERVICE_SECRET && !!process.env.NEXT_PUBLIC_CONVEX_URL;
  const enabled = process.env.BRIDGE_API_PAYMENTS_ENABLED === "true" && configured;
  return { price, atomicPrice: parseUnits(price, 6).toString(), payTo, rail: rail as "gateway" | "direct", origin, configured, enabled };
}

export const OFFICIAL_REFERENCES = [
  { title: "Circle: Crosschain Token Standard (CTS) and Cross-Chain Transfer Protocol (CCTP)", url: "https://www.circle.com/cross-chain-transfer-protocol" },
  { title: "Arc Docs: CrossChainTokenService contract addresses", url: "https://docs.arc.io/arc/references/contract-addresses" },
  { title: "Circle Docs: Circle Gateway", url: "https://developers.circle.com/gateway" },
];
