import { json } from "../bridge-api/handler";
import { inputSchema } from "../bridge-api/model";
import { encode } from "../bridge-api/payments";
import { LOOKUP_PARAMETERS } from "../bridge-api/metadata";
import { ORIGIN, PRICE } from "./config";
import { SERVICE_NAME } from "../bridge-api/config";

export const MCP_VERSION = "2025-06-18";
export const MCP_TOOL = "lookup_ownerless_bridge";
const versions = [MCP_VERSION, "2025-03-26"];
const resourceUri = `${ORIGIN}/llms.txt`;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const tool = {
  name: MCP_TOOL,
  title: "Arc / Base ownerless CTS bridge lookup",
  description: `Costs ${PRICE} USDC on Arc per lookup. Inspect an original or wrapped token on Arc or Base using Circle CTS, CrossChainTokenService and CCTP. Returns token roles, counterpart addresses, wrapped supply, contract checks and block evidence. No bridge execution. A missing bridge is a valid paid result. Requires an x402-capable client; never request private keys.`,
  inputSchema: {
    type: "object", required: ["token"], additionalProperties: false,
    properties: Object.fromEntries(LOOKUP_PARAMETERS.map(p => [p.name, { ...p.schema, description: p.description }])),
  },
  // Payment is a side effect even though the underlying chain inspection is read-only.
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

/** Stateless Streamable HTTP. All paid work uses the canonical REST purchase scope. */
export async function handleMcp(req: Request, lookup: (req: Request) => Promise<Response>, documentation: string) {
  const reply = (id: string | number | null, result: unknown) => json({ jsonrpc: "2.0", id, result });
  const error = (id: string | number | null, code: number, message: string, status = 200) =>
    json({ jsonrpc: "2.0", id, error: { code, message } }, status);
  const origin = req.headers.get("origin");
  if (origin && ![ORIGIN, "https://www.argosbot.io", "https://argosbot.io"].includes(origin))
    return error(null, -32600, "Origin not allowed", 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Use POST for MCP; SSE and sessions are not offered." }, 405, { Allow: "POST, OPTIONS" });
  const version = req.headers.get("mcp-protocol-version");
  if (version && !versions.includes(version)) return error(null, -32600, "Unsupported MCP protocol version", 400);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return error(null, -32600, "Content-Type must be application/json", 415);
  const accept = req.headers.get("accept") || "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream"))
    return error(null, -32600, "Accept must include application/json and text/event-stream", 406);
  // Bound the body while streaming, including requests without Content-Length.
  let value: unknown;
  const reader = req.body?.getReader();
  if (!reader) return error(null, -32700, "Missing JSON body", 400);
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read(); if (done) break;
      size += chunk.length;
      if (size > 32_768) { await reader.cancel(); return error(null, -32600, "Request too large", 413); }
      chunks.push(chunk);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return error(null, -32700, "Invalid JSON", 400); }
  if (!record(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string" ||
      (value.id !== undefined && typeof value.id !== "string" && typeof value.id !== "number") ||
      (value.params !== undefined && !record(value.params)))
    return error(null, -32600, "Invalid JSON-RPC request; batches are not supported", 400);
  const id = value.id as string | number | undefined;
  if (id === undefined) {
    if (["notifications/initialized", "notifications/cancelled"].includes(value.method))
      return new Response(null, { status: 202 });
    // In particular, never execute a paid tool as a notification.
    return error(null, -32600, "Request id required", 400);
  }
  const params = value.params as Record<string, unknown> | undefined;
  switch (value.method) {
    case "initialize":
      if (!params || typeof params.protocolVersion !== "string" || !record(params.capabilities) || !record(params.clientInfo))
        return error(id, -32602, "Invalid initialize parameters");
      return reply(id, { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : MCP_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: SERVICE_NAME, version: "1.0.0" },
        instructions: "Discovery and resources are free. Lookup costs 0.007 USDC on Arc using x402. Retry identical arguments with the same payment after interruption. Never create another payment while settlement is uncertain. No A2A or bridge execution is provided." });
    case "ping": return reply(id, {});
    case "tools/list": return reply(id, { tools: [tool] });
    case "resources/list": return reply(id, { resources: [{ uri: resourceUri, name: "bridge_lookup_documentation", mimeType: "text/plain", description: "Inputs, payments, recovery and verification limits" }] });
    case "resources/read":
      return params?.uri === resourceUri ? reply(id, { contents: [{ uri: resourceUri, mimeType: "text/plain", text: documentation }] }) : error(id, -32602, "Unknown resource");
    case "tools/call": break;
    default: return error(id, -32601, "Method not found");
  }
  if (params?.name !== MCP_TOOL) return error(id, -32602, "Unknown tool");
  const parsed = inputSchema.safeParse(params.arguments);
  if (!parsed.success) return error(id, -32602, "Supply token and optional chain=arc|base|5042|8453, finality=latest|finalized; no extra arguments.");
  if (params._meta !== undefined && !record(params._meta)) return error(id, -32602, "Invalid tool metadata");
  const payment = (params._meta as Record<string, unknown> | undefined)?.["x402/payment"];
  if (payment !== undefined && !record(payment)) return error(id, -32602, "Invalid x402 payment payload");
  if (req.headers.has("payment-signature")) return error(id, -32602, "Send MCP payment only in params._meta['x402/payment']");
  const url = new URL("/v1/lookup", ORIGIN);
  for (const [key, v] of Object.entries(parsed.data)) if (v !== undefined) url.searchParams.set(key, v);
  const headers = new Headers();
  const ip = req.headers.get("x-vercel-forwarded-for");
  if (ip) headers.set("x-vercel-forwarded-for", ip);
  if (payment) headers.set("Payment-Signature", encode(payment));
  try {
    const response = await lookup(new Request(url, { headers }));
    const body = await response.json();
    const receipt = response.headers.get("payment-response");
    const result = { isError: !response.ok, structuredContent: body,
      content: [{ type: "text", text: JSON.stringify(body) }],
      _meta: { "argos/http-status": response.status,
        ...(response.headers.has("retry-after") ? { "argos/retry-after": response.headers.get("retry-after") } : {}),
        ...(receipt ? { "x402/payment-response": JSON.parse(Buffer.from(receipt, "base64").toString("utf8")) } : {}) } };
    return reply(id, result);
  } catch {
    return reply(id, { isError: true, content: [{ type: "text", text: "Lookup response unavailable. If a payment was supplied, retry identical arguments with the SAME payment. Do not authorize another payment until reconciled." }] });
  }
}
