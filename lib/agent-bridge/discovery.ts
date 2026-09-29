import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { SERVICE_ICON_URL } from "../service-brand";
import {
  LOOKUP_EXAMPLE,
  LOOKUP_INPUT_SCHEMA,
  LOOKUP_PARAMETERS,
} from "../bridge-api/metadata";
import { config, DESCRIPTION, NAME, ORIGIN } from "./config";
import { openapi } from "./openapi";
import { discoveryOutput } from "../discovery-response-schema";

export const TAGS = [
  "bridge",
  "cross-chain",
  "arc",
  "base",
  "circle",
  "cts",
  "external-wallet",
];
// Shape example only: callers must obtain fresh authorization and their own signature.
export const JOB_EXAMPLE = {
  intent: {
    clientRequestId: "c48ec391-32de-4f97-9b98-b37ef87bd032",
    chain: 5042,
    token: LOOKUP_EXAMPLE.token,
    account: "0x1111111111111111111111111111111111111111",
    mode: "setup",
    amount: "0",
    allowSetup: true,
    riskAcknowledged: true,
    maxForwardingFeeAtomic: "1000000000000000000",
    maxGasBudgetAtomic: "1000000000000000000000",
  },
  expiresAt: 1,
  signature: `0x${"00".repeat(65)}`,
};
export function createJobSchema() {
  const schemas = openapi().components.schemas;
  return {
    ...schemas.CreateJob,
    properties: { ...schemas.CreateJob.properties, intent: schemas.JobIntent },
  };
}
export function operationMetadata(resourcePath: string) {
  const job = ["/v1/jobs", "/v1/jobs/direct"].includes(
    resourcePath.split("?")[0],
  );
  const spec = openapi();
  const output = discoveryOutput(
    job ? spec.paths["/v1/jobs"].post.responses["200"].content["application/json"].schema : spec.components.schemas.PaidLookup,
    spec.components.schemas,
  );
  const extensions = job
    ? declareDiscoveryExtension({
        bodyType: "json",
        input: JOB_EXAMPLE,
        inputSchema: createJobSchema(),
      })
    : declareDiscoveryExtension({
        input: LOOKUP_EXAMPLE,
        inputSchema: LOOKUP_INPUT_SCHEMA,
      });
  Object.assign(extensions.bazaar.info.input, { method: job ? "POST" : "GET" });
  extensions.bazaar.info.output = { type: "json" };
  extensions.bazaar.schema.properties.output = output;
  const direct = resourcePath.split("?")[0].endsWith("/direct");
  const description = job
    ? `Create an external-wallet bridge or ownerless-wrapper setup job using Circle CTS. ${direct ? "Direct Arc or Base USDC: 0.012 USDC." : "Arc Gateway or direct Base USDC: 0.01 USDC."}`
    : `Look up Arc/Base original and wrapped token addresses, bridged supply and ownerless verification. ${direct ? "Direct Arc or Base USDC: 0.007 USDC." : "Arc Gateway or direct Base USDC: 0.005 USDC."}`;
  return { extensions, serviceName: NAME, tags: TAGS, description };
}
export function discovery() {
  return {
    version: 1,
    resources: config().enabled
      ? ["/v1/lookup", "/v1/lookup/direct", "/v1/jobs", "/v1/jobs/direct"].map((path) => `${ORIGIN}${path}`)
      : [],
    name: NAME,
    image: SERVICE_ICON_URL,
    icon: SERVICE_ICON_URL,
    description: DESCRIPTION,
    category: "Infrastructure",
    tags: TAGS,
    openapi: `${ORIGIN}/openapi.json`,
    documentation: `${ORIGIN}/llms.txt`,
    status: config().enabled ? "enabled" : "not_enabled",
    routes: config().enabled
      ? [
          {
            pattern: "GET /v1/lookup",
            method: "GET",
            path: "/v1/lookup",
            url: `${ORIGIN}/v1/lookup`,
            priceUsd: config("lookup").price,
            description:
              "Inspect any Arc or Base token's ownerless CTS bridge.",
            parameters: LOOKUP_PARAMETERS,
            inputSchema: LOOKUP_INPUT_SCHEMA,
            example: { query: LOOKUP_EXAMPLE },
          },
          {
            pattern: "POST /v1/jobs",
            method: "POST",
            path: "/v1/jobs",
            url: `${ORIGIN}/v1/jobs`,
            priceUsd: config("job").price,
            description:
              "Create a resumable external-wallet setup or transfer job. The wallet signs all chain transactions.",
            inputSchema: createJobSchema(),
            example: { body: JOB_EXAMPLE },
          },
        ].flatMap((route) => [
          route,
          {
            ...route,
            pattern: route.pattern + "/direct",
            path: route.path + "/direct",
            url: route.url + "/direct",
            priceUsd: config(
              route.method === "GET" ? "lookup" : "job",
              "direct",
            ).price,
          },
        ])
      : [],
  };
}
