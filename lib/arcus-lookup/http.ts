import { handleLookup, json } from "../bridge-api/handler";
import { arcusConfig } from "./config";
import { arcusGateway } from "./payments";
import { discovery, guidance, openapi } from "./metadata";
import { ARCUS_HOST, ARCUS_PATHS, ARCUS_PREFIX } from "./hosting";

export async function handleArcus(req: Request) {
  const url = new URL(req.url);
  if (url.hostname !== ARCUS_HOST) return json({ error: "Not found" }, 404);
  const path = url.pathname.startsWith(ARCUS_PREFIX)
    ? url.pathname.slice(ARCUS_PREFIX.length) || "/"
    : url.pathname;
  if (!ARCUS_PATHS.includes(path)) return json({ error: "Not found" }, 404);
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Payment-Signature, Content-Type",
    "Access-Control-Expose-Headers":
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, Retry-After",
  };
  let response: Response;
  if (req.method === "OPTIONS") response = new Response(null, { status: 204 });
  else if (req.method !== "GET")
    response = json({ error: "Method not allowed" }, 405, {
      Allow: "GET, OPTIONS",
    });
  else if (path === "/v1/lookup")
    response = await handleLookup(req, {
      config: arcusConfig(),
      resourcePath: "/v1/lookup",
      inputScope: "arcus-lookup-v1",
      gatewayFactory: arcusGateway,
      reconcile: async () => null,
    });
  else if (path === "/openapi.json") response = json(openapi());
  else if (path === "/.well-known/x402") response = json(discovery());
  else if (path === "/health")
    response = json({
      configured: arcusConfig().configured,
      scope: "lookup-only",
    });
  else
    response = new Response(guidance, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  for (const [key, value] of Object.entries(headers))
    response.headers.set(key, value);
  return response;
}
