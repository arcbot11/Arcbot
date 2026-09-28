import { isAddress, parseUnits, zeroAddress } from "viem";
import { X402_REVENUE_WALLET } from "../x402-revenue";
export const SERVICE_NAME = "Argos Bot CTS Bridge Lookup";
export const DESCRIPTION =
  "Look up any Arc or Base token’s ownerless bridge using Circle’s Crosschain Token Standard (CTS), CrossChainTokenService and CCTP. Get original and wrapped token addresses, wrapped supply, contracts and verification status.";
export const LOOKUP_PATH = "/api/v1/bridge/lookup";
export const DIRECT_LOOKUP_PATH = "/api/v1/bridge/lookup/direct";
export const DIRECT_PRICE = "0.007";
// CRA revenue-wallet registration verified; availability is checked per purchase.
export const DIRECT_LOOKUP_ENABLED = true;
export const PROPOSED_PRICE = "0.005";
// Public commercial settings are versioned with the service, not deployment env.
export const LOOKUP_PAYMENTS_ENABLED = true;
export function apiConfig(rail: "gateway" | "direct" = "gateway") {
  const price = rail === "direct" ? DIRECT_PRICE : PROPOSED_PRICE;
  const payTo: string = X402_REVENUE_WALLET;
  const origin = "https://www.argosbot.io";
  if (
    !/^\d+(\.\d{1,6})?$/.test(price) ||
    parseUnits(price, 6) <= 0n ||
    parseUnits(price, 6) > 1000000n
  )
    throw Error("Invalid bridge API price");
  if (!["gateway", "direct"].includes(rail))
    throw Error("Invalid payment rail");
  const configured =
    isAddress(payTo) &&
    payTo.toLowerCase() !== zeroAddress &&
    /^https:\/\/[^/]+$/.test(origin) &&
    !!process.env.BRIDGE_API_SERVICE_SECRET &&
    !!process.env.NEXT_PUBLIC_CONVEX_URL;
  const enabled =
    LOOKUP_PAYMENTS_ENABLED &&
    configured &&
    (rail !== "direct" || DIRECT_LOOKUP_ENABLED);
  return {
    price,
    atomicPrice: parseUnits(price, 6).toString(),
    payTo,
    rail: rail as "gateway" | "direct",
    origin,
    configured,
    enabled,
  };
}

export const OFFICIAL_REFERENCES = [
  {
    title:
      "Circle: Crosschain Token Standard (CTS) and Cross-Chain Transfer Protocol (CCTP)",
    url: "https://www.circle.com/cross-chain-transfer-protocol",
  },
  {
    title: "Arc Docs: CrossChainTokenService contract addresses",
    url: "https://docs.arc.io/arc/references/contract-addresses",
  },
  {
    title: "Circle Docs: Circle Gateway",
    url: "https://developers.circle.com/gateway",
  },
];
