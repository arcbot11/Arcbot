import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { SERVICE_ICON_URL } from "../service-brand";
import {
  LOOKUP_EXAMPLE,
  LOOKUP_INPUT_SCHEMA,
  LOOKUP_PARAMETERS,
} from "../bridge-api/metadata";
import { config, DESCRIPTION, NAME, ORIGIN } from "./config";
import { openapi } from "./openapi";

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
  return { extensions, serviceName: NAME, tags: TAGS };
}
export function discovery() {
  return {
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
