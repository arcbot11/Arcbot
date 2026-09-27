import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { handleVercel } from "../lib/agent-bridge/vercel";
import { tick } from "../convex/agentBridgeWorker";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("routes only the dedicated hostname into the bridge API", () => {
  const response = middleware(new NextRequest("https://bridge-api.argosbot.io/v1/lookup?chain=base&token=abc"));
  expect(response.headers.get("x-middleware-rewrite")).toBe("https://bridge-api.argosbot.io/api/cts-agent/v1/lookup?chain=base&token=abc");
  expect(middleware(new NextRequest("https://bridge-api.argosbot.io/api/wallet/data")).status).toBe(404);
  expect(middleware(new NextRequest("https://www.argosbot.io/api/cts-agent/health")).status).toBe(404);
});
it("serves rewritten metadata but denies direct access from other hosts", async () => {
  const response = await handleVercel(new Request("https://bridge-api.argosbot.io/api/cts-agent/openapi.json"));
  expect(response.status).toBe(200);
  expect((await response.json()).info.title).toBe("Argos Bot CTS Bridge API");
  expect((await handleVercel(new Request("https://www.argosbot.io/api/cts-agent/openapi.json"))).status).toBe(404);
});
it("denies unauthenticated worker requests before persistence access", async () => {
  vi.stubEnv("BRIDGE_AGENT_SERVICE_SECRET", "s".repeat(64));
  const response = await handleVercel(new Request("https://bridge-api.argosbot.io/internal/poll", { method: "POST", body: '{}' }));
  expect(response.status).toBe(401);
});
it("the scheduled worker does nothing when disabled or no jobs are due", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const ctx = { runQuery: vi.fn(async () => []), runMutation: vi.fn() };
  const run = () => (tick as any)._handler(ctx, {});
  vi.stubEnv("BRIDGE_AGENT_SERVICE_SECRET", "");
  await run(); expect(ctx.runQuery).not.toHaveBeenCalled();
  vi.stubEnv("BRIDGE_AGENT_SERVICE_SECRET", "s".repeat(64));
  await run(); expect(ctx.runQuery).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
it("poll failures rotate the queue without modifying job transaction state", async () => {
  vi.stubEnv("BRIDGE_AGENT_SERVICE_SECRET", "s".repeat(64));
  const fetch = vi.fn(async () => new Response(null, { status: 503 })); vi.stubGlobal("fetch", fetch);
  const id = `ab_${"a".repeat(48)}`;
  const ctx = { runQuery: vi.fn(async () => [id]), runMutation: vi.fn() };
  await (tick as any)._handler(ctx, {});
  expect(fetch).toHaveBeenCalledWith("https://bridge-api.argosbot.io/internal/poll", expect.objectContaining({ redirect: "error", body: JSON.stringify({ id }) }));
  expect(ctx.runMutation).toHaveBeenCalledOnce();
  expect(ctx.runMutation.mock.calls[0][1]).toEqual({ secret: "s".repeat(64), id });
});
