import { apiConfig, SERVICE_NAME, DESCRIPTION, LOOKUP_PATH, OFFICIAL_REFERENCES } from "./config";
export function discovery() {
  const c = apiConfig();
  return { name: SERVICE_NAME, description: DESCRIPTION, status: c.enabled ? "enabled" : "not_enabled",
    references: OFFICIAL_REFERENCES, documentation: "/developers/bridge-api", openapi: "/api/v1/bridge/openapi",
    routes: c.enabled ? [{ pattern: `GET ${LOOKUP_PATH}`, priceUsd: c.price, description: DESCRIPTION,
      inputSchema: { type: "object", required: ["token"], additionalProperties: false, properties: { token: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" }, chain: { type: "string", enum: ["arc","base"] }, finality: { type: "string", enum: ["latest","finalized"], default: "latest" } } } }] : [] };
}
export function openapi() {
  const c = apiConfig();
  return { openapi: "3.1.0", info: { title: SERVICE_NAME, version: "1.0.0", description: DESCRIPTION },
    ...(c.origin ? { servers: [{ url: c.origin }] } : {}),
    externalDocs: { description: "Official Arc contract references for Circle CrossChainTokenService and CCTP", url: "https://docs.arc.io/arc/references/contract-addresses" },
    "x-official-references": OFFICIAL_REFERENCES,
    paths: { [LOOKUP_PATH]: { get: { operationId: "lookupOwnerlessBridge", summary: DESCRIPTION,
      description: "Read-only. Latest snapshots may be cached for up to 30 seconds. Verification does not certify transfer behavior. Retry an interrupted paid call with the identical Payment-Signature and query to recover its result for 24 hours. Never automatically create a new payment after an uncertain settlement.",
      parameters: [
        { name: "token", in: "query", required: true, description: "Original or wrapped ERC-20 contract address; replace the example with the token being researched.", schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" }, example: "0xece5ca8bf9220718e5727754026757512212cb3c" },
        { name: "chain", in: "query", description: "Chain containing the input address. Omit to inspect both; multiple candidates require explicit chain selection.", schema: { type: "string", enum: ["arc","base"] } },
        { name: "finality", in: "query", schema: { type: "string", enum: ["latest","finalized"], default: "latest" } },
        { name: "Payment-Signature", in: "header", schema: { type: "string" }, description: "Base64 x402 v2 payment payload, obtained by handling the 402 challenge. Keep private for response recovery." },
      ], responses: {
        "200": { description: "Successful lookup or recovered paid result. No-registration, incomplete-setup and verification-failed findings are valid lookup results.", content: { "application/json": { schema: { $ref: "#/components/schemas/LookupResponse" } } } },
        "400": { description: "Invalid input; not charged" }, "402": { description: "x402 payment required or invalid payment authorization" },
        "409": { description: "Existing payment pending, conflicting, expired or not charged; inspect state before retrying" },
        "429": { description: "Rate limit; Retry-After supplied" }, "503": { description: "Disabled or dependency unavailable. If a requestId is present, settlement may require reconciliation; do not create a second authorization." },
      } } } }, components: { schemas: {
        Token: { type: "object", required: ["address","chainId","chain","role","isBridgedRepresentation"], properties: {
          address: { type: "string" }, chainId: { type: "integer", enum: [5042,8453] }, chain: { type: "string", enum: ["Arc","Base"] }, role: { type: "string", enum: ["original","wrapped"] }, isBridgedRepresentation: { type: "boolean" }, name: { type: "string" }, symbol: { type: "string" }, decimals: { type: "integer" }, explorerUrl: { type: "string" },
        } },
        Candidate: { type: "object", properties: { status: { type: "string", enum: ["not_a_contract","not_registered","wrapper_missing","verified","verification_failed","unavailable"] }, connectionExists: { type: ["boolean","null"] }, ownerlessVerified: { type: ["boolean","null"] }, source: { $ref: "#/components/schemas/Token" }, destination: { anyOf: [{ $ref: "#/components/schemas/Token" }, { type: "null" }] }, original: { $ref: "#/components/schemas/Token" }, wrapped: { anyOf: [{ $ref: "#/components/schemas/Token" }, { type: "null" }] }, direction: { type: "string" }, operation: { enum: ["lock_and_mint","burn_and_unlock"] }, wrappedSupply: { type: ["object","null"], properties: { raw: { type: "string" }, formatted: { type: "string" }, chainId: { type: "integer" }, tokenAddress: { type: "string" }, decimals: { type: "integer" }, meaning: { type: "string" } } }, evidence: { type: "array", items: { type: "object" } }, contracts: { type: "array", items: { type: "object" } }, operational: { type: "object" }, error: { type: "string" } } },
        LookupResponse: { type: "object", required: ["requestId","result","payment"], properties: { requestId: { type: "string" }, payment: { type: "object", description: "Facilitator settlement acknowledgement; Gateway batching is not necessarily a final onchain transfer." }, result: { type: "object", properties: { status: { enum: ["complete","ambiguous","unavailable"] }, observedAt: { type: "string", format: "date-time" }, cached: { type: "boolean" }, cacheAgeMs: { type: "integer" }, candidates: { type: "array", items: { $ref: "#/components/schemas/Candidate" } } } } } },
      } } };
}
