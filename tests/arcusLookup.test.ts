import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { handleArcus } from "../lib/arcus-lookup/http";
import { openapi, discovery } from "../lib/arcus-lookup/metadata";
import { arcusConfig, ORIGIN, FACILITATOR } from "../lib/arcus-lookup/config";
import { arcusGateway } from "../lib/arcus-lookup/payments";
import { handleLookup } from "../lib/bridge-api/handler";
import { encode, hash } from "../lib/bridge-api/payments";
import { inputSchema } from "../lib/bridge-api/model";
import { DESCRIPTION, SERVICE_NAME } from "../lib/bridge-api/config";
import type { ApiStore } from "../lib/bridge-api/store";
const token = "0x" + "11".repeat(20);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("isolates the host and permits no bridge job or wallet routes", async () => {
  expect(
    middleware(new NextRequest(ORIGIN + "/v1/lookup")).headers.get(
      "x-middleware-rewrite",
    ),
  ).toBe(ORIGIN + "/api/arcus-lookup/v1/lookup");
  for (const path of [
    "/v1/jobs",
    "/api/bridge",
    "/wallet",
    "/api/arcus-lookup/v1/lookup",
  ]) {
    expect(middleware(new NextRequest(ORIGIN + path)).status).toBe(404);
  }
  expect(
    middleware(
      new NextRequest("https://www.argosbot.io/api/arcus-lookup/v1/lookup"),
    ).status,
  ).toBe(404);
  expect(
    (await handleArcus(new Request("https://www.argosbot.io/v1/lookup")))
      .status,
  ).toBe(404);
});
it("preserves CRA terminology while advertising only Arcus payments and one GET", () => {
  vi.stubEnv("BRIDGE_API_SERVICE_SECRET", "test");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  const spec = openapi();
  expect(spec.info).toMatchObject({
    title: SERVICE_NAME,
    description: DESCRIPTION,
  });
  expect(Object.keys(spec.paths)).toEqual(["/v1/lookup"]);
  expect(spec.paths["/v1/lookup"].get["x-payment-networks"]).toEqual([
    "eip155:5042",
  ]);
  expect(discovery().routes[0].url).toBe(ORIGIN + "/v1/lookup");
  expect(
    discovery().routes[0].parameters.find((p) => p.name === "token")?.required,
  ).toBe(true);
});
it("allows payment headers for the playground and rejects invalid input before dependencies", async () => {
  const response = await handleArcus(
    new Request(ORIGIN + "/v1/lookup", { method: "OPTIONS" }),
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
    "Payment-Signature",
  );
  const invalid = await handleArcus(
    new Request(ORIGIN + "/v1/lookup?token=no"),
  );
  expect(invalid.status).toBe(400);
  expect(invalid.headers.get("Access-Control-Expose-Headers")).toContain(
    "PAYMENT-REQUIRED",
  );
});
it("uses Arcus exclusively and refuses Base and Gateway proofs", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:5042" }],
      extensions: [],
      signers: {},
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const gateway = await arcusGateway();
  const challenge = await gateway.challenge(ORIGIN + "/v1/lookup");
  expect(challenge.accepts).toHaveLength(1);
  expect(challenge.accepts[0]).toMatchObject({
    amount: "7000",
    network: "eip155:5042",
    extra: { name: "USDC", version: "2" },
  });
  for (const accepted of [
    { ...challenge.accepts[0], network: "eip155:8453" },
    { ...challenge.accepts[0], extra: { name: "GatewayWalletBatched" } },
  ]) {
    expect(
      await gateway.verify({ x402Version: 2, accepted, payload: {} } as never),
    ).toBeNull();
  }
  expect(
    fetcher.mock.calls.every((c) =>
      String((c as unknown[])[0]).startsWith(FACILITATOR),
    ),
  ).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([false, true])(
  "recovers only matching Arcus scope without invoking a facilitator (uncertain=%s)",
  async (uncertain) => {
    const input = inputSchema.parse({ token, chain: "base" });
    const proof = {
      x402Version: 2,
      accepted: { network: "eip155:5042", scheme: "exact" },
      payload: {
        signature: "0x11",
        authorization: {
          from: token,
          to: token,
          nonce: "0x" + "22".repeat(32),
          value: "7000",
          validAfter: "0",
          validBefore: "9999999999",
        },
      },
    };
    const row = {
      requestId: "example",
      inputKey: hash(JSON.stringify(["arcus-lookup-v1", input])),
      state: uncertain ? "uncertain" : "settled",
      resultJson: "{}",
      receiptJson: "{}",
    };
    const store = {
      limit: async () => true,
      recover: async () => row,
    } as unknown as ApiStore;
    const factory = vi.fn();
    const request = () =>
      new Request(ORIGIN + "/v1/lookup?token=" + token + "&chain=base", {
        headers: { "Payment-Signature": encode(proof) },
      });
    const deps = {
      config: arcusConfig(),
      store,
      gatewayFactory: factory,
      resourcePath: "/v1/lookup",
      inputScope: "arcus-lookup-v1",
      reconcile: async () => null,
    };
    expect((await handleLookup(request(), deps)).status).toBe(
      uncertain ? 409 : 200,
    );
    row.inputKey = hash(JSON.stringify(["direct-lookup-v1", input]));
    expect((await handleLookup(request(), deps)).status).toBe(409);
    expect(factory).not.toHaveBeenCalled();
  },
);
