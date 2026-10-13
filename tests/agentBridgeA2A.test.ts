import { describe, expect, it, vi } from "vitest";
import { agentCard, handleA2A } from "../lib/agent-bridge/a2a";
import { agentPathAllowed } from "../lib/agent-bridge/hosting";
const token = "0xe86688530c456e099732f953ed7aa7c583026680";
const jobId = `ab_${"a".repeat(48)}`;
const request = (method: string, params: unknown, headers = {}) => new Request("https://bridge-api.argosbot.io/a2a", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
const lookup = { message: { kind: "message", role: "user", messageId: "request-1", parts: [{ kind: "data", data: { skill: "bridge_lookup", input: { token, chain: "arc" } } }] } };
describe("CTS A2A adapter", () => {
  it("advertises only supported capabilities and hostname routes", () => {
    expect(agentCard().protocolVersion).toBe("0.3.0");
    expect(agentCard().capabilities.streaming).toBe(false);
    expect(agentCard().skills.map(s => s.id)).toEqual(["bridge_lookup", "bridge_status", "bridge_authorization", "bridge_create", "bridge_continue"]);
    for (const p of ["/a2a", "/a2a/docs", "/.well-known/agent-card.json"]) expect(agentPathAllowed(p)).toBe(true);
    expect(agentPathAllowed("/a2a/internal")).toBe(false);
  });
  it("preserves payment challenges and uncertain recovery without retries", async () => {
    for (const status of [402, 409]) {
      const dispatch = vi.fn(async (_req: Request) => new Response("pending-payment", { status, headers: { "payment-required": "challenge" } }));
      const result = await handleA2A(request("message/send", lookup, { "payment-signature": "same-payment", "payment-transaction": "same-settlement" }), dispatch);
      expect(result.status).toBe(status);
      expect(await result.text()).toBe("pending-payment");
      expect(result.headers.get("payment-required")).toBe("challenge");
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0].headers.get("payment-signature")).toBe("same-payment");
      expect(dispatch.mock.calls[0][0].headers.get("payment-transaction")).toBe("same-settlement");
    }
  });
  it("wraps paid output with receipt and stable message identity", async () => {
    const dispatch = vi.fn(async (_req: Request) => Response.json({ requestId: "paid-1", result: { candidates: [] }, payment: { transaction: "receipt" } }, { headers: { "payment-response": "receipt" } }));
    const a = await handleA2A(request("message/send", lookup), dispatch);
    const b = await handleA2A(request("message/send", lookup), dispatch);
    expect(a.headers.get("payment-response")).toBe("receipt");
    const first = await a.json(), second = await b.json();
    expect(first.result.kind).toBe("message");
    expect(first.result.messageId).toBe(second.result.messageId);
    expect(first.result.parts[0].data.requestId).toBe("paid-1");
    expect(new URL(dispatch.mock.calls[0][0].url).pathname).toBe("/v1/lookup");
  });
  it("never exposes job state when authentication fails", async () => {
    const dispatch = vi.fn(async (_req: Request) => Response.json({ secret: "hidden" }, { status: 401 }));
    const result = await handleA2A(request("tasks/get", { id: jobId }), dispatch);
    expect(result.status).toBe(401);
    expect(await result.text()).not.toContain("hidden");
  });
  it("maps job lifecycle and forwards per-job authorization", async () => {
    for (const [state, expected] of [["awaiting_signature", "input-required"], ["forwarding", "working"], ["delivered", "working"], ["complete", "completed"], ["failed", "failed"]]) {
      const dispatch = vi.fn(async (_req: Request) => Response.json({ id: jobId, state, updatedAt: 1000 }));
      const result = await handleA2A(request("tasks/get", { id: jobId }, { authorization: "Bearer job-token" }), dispatch);
      expect((await result.json()).result.status.state).toBe(expected);
      expect(dispatch.mock.calls[0][0].headers.get("authorization")).toBe("Bearer job-token");
    }
  });
  it("rejects malformed requests, unsupported actions and cancellation", async () => {
    const dispatch = vi.fn(async () => Response.json({ state: "pending", updatedAt: 1000 }));
    expect((await (await handleA2A(request("message/send", { message: { ...lookup.message, taskId: jobId } }), dispatch)).json()).error.code).toBe(-32602);
    expect(dispatch).not.toHaveBeenCalled();
    expect((await (await handleA2A(request("tasks/cancel", { id: jobId }), dispatch)).json()).error.code).toBe(-32002);
    expect((await (await handleA2A(request("message/stream", {}), dispatch)).json()).error.code).toBe(-32004);
  });
  const intent = { clientRequestId: "bbed37cd-755f-45a8-95c8-858c919a39a1", chain: 5042, token, account: token, mode: "setup", amount: "0", allowSetup: true, riskAcknowledged: true, maxForwardingFeeAtomic: "100", maxGasBudgetAtomic: "100" };
  const command = (data: unknown, taskId?: string, contextId?: string) => ({ message: { kind: "message", role: "user", messageId: "workflow-1", parts: [{ kind: "data", data }], ...(taskId ? { taskId } : {}), ...(contextId ? { contextId } : {}) } });
  it("prepares intent authorization without forwarding payment or job credentials", async () => {
    const dispatch = vi.fn(async (_r: Request) => Response.json({ typedData: { domain: {} }, intent }));
    const r = await handleA2A(request("message/send", command({ skill: "bridge_authorization", input: intent }), { authorization: "Bearer private", "payment-signature": "payment" }), dispatch);
    expect((await r.json()).result.kind).toBe("message");
    const upstream = dispatch.mock.calls[0][0];
    expect(new URL(upstream.url).pathname).toBe("/v1/authorization");
    expect(upstream.method).toBe("POST");
    expect(await upstream.json()).toEqual(intent);
    expect(upstream.headers.has("authorization")).toBe(false);
    expect(upstream.headers.has("payment-signature")).toBe(false);
  });
  it("creates a paid durable task and preserves signed intent and receipt", async () => {
    const input = { intent, expiresAt: 123456, signature: `0x${"1".repeat(130)}` };
    const dispatch = vi.fn(async (_r: Request) => Response.json({ requestId: "paid-create", payment: { hash: "settled" }, result: { job: { id: jobId, state: "ready", updatedAt: 1000 }, accessToken: "private-job-token", feeScope: "one job" } }, { headers: { "payment-response": "receipt" } }));
    const r = await handleA2A(request("message/send", command({ skill: "bridge_create", input, rail: "direct" }), { "payment-signature": "same-payment" }), dispatch);
    const t = (await r.json()).result;
    expect(t).toMatchObject({ kind: "task", id: jobId, contextId: jobId, status: { state: "input-required" }, metadata: { accessToken: "private-job-token", requestId: "paid-create" } });
    expect(r.headers.get("payment-response")).toBe("receipt");
    const upstream = dispatch.mock.calls[0][0];
    expect(new URL(upstream.url).pathname).toBe("/v1/jobs/direct");
    expect(await upstream.json()).toEqual(input);
    expect(upstream.headers.get("payment-signature")).toBe("same-payment");
  });
  it("requires signed creation schema before dispatch", async () => {
    const dispatch = vi.fn();
    const r = await handleA2A(request("message/send", command({ skill: "bridge_create", input: { intent } })), dispatch);
    expect((await r.json()).error.code).toBe(-32602);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("continues wallet steps using only authenticated job routes", async () => {
    const stepId = "bbed37cd-755f-45a8-95c8-858c919a39a1";
    for (const input of [{ operation: "next" }, { operation: "resume" }, { operation: "arm", stepId }, { operation: "renew", stepId }, { operation: "transactions", stepId, hash: `0x${"a".repeat(64)}` }]) {
      const dispatch = vi.fn(async (_r: Request) => Response.json({ id: jobId, state: "awaiting_signature", updatedAt: 1000 }));
      const r = await handleA2A(request("message/send", command({ skill: "bridge_continue", input }, jobId, jobId), { authorization: "Bearer job-token", "payment-signature": "do-not-charge" }), dispatch);
      expect((await r.json()).result.status.state).toBe("input-required");
      const upstream = dispatch.mock.calls[0][0];
      expect(new URL(upstream.url).pathname).toBe(`/v1/jobs/${jobId}/${input.operation}`);
      expect(upstream.headers.get("authorization")).toBe("Bearer job-token");
      expect(upstream.headers.has("payment-signature")).toBe(false);
      expect(await upstream.json()).toEqual(Object.fromEntries(Object.entries(input).filter(([k]) => k !== "operation")));
    }
  });
  it("blocks missing credentials, cross-task contexts and raw transaction input", async () => {
    const dispatch = vi.fn();
    const noAuth = await handleA2A(request("message/send", command({ skill: "bridge_continue", input: { operation: "next" } }, jobId)), dispatch);
    expect(noAuth.status).toBe(401);
    const mismatch = await handleA2A(request("message/send", command({ skill: "bridge_continue", input: { operation: "next" } }, jobId, "different-task")), dispatch);
    expect((await mismatch.json()).error.code).toBe(-32602);
    const raw = await handleA2A(request("message/send", command({ skill: "bridge_continue", input: { operation: "transactions", stepId: "bbed37cd-755f-45a8-95c8-858c919a39a1", hash: `0x${"a".repeat(64)}`, privateKey: "never" } }, jobId)), dispatch);
    expect((await raw.json()).error.code).toBe(-32602);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("does not retry or reinterpret uncertain bridge creation payments", async () => {
    const dispatch = vi.fn(async (_r: Request) => Response.json({ requestId: "uncertain", state: "pending" }, { status: 409 }));
    const r = await handleA2A(request("message/send", command({ skill: "bridge_create", input: { intent, expiresAt: 123456, signature: `0x${"1".repeat(130)}` } }), { "payment-signature": "original" }), dispatch);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ requestId: "uncertain", state: "pending" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
