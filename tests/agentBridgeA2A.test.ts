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
    expect(agentCard().skills.map(s => s.id)).toEqual(["bridge_lookup", "bridge_status"]);
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
});
