import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handle } from "../lib/agent-bridge/http";
import { discovery as bridgeDiscovery } from "../lib/agent-bridge/discovery";
import { discovery as lookupDiscovery, openapi as lookupSpec } from "../lib/bridge-api/discovery";
import { openapi as bridgeSpec } from "../lib/agent-bridge/openapi";
import { GET } from "../app/openapi.json/route";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(async () => true),
  claim: vi.fn(),
  verify: vi.fn(),
  settle: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../lib/bridge-api/store", () => ({ apiStore: () => mocks }));
vi.mock("../lib/agent-bridge/store", () => ({ jobStore: () => ({}) }));
vi.mock("../lib/agent-bridge/engine", () => ({
  BridgeEngine: class { create = mocks.create; }, publicJob: (value: unknown) => value,
}));
vi.mock("../lib/bridge-api/payments", async (original) => ({
  ...await original<typeof import("../lib/bridge-api/payments")>(),
  paymentGateway: async () => ({
    challenge: async (url: string) => ({
      x402Version: 2, resource: { url },
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000" }],
    }),
    verify: mocks.verify, settle: mocks.settle,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BRIDGE_API_SERVICE_SECRET", "s".repeat(64));
  vi.stubEnv("BRIDGE_AGENT_SERVICE_SECRET", "s".repeat(64));
  vi.stubEnv("BRIDGE_QUOTE_SECRET", "s".repeat(64));
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["/v1/jobs", "/v1/jobs/direct"])("discovers %s without a body or wallet action", async (path) => {
  for (const body of [undefined, "{}", "not json"]) {
    const response = await handle(new Request(`https://bridge-api.argosbot.io${path}`, { method: "POST", body }));
    expect(response.status).toBe(402);
    const challenge = await response.json();
    expect(challenge.resource.url).toBe(`https://bridge-api.argosbot.io${path}`);
    expect(challenge.extensions.bazaar.info.input.method).toBe("POST");
    expect(response.headers.get("payment-required")).toBeTruthy();
  }
  expect(mocks.limit).toHaveBeenCalled();
  for (const operation of [mocks.claim, mocks.verify, mocks.settle, mocks.create]) expect(operation).not.toHaveBeenCalled();
});
it.each(["/v1/jobs", "/v1/jobs/direct"])("still rejects invalid paid bodies on %s before payment processing", async (path) => {
  const response = await handle(new Request(`https://bridge-api.argosbot.io${path}`, {
    method: "POST", body: "{}", headers: { "Payment-Signature": "invalid" },
  }));
  expect(response.status).toBe(400);
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.settle).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("publishes clean resources with separate examples and matching OpenAPI prices", async () => {
  for (const discovery of [lookupDiscovery(), bridgeDiscovery()]) {
    expect(discovery.version).toBe(1);
    expect(new Set(discovery.resources)).toEqual(new Set(discovery.routes.map((r) => r.url)));
    for (const url of discovery.resources) expect(new URL(url).search).toBe("");
  }
  for (const spec of [lookupSpec(), bridgeSpec()]) {
    for (const item of Object.values(spec.paths)) {
      for (const operation of Object.values(item) as any[]) {
        const payment = operation["x-payment-info"];
        if (!payment) continue;
        expect(payment.protocols.length).toBeGreaterThan(0);
        for (const protocol of payment.protocols) expect(protocol.x402).toBeDefined();
        expect(payment.price.currency).toBe("USD");
        expect(operation.responses["402"]).toBeTruthy();
      }
    }
  }
  expect(await (await GET()).json()).toEqual(lookupSpec());
});
