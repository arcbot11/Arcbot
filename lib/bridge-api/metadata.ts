import {
  declareDiscoveryExtension,
  type QueryDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { openapi } from "./discovery";
import { discoveryOutput } from "../discovery-response-schema";

export const LOOKUP_CATEGORY = "Blockchain data";
export const LOOKUP_TAGS = [
  "blockchain",
  "bridge",
  "cross-chain",
  "tokens",
  "arc",
  "base",
  "circle",
  "cts",
];
export const LOOKUP_EXAMPLE = {
  token: "0xece5ca8bf9220718e5727754026757512212cb3c",
  chain: "arc",
  finality: "latest",
};
export const LOOKUP_PARAMETERS = [
  {
    name: "token",
    in: "query",
    required: true,
    description:
      "Original or wrapped ERC-20 contract address to check. Replace the example with any Arc or Base token address.",
    schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
    example: LOOKUP_EXAMPLE.token,
  },
  {
    name: "chain",
    in: "query",
    required: false,
    description:
      "Chain containing the input address; omit to inspect both Arc and Base.",
    schema: { type: "string", enum: ["arc", "base", "5042", "8453"] },
    example: "arc",
  },
  {
    name: "finality",
    in: "query",
    required: false,
    description: "Block finality used for the lookup.",
    schema: {
      type: "string",
      enum: ["latest", "finalized"],
      default: "latest",
    },
    example: "latest",
  },
];
export const LOOKUP_INPUT_SCHEMA = {
  type: "object",
  required: ["token"],
  additionalProperties: false,
  properties: Object.fromEntries(
    LOOKUP_PARAMETERS.map((p) => [
      p.name,
      { ...p.schema, description: p.description },
    ]),
  ),
};
export function lookupExtensions() {
  const schemas = openapi().components.schemas;
  const extensions = declareDiscoveryExtension({
    input: LOOKUP_EXAMPLE,
    inputSchema: LOOKUP_INPUT_SCHEMA,
  });
  extensions.bazaar.info.output = { type: "json" };
  extensions.bazaar.schema.properties.output = discoveryOutput(schemas.LookupResponse, schemas);
  // This handler uses the resource server directly, without HTTP middleware enrichment.
  (extensions.bazaar as QueryDiscoveryExtension).info.input.method = "GET";
  return extensions;
}
