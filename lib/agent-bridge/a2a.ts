import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedJson } from "../bounded-json";
import { inputSchema } from "../bridge-api/model";
import { NAME, ORIGIN } from "./config";

// Pin the binding: 0.3 clients must not silently receive 1.0 message shapes.
export const A2A_VERSION = "0.3.0";
export function agentCard() {
  return {
    protocolVersion: A2A_VERSION, name: NAME, version: "1.0.0",
    description: "Paid Arc/Base CTS bridge lookup and authenticated tracking of existing bridge jobs. External wallets sign transactions.",
    url: `${ORIGIN}/a2a`, preferredTransport: "JSONRPC",
    provider: { organization: "Argos Bot", url: "https://argosbot.io" },
    documentationUrl: `${ORIGIN}/a2a/docs`,
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["application/json"], defaultOutputModes: ["application/json"],
    securitySchemes: { jobBearer: { type: "http", scheme: "bearer", description: "Existing bridge job access token; required only for tracking that job." } },
    skills: [
      { id: "bridge_lookup", name: "Check a CTS bridge", tags: ["arc", "base", "bridge", "x402"], description: "Structured lookup, paid through the existing HTTP x402 route. Follow the payment resource in the 402 challenge; see documentation." },
      { id: "bridge_status", name: "Track an existing bridge job", tags: ["bridge", "finality"], description: "Retrieve a job using tasks/get and the job's Bearer token. Does not create jobs, sign or broadcast transactions." },
    ],
  };
}

const rpc = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string().max(128), z.number().finite()]), method: z.string(), params: z.unknown().optional() }).strict();
const send = z.object({ message: z.object({ kind: z.literal("message"), role: z.literal("user"), messageId: z.string().min(1).max(128), parts: z.array(z.object({ kind: z.literal("data"), data: z.object({ skill: z.literal("bridge_lookup"), input: inputSchema, rail: z.enum(["gateway", "direct"]).default("gateway") }).strict() }).strict()).length(1), contextId: z.string().min(1).max(128).optional() }).strict(), configuration: z.object({ acceptedOutputModes: z.array(z.string()).optional(), blocking: z.boolean().optional() }).strict().optional() }).strict();
const query = z.object({ id: z.string().regex(/^ab_[a-f0-9]{48}$/), historyLength: z.number().int().min(0).max(100).optional() }).strict();
type Dispatch = (request: Request) => Promise<Response>;
const response = (body: unknown, status = 200, headers?: Headers) => {
  const h = new Headers(headers); h.set("Content-Type", "application/json"); h.set("Cache-Control", "private, no-store");
  return new Response(JSON.stringify(body), { status, headers: h });
};
const error = (id: string | number | null, code: number, message: string, status = 200, headers?: Headers) => response({ jsonrpc: "2.0", id, error: { code, message } }, status, headers);

export async function handleA2A(req: Request, dispatch: Dispatch): Promise<Response> {
  if (req.method !== "POST") return response({ error: "Use POST JSON-RPC" }, 405, new Headers({ Allow: "POST" }));
  const version = req.headers.get("A2A-Version");
  if (version && version !== A2A_VERSION) return error(null, -32600, "Supported A2A version is 0.3.0", 400);
  let body: unknown;
  try { body = await boundedJson(req, 16_384); } catch { return error(null, -32700, "Invalid or oversized JSON request", 400); }
  const parsed = rpc.safeParse(body);
  if (!parsed.success) return error(null, -32600, "Invalid JSON-RPC request", 400);
  const { id, method, params } = parsed.data;
  try {
    if (method === "message/send") {
      const p = send.parse(params), data = p.message.parts[0].data;
      if (p.configuration?.acceptedOutputModes && !p.configuration.acceptedOutputModes.includes("application/json")) return error(id, -32005, "Output must accept application/json");
      const url = new URL(`/v1/lookup${data.rail === "direct" ? "/direct" : ""}`, ORIGIN);
      // Schema order makes the payment resource identical across retries.
      for (const [key, value] of Object.entries(data.input)) if (value !== undefined) url.searchParams.set(key, String(value));
      const headers = new Headers();
      for (const key of ["payment-signature", "payment-transaction", "x-vercel-forwarded-for"]) { const value = req.headers.get(key); if (value) headers.set(key, value); }
      const upstream = await dispatch(new Request(url, { headers }));
      // Return the original payment challenge/recovery response unchanged. Never
      // generate a new authorization or reinterpret an uncertain payment as paid.
      if (upstream.status !== 200) return upstream;
      const result = await upstream.json();
      const messageId = createHash("sha256").update(JSON.stringify([p.message.messageId, data])).digest("hex");
      return response({ jsonrpc: "2.0", id, result: { kind: "message", role: "agent", messageId, ...(p.message.contextId ? { contextId: p.message.contextId } : {}), parts: [{ kind: "data", data: result }] } }, 200, upstream.headers);
    }
    if (method === "tasks/get" || method === "tasks/cancel") {
      const p = query.parse(params);
      const headers = new Headers();
      for (const key of ["authorization", "x-vercel-forwarded-for"]) { const value = req.headers.get(key); if (value) headers.set(key, value); }
      const upstream = await dispatch(new Request(new URL(`/v1/jobs/${p.id}`, ORIGIN), { headers }));
      if (upstream.status === 401) return error(id, -32001, "Supply this job's Bearer access token", 401, new Headers({ "WWW-Authenticate": "Bearer" }));
      if (upstream.status === 404) return error(id, -32001, "Task not found");
      if (upstream.status !== 200) return error(id, -32603, "Job status unavailable; retry the same job", upstream.status);
      if (method === "tasks/cancel") return error(id, -32002, "Bridge jobs cannot be cancelled through A2A; submitted transactions cannot be undone");
      const job = await upstream.json();
      const state = job.state === "complete" ? "completed" : job.state === "failed" ? "failed" : ["ready", "awaiting_signature", "awaiting_submission"].includes(job.state) ? "input-required" : "working";
      return response({ jsonrpc: "2.0", id, result: { kind: "task", id: p.id, contextId: p.id, status: { state, timestamp: new Date(job.updatedAt).toISOString() }, artifacts: [{ artifactId: `${p.id}:status`, name: "Bridge job status", parts: [{ kind: "data", data: job }] }] } });
    }
    if (["message/stream", "tasks/resubscribe", "tasks/pushNotificationConfig/set", "tasks/pushNotificationConfig/get", "tasks/pushNotificationConfig/list", "tasks/pushNotificationConfig/delete", "agent/getAuthenticatedExtendedCard"].includes(method)) return error(id, -32004, "Operation not supported");
    return error(id, -32601, "Method not found");
  } catch (e) {
    return e instanceof z.ZodError ? error(id, -32602, "Invalid parameters; see /a2a/docs") : error(id, -32603, "Operation unavailable; preserve payment and job identifiers before retrying", 503);
  }
}

export const a2aDocs = `# Argos Bot A2A adapter (0.3.0)
GET /.well-known/agent-card.json for capabilities. POST /a2a with JSON-RPC.
Only structured data parts are supported; no natural-language interpretation.

Lookup example:
{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"lookup-1","parts":[{"kind":"data","data":{"skill":"bridge_lookup","input":{"token":"0xe86688530c456e099732f953ed7aa7c583026680","chain":"arc"},"rail":"gateway"}}]}}}

Payments use HTTP x402, not the A2A task-payment extension. The original lookup
route's 402 challenge names its payment resource and current networks/prices.
An x402 client must pay for that exact resource, then retry the identical A2A
message with Payment-Signature. Gateway and direct are explicit choices; never
switch rails or sign a new payment while the prior payment is unresolved.
Successful results include the existing request ID and receipt; PAYMENT-RESPONSE
is preserved. Discovery is free. Recovery HTTP responses are preserved unchanged.

Track an existing REST bridge job (same ID):
{"jsonrpc":"2.0","id":2,"method":"tasks/get","params":{"id":"ab_<48 hexadecimal characters>"}}
Supply Authorization: Bearer <the job access token>, never in message data.
This is a read-only snapshot; background polling/REST resume updates the job.
Wallet signing/submission and job creation remain on the documented REST API.
No streaming, push notifications, task history or cancellation. A2A does not
authorize wallet actions. No private keys are accepted or requested.
`;
