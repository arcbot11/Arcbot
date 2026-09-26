import { isAddress, parseUnits, zeroAddress } from "viem";
export const SERVICE_NAME = "Argos Bot CTS Bridge Lookup";
export const DESCRIPTION = "Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.";
export const LOOKUP_PATH = "/api/v1/bridge/lookup";
export const PROPOSED_PRICE = "0.005";
// Public commercial settings are versioned with the service, not deployment env.
export const LOOKUP_PAYMENTS_ENABLED = true;
export function apiConfig() {
  const price = PROPOSED_PRICE;
  const payTo = "0x60E4834783dA4D4D7ad1C81fc48221840192152C";
  const rail = "gateway";
  const origin = "https://www.argosbot.io";
  if (!/^\d+(\.\d{1,6})?$/.test(price) || parseUnits(price, 6) <= 0n || parseUnits(price, 6) > 1000000n) throw Error("Invalid bridge API price");
  if (!["gateway", "direct"].includes(rail)) throw Error("Invalid payment rail");
  const configured = isAddress(payTo) && payTo.toLowerCase() !== zeroAddress && /^https:\/\/[^/]+$/.test(origin) && !!process.env.BRIDGE_API_SERVICE_SECRET && !!process.env.NEXT_PUBLIC_CONVEX_URL;
  const enabled = LOOKUP_PAYMENTS_ENABLED && configured;
  return { price, atomicPrice: parseUnits(price, 6).toString(), payTo, rail: rail as "gateway" | "direct", origin, configured, enabled };
}

export const OFFICIAL_REFERENCES = [
  { title: "Circle: Crosschain Token Standard (CTS) and Cross-Chain Transfer Protocol (CCTP)", url: "https://www.circle.com/cross-chain-transfer-protocol" },
  { title: "Arc Docs: CrossChainTokenService contract addresses", url: "https://docs.arc.io/arc/references/contract-addresses" },
  { title: "Circle Docs: Circle Gateway", url: "https://developers.circle.com/gateway" },
];
