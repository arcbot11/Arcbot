import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedJson } from "../bounded-json";
import { inputSchema } from "../bridge-api/model";
import { NAME, ORIGIN } from "./config";
import { createInput, jobInput } from "./model";
import { hashSchema } from "../bridge/validation";

// Pin the binding: 0.3 clients must not silently receive 1.0 message shapes.
export const A2A_VERSION = "0.3.0";
export function agentCard() {
  return {
    protocolVersion: A2A_VERSION, name: NAME, version: "1.1.0",
    description: "Paid Arc/Base CTS lookup, authorized bridge job creation, transaction preparation and recovery. External wallets sign and broadcast transactions.",
    url: `${ORIGIN}/a2a`, preferredTransport: "JSONRPC",
    provider: { organization: "Argos Bot", url: "https://argosbot.io" },
    documentationUrl: `${ORIGIN}/a2a/docs`,
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["application/json"], defaultOutputModes: ["application/json"],
    securitySchemes: { jobBearer: { type: "http", scheme: "bearer", description: "Per-job access token required for tracking and continuing that job." } },
    skills: [
      { id: "bridge_lookup", name: "Check a CTS bridge", tags: ["arc", "base", "bridge", "x402"], description: "Structured lookup, paid through the existing HTTP x402 route. Follow the payment resource in the 402 challenge; see documentation." },
      { id: "bridge_status", name: "Track an existing bridge job", tags: ["bridge", "finality"], description: "Retrieve a job using tasks/get and the job's Bearer token. Does not create jobs, sign or broadcast transactions." },
      { id: "bridge_authorization", name: "Prepare wallet authorization", tags: ["bridge", "wallet"], description: "Get typed data for a fixed setup or transfer intent. External wallet signs it; no funds move." },
      { id: "bridge_create", name: "Create a bridge job", tags: ["bridge", "x402"], description: "Purchase a durable setup or transfer job using signed wallet intent and HTTP x402 payment. Returns the task and its access token." },
      { id: "bridge_continue", name: "Continue a bridge transaction workflow", tags: ["bridge", "transactions", "recovery"], description: "Use taskId and its Bearer token to prepare, arm, renew, record a transaction hash or reconcile progress. External wallets sign and broadcast; no private keys accepted." },
    ],
  };
}

const rpc = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string().max(128), z.number().finite()]), method: z.string(), params: z.unknown().optional() }).strict();
const taskId = z.string().regex(/^ab_[a-f0-9]{48}$/);
const operation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("next") }).strict(),
  z.object({ operation: z.literal("resume") }).strict(),
  z.object({ operation: z.literal("arm"), stepId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal("renew"), stepId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal("transactions"), stepId: z.string().uuid(), hash: hashSchema }).strict(),
]);
const command = z.discriminatedUnion("skill", [
  z.object({ skill: z.literal("bridge_lookup"), input: inputSchema, rail: z.enum(["gateway", "direct"]).default("gateway") }).strict(),
  z.object({ skill: z.literal("bridge_authorization"), input: jobInput }).strict(),
  z.object({ skill: z.literal("bridge_create"), input: createInput, rail: z.enum(["gateway", "direct"]).default("gateway") }).strict(),
  z.object({ skill: z.literal("bridge_continue"), input: operation }).strict(),
]);
const send = z.object({ message: z.object({ kind: z.literal("message"), role: z.literal("user"), messageId: z.string().min(1).max(128), parts: z.array(z.object({ kind: z.literal("data"), data: command }).strict()).length(1), taskId: taskId.optional(), contextId: z.string().min(1).max(128).optional() }).strict(), configuration: z.object({ acceptedOutputModes: z.array(z.string()).optional(), blocking: z.boolean().optional() }).strict().optional() }).strict();
const query = z.object({ id: z.string().regex(/^ab_[a-f0-9]{48}$/), historyLength: z.number().int().min(0).max(100).optional() }).strict();
type Dispatch = (request: Request) => Promise<Response>;
const response = (body: unknown, status = 200, headers?: Headers) => {
  const h = new Headers(headers); h.set("Content-Type", "application/json"); h.set("Cache-Control", "private, no-store");
  return new Response(JSON.stringify(body), { status, headers: h });
};
const error = (id: string | number | null, code: number, message: string, status = 200, headers?: Headers) => response({ jsonrpc: "2.0", id, error: { code, message } }, status, headers);
function task(job: { id: string; state: string; updatedAt: number }, metadata?: unknown) {
  const state = job.state === "complete" ? "completed" : job.state === "failed" ? "failed" : ["ready", "awaiting_signature", "awaiting_submission"].includes(job.state) ? "input-required" : "working";
  return { kind: "task", id: job.id, contextId: job.id, status: { state, timestamp: new Date(job.updatedAt).toISOString() }, artifacts: [{ artifactId: `${job.id}:status`, name: "Bridge job and wallet input", parts: [{ kind: "data", data: job }] }], ...(metadata ? { metadata } : {}) };
}

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
      const continuation = data.skill === "bridge_continue";
      if (continuation ? (!p.message.taskId || (p.message.contextId && p.message.contextId !== p.message.taskId)) : !!p.message.taskId) return error(id, -32602, "Only bridge_continue accepts taskId; contextId must match that job");
      const path = data.skill === "bridge_lookup" ? `/v1/lookup${data.rail === "direct" ? "/direct" : ""}`
        : data.skill === "bridge_authorization" ? "/v1/authorization"
        : data.skill === "bridge_create" ? `/v1/jobs${data.rail === "direct" ? "/direct" : ""}`
        : `/v1/jobs/${p.message.taskId}/${data.input.operation}`;
      const url = new URL(path, ORIGIN);
      if (data.skill === "bridge_lookup") {
        // Schema order makes the payment resource identical across retries.
        for (const [key, value] of Object.entries(data.input)) if (value !== undefined) url.searchParams.set(key, String(value));
      }
      const headers = new Headers();
      const forwarded = continuation ? ["authorization", "x-vercel-forwarded-for"] : data.skill === "bridge_authorization" ? ["x-vercel-forwarded-for"] : ["payment-signature", "payment-transaction", "x-vercel-forwarded-for"];
      for (const key of forwarded) { const value = req.headers.get(key); if (value) headers.set(key, value); }
      if (continuation && !headers.has("authorization")) return error(id, -32001, "Supply this job's Bearer access token", 401, new Headers({ "WWW-Authenticate": "Bearer" }));
      const postBody = data.skill === "bridge_continue" ? Object.fromEntries(Object.entries(data.input).filter(([key]) => key !== "operation")) : data.input;
      const post = data.skill !== "bridge_lookup";
      if (post) headers.set("content-type", "application/json");
      const upstream = await dispatch(new Request(url, { method: post ? "POST" : "GET", headers, ...(post ? { body: JSON.stringify(postBody) } : {}) }));
      // Return the original payment challenge/recovery response unchanged. Never
      // generate a new authorization or reinterpret an uncertain payment as paid.
      if (upstream.status !== 200) return upstream;
      const result = await upstream.json();
      if (data.skill === "bridge_create") {
        // Access token is returned only in the same authenticated paid create
        // response that REST already permits; it is never accepted in task data.
        return response({ jsonrpc: "2.0", id, result: task(result.result.job, { requestId: result.requestId, payment: result.payment, accessToken: result.result.accessToken, feeScope: result.result.feeScope }) }, 200, upstream.headers);
      }
      if (continuation) return response({ jsonrpc: "2.0", id, result: task(result) }, 200, upstream.headers);
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
      return response({ jsonrpc: "2.0", id, result: task(job) });
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
Creation and continuation use message/send with exactly one structured DataPart:
- bridge_authorization: input is the REST JobIntent. Returns typed data for the external wallet to sign. No token transfer is authorized by this API-job signature.
- bridge_create: input is {intent, expiresAt, signature}; rail is gateway or direct. The signed intent must include clientRequestId, chain, token, account, mode (setup or transfer), amount, allowSetup, riskAcknowledged:true, maxForwardingFeeAtomic and maxGasBudgetAtomic. Use the returned authorization intent exactly. Pay the exact job resource in its HTTP 402 challenge and retry the SAME request/payment. Returns a Task; save its id, contextId and metadata.accessToken privately. The one job fee includes subsequent continuation calls.
- bridge_continue: message.taskId is that job ID; contextId, if supplied, must equal it. Supply the job Bearer token as an HTTP header. input is {operation:"next"|"resume"}, {operation:"arm"|"renew",stepId}, or {operation:"transactions",stepId,hash}.
Call next to prepare, review all fees/chain/calldata, then arm immediately before wallet signing. Only arm returns signable transaction data. The EXTERNAL wallet signs and broadcasts the exact armed transaction, saving its hash before broadcast. Record that same hash using transactions. Resume reconciles receipts; never re-broadcast or create another transfer merely because an RPC timed out. Renew follows the existing same-nonce recovery guards. Continue with next only when the previous step is confirmed.
Tasks request input while awaiting wallet action. Delivered stays working until finalized. Task artifacts contain the complete public job including the current step and prepared transaction data. Credentials never belong in task parts. No server-held-wallet signing or broadcasting is offered.
No streaming, push notifications, task history or cancellation. A2A does not
authorize wallet actions. No private keys are accepted or requested.
`;
