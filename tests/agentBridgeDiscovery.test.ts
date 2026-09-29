import { expect, it } from "vitest";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { operationMetadata } from "../lib/agent-bridge/discovery";
import { lookupExtensions } from "../lib/bridge-api/metadata";

it.each([
  "/v1/jobs",
  "/v1/jobs/direct",
  "/v1/lookup?token=example",
  "/v1/lookup/direct?token=example",
])("publishes valid Bazaar metadata for %s", (path) => {
  const metadata = operationMetadata(path);
  const output = metadata.extensions.bazaar.schema.properties.output;
  expect(output?.properties?.example).toMatchObject({ type: "object", required: ["requestId", "result", "payment"] });
  expect(JSON.stringify(output)).not.toContain('"$ref"');
  expect(validateDiscoveryExtension(metadata.extensions.bazaar)).toMatchObject({
    valid: true,
  });
  const input = metadata.extensions.bazaar.info.input;
  expect(input.type).toBe("http");
  if (input.type === "http")
    expect(input.method).toBe(path.startsWith("/v1/jobs") ? "POST" : "GET");
});

it("publishes a self-contained lookup response schema", () => {
  const extension = lookupExtensions().bazaar;
  expect(validateDiscoveryExtension(extension).valid).toBe(true);
  expect(extension.schema.properties.output?.properties?.example).toMatchObject({ type: "object" });
  expect(JSON.stringify(extension)).not.toContain('"$ref"');
});
