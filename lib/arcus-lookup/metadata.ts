import { DESCRIPTION, SERVICE_NAME, LOOKUP_PATH } from "../bridge-api/config";
import { SERVICE_ICON_URL } from "../service-brand";
import { openapi as originalOpenapi } from "../bridge-api/discovery";
import {
  LOOKUP_PARAMETERS,
  LOOKUP_TAGS,
  LOOKUP_INPUT_SCHEMA,
  LOOKUP_CATEGORY,
} from "../bridge-api/metadata";
import { arcusConfig, FACILITATOR, ORIGIN, PRICE } from "./config";
export const guidance = `${SERVICE_NAME}
${DESCRIPTION}
GET ${ORIGIN}/v1/lookup?token=0x...&chain=arc|base
Inputs and responses match the Argos Bot CTS Bridge Lookup CRA service.
Optional finality=latest|finalized. Supply chain when an address is ambiguous.
Lookup only: no wallet transactions, registration, wrapper creation or bridge execution.
Price: ${PRICE} USDC per lookup, paid on Arc through Arcus x402 v2 exact settlement.
The chain parameter selects the token chain, not the payment network.
A missing bridge or failed contract verification is a valid paid result. Dependency failures are not settled.
Keep the original Payment-Signature and identical query for recovery. Never pay again after uncertain settlement.
Uncertain Arcus settlements require reconciliation; the API never automatically resubmits them.
Verification is not certification of token transfer behavior, liquidity or redemption safety.
OpenAPI: ${ORIGIN}/openapi.json
MCP: POST ${ORIGIN}/mcp (stateless Streamable HTTP, protocol 2025-06-18).
MCP clients must send Accept: application/json, text/event-stream and Content-Type: application/json.
Initialize, tools/list and resources/list/read are free. The lookup_ownerless_bridge tool takes token, optional chain and finality.
An unpaid tool call returns an x402 PaymentRequired object in structuredContent and content[0].text with isError=true.
An x402-capable MCP client retries with the payment payload in params._meta["x402/payment"].
Settlement receipts appear in result._meta["x402/payment-response"]. HTTP Payment-Signature is for REST only.
Keep identical tool arguments and the SAME payment payload for recovery; errors do not imply payment was unspent.
MCP uses the same payment journal and purchase scope as REST. A generic MCP client without x402 support can discover tools but cannot purchase a lookup.
Identity: Arc ERC-8004 agent 304; registration metadata: ${ORIGIN}/.well-known/agent-registration.json
No reputation or validation trust mechanism is claimed. Registration and contract checks are not a safety endorsement.
Health: /health reports configuration only, not live RPC or facilitator availability.
`;
export function discovery() {
  const c = arcusConfig();
  return {
    name: SERVICE_NAME,
    image: SERVICE_ICON_URL,
    icon: SERVICE_ICON_URL,
    description: DESCRIPTION,
    category: LOOKUP_CATEGORY,
    tags: LOOKUP_TAGS,
    facilitator: FACILITATOR,
    openapi: `${ORIGIN}/openapi.json`,
    documentation: `${ORIGIN}/llms.txt`,
    mcp: { url: `${ORIGIN}/mcp`, transport: "streamable-http", protocolVersion: "2025-06-18", payment: "x402-v2", tool: "lookup_ownerless_bridge" },
    status: c.enabled ? "enabled" : "not_enabled",
    routes: c.enabled
      ? [
          {
            method: "GET",
            pattern: "GET /v1/lookup",
            url: `${ORIGIN}/v1/lookup`,
            priceUsd: PRICE,
            description: DESCRIPTION,
            parameters: LOOKUP_PARAMETERS,
            inputSchema: LOOKUP_INPUT_SCHEMA,
            paymentNetworks: ["eip155:5042"],
          },
        ]
      : [],
  };
}
export function openapi() {
  const source = originalOpenapi();
  const operation = source.paths[LOOKUP_PATH].get;
  return {
    ...source,
    servers: [{ url: ORIGIN }],
    paths: {
      "/v1/lookup": {
        get: {
          ...operation,
          operationId: "lookupOwnerlessBridgeArcus",
          description: guidance,
          "x-payment-option": {
            rail: "arcus",
            priceUSDC: PRICE,
            enabled: arcusConfig().enabled,
          },
          "x-payment-networks": ["eip155:5042"],
        },
      },
    },
  };
}
