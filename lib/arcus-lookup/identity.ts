import { DESCRIPTION, SERVICE_NAME } from "../bridge-api/config";
import { ORIGIN } from "./config";

// Populate only after the registration receipt and ownership are verified.
export const AGENT_ID: number | null = 304;
export const AGENT_REGISTRY = "eip155:5042:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export function agentRegistration() {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: SERVICE_NAME,
    description: DESCRIPTION,
    image: "https://www.argosbot.io/brand/argos-dog-logo.png",
    active: true,
    x402Support: true,
    registrations: AGENT_ID === null ? [] : [{ agentId: AGENT_ID, agentRegistry: AGENT_REGISTRY }],
    services: [
      { name: "web", endpoint: ORIGIN },
      { name: "documentation", endpoint: `${ORIGIN}/llms.txt` },
      { name: "OpenAPI", endpoint: `${ORIGIN}/openapi.json` },
      { name: "x402", endpoint: `${ORIGIN}/v1/lookup`, method: "GET" },
      { name: "agentWallet", endpoint: "eip155:5042:0x60E4834783dA4D4D7ad1C81fc48221840192152C" },
    ],
    supportedTrust: [],
  };
}
