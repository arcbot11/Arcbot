import { SERVICE_ICON_URL } from "../service-brand";
import { handleLookup, json } from "../bridge-api/handler";
import { arcusConfig } from "./config";
import { arcusGateway } from "./payments";
import { discovery, guidance, openapi } from "./metadata";
import { ARCUS_HOST, ARCUS_PATHS, ARCUS_PREFIX } from "./hosting";
import { agentRegistration } from "./identity";
import { handleMcp } from "./mcp";

export async function handleArcus(req: Request) {
  const url = new URL(req.url);
  if (url.hostname !== ARCUS_HOST) return json({ error: "Not found" }, 404);
  const path = url.pathname.startsWith(ARCUS_PREFIX)
    ? url.pathname.slice(ARCUS_PREFIX.length) || "/"
    : url.pathname;
  if (!ARCUS_PATHS.includes(path)) return json({ error: "Not found" }, 404);
  const lookup = (request: Request) => handleLookup(request, {
    config: arcusConfig(), resourcePath: "/v1/lookup", inputScope: "arcus-lookup-v1",
    gatewayFactory: arcusGateway, reconcile: async () => null,
  });
  if (path === "/mcp") {
    const response = await handleMcp(req, lookup, guidance);
    const origin = req.headers.get("origin");
    if (origin && ["https://" + ARCUS_HOST, "https://www.argosbot.io", "https://argosbot.io"].includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.append("Vary", "Origin");
      response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, MCP-Protocol-Version");
    }
    return response;
  }
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
    response = await lookup(req);
  else if (path === "/openapi.json") response = json(openapi());
  else if (path === "/.well-known/x402") response = json(discovery());
  else if (path === "/.well-known/agent-registration.json") response = json(agentRegistration());
  else if (path === "/health")
    response = json({
      configured: arcusConfig().configured,
      scope: "lookup-only",
    });
  else if (path === "/" && req.headers.get("accept")?.includes("text/html")) {
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    response = new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Argos Bot CTS Bridge Lookup</title><style>body{font:17px/1.65 system-ui;max-width:900px;margin:48px auto;padding:0 24px;color:#152435;background:#f8fafc}img{width:72px;height:72px}a{color:#1558ba}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}nav{display:flex;gap:24px;flex-wrap:wrap}</style><main><img src="${SERVICE_ICON_URL}" alt="Argos Bot"><h1>Argos Bot CTS Bridge Lookup</h1><p>Inspect ownerless Arc and Base token connections using Circle’s CTS infrastructure.</p><nav><a href="/openapi.json">OpenAPI</a><a href="/llms.txt">Agent documentation</a><a href="/.well-known/agent-registration.json">ERC-8004 registration</a><a href="https://8004scan.io/agents/arc/304">Agent #304</a></nav><h2>API and MCP usage</h2><pre>${escape(guidance)}</pre></main></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", Vary: "Accept", "Content-Security-Policy": "default-src 'none'; img-src https://www.argosbot.io; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
  }
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
