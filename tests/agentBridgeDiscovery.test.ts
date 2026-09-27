import { expect, it } from "vitest";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { operationMetadata } from "../lib/agent-bridge/discovery";

it.each([
  "/v1/jobs",
  "/v1/jobs/direct",
  "/v1/lookup?token=example",
  "/v1/lookup/direct?token=example",
])("publishes valid Bazaar metadata for %s", (path) => {
  const metadata = operationMetadata(path);
  expect(validateDiscoveryExtension(metadata.extensions.bazaar)).toMatchObject({
    valid: true,
  });
  const input = metadata.extensions.bazaar.info.input;
  expect(input.type).toBe("http");
  if (input.type === "http")
    expect(input.method).toBe(path.startsWith("/v1/jobs") ? "POST" : "GET");
});
