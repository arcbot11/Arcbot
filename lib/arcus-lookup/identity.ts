import { SERVICE_NAME } from "../bridge-api/config";
import { ORIGIN } from "./config";
import { MCP_TOOL, MCP_VERSION } from "./mcp";
import { SERVICE_ICON_URL } from "../service-brand";

// Populate only after the registration receipt and ownership are verified.
export const AGENT_ID: number | null = 304;
export const AGENT_REGISTRY = "eip155:5042:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export function agentRegistration() {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: SERVICE_NAME,
    description: "Look up original and wrapped tokens on Arc and Base through Circle's Crosschain Token Standard (CTS), CrossChainTokenService and Cross-Chain Transfer Protocol (CCTP). Returns ownerless bridge connections, counterpart token addresses, outstanding wrapped supply, relevant contracts, verification status and block evidence. Available through a GET API and payment-aware MCP; 0.007 USDC per lookup on Arc through Arcus x402. Documentation and discovery are free. Lookup only: no custody, bridge execution or certification of token safety.",
    image: SERVICE_ICON_URL,
    active: true,
    x402Support: true,
    registrations: AGENT_ID === null ? [] : [{ agentId: AGENT_ID, agentRegistry: AGENT_REGISTRY }],
    services: [
      { name: "web", endpoint: ORIGIN },
      { name: "documentation", endpoint: `${ORIGIN}/llms.txt` },
      { name: "OpenAPI", endpoint: `${ORIGIN}/openapi.json` },
      { name: "MCP", endpoint: `${ORIGIN}/mcp`, version: MCP_VERSION, mcpTools: [MCP_TOOL] },
      { name: "OASF", endpoint: "https://github.com/agntcy/oasf/", version: "v0.8.0",
        skills: ["data_engineering/data_quality_assessment", "data_engineering/data_transformation_pipeline"],
        domains: ["technology/blockchain/smart_contracts", "technology/blockchain/defi"] },
      { name: "x402", endpoint: `${ORIGIN}/v1/lookup`, method: "GET" },
      { name: "agentWallet", endpoint: "eip155:5042:0x60E4834783dA4D4D7ad1C81fc48221840192152C" },
    ],
    supportedTrust: [],
  };
}
