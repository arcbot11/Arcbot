import { expect, it, vi } from "vitest";
import { handleMcp, MCP_TOOL } from "../lib/arcus-lookup/mcp";
import { handleArcus } from "../lib/arcus-lookup/http";
import { ORIGIN } from "../lib/arcus-lookup/config";
import { agentRegistration } from "../lib/arcus-lookup/identity";
const token = "0x" + "11".repeat(20);
const request = (method: string, params?: unknown, extra: Record<string,string> = {}, id: number | undefined = 1) => new Request(ORIGIN + "/mcp", {
  method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...extra },
  body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
});
it("offers free discovery, resources and initialization without invoking lookup", async () => {
  const lookup = vi.fn();
  for (const [method, params] of [["initialize", { protocolVersion:"2025-06-18", capabilities:{}, clientInfo:{name:"test",version:"1"} }], ["tools/list", {}], ["resources/list", {}], ["resources/read", {uri:ORIGIN+"/llms.txt"}]] as const) {
    const body = await (await handleMcp(request(method,params),lookup,"docs")).json();
    expect(body.result).toBeDefined();
  }
  expect(lookup).not.toHaveBeenCalled();
});
it("preserves payment challenges, canonical arguments and payment receipts", async () => {
  const challenge = {x402Version:2, accepts:[{amount:"7000"}]};
  const lookup = vi.fn(async () => Response.json(challenge,{status:402}));
  const params = {name:MCP_TOOL,arguments:{token,chain:"base"}};
  const body = await (await handleMcp(request("tools/call",params),lookup,"docs")).json();
  expect(body.result).toMatchObject({isError:true,structuredContent:challenge});
  expect(JSON.parse(body.result.content[0].text)).toEqual(challenge);
  const supplied = lookup.mock.calls[0] as unknown as [Request];
  expect(supplied[0].url).toBe(ORIGIN+`/v1/lookup?token=${token}&chain=base&finality=latest`);
  const payment = {x402Version:2,payload:{signature:"private-payment"}};
  const receipt = {success:true,transaction:"0x123"};
  const paid = vi.fn(async (req:Request) => {
    expect(JSON.parse(Buffer.from(req.headers.get("payment-signature")!,"base64").toString())).toEqual(payment);
    return Response.json({recovered:true,result:{status:"complete"}}, {headers:{"payment-response":Buffer.from(JSON.stringify(receipt)).toString("base64")}});
  });
  const result = await (await handleMcp(request("tools/call",{...params,_meta:{"x402/payment":payment}}),paid,"docs")).json();
  expect(result.result).toMatchObject({isError:false,structuredContent:{recovered:true},_meta:{"x402/payment-response":receipt}});
  expect(JSON.stringify(result)).not.toContain("private-payment");
});
it("rejects unsafe origins, invalid arguments and paid notifications before lookup", async () => {
  const lookup = vi.fn();
  expect((await handleMcp(request("tools/list",{}, {origin:"https://evil.example"}),lookup,"")).status).toBe(403);
  for (const args of [{token:"invalid"}, {token,extra:true}]) {
    expect((await (await handleMcp(request("tools/call",{name:MCP_TOOL,arguments:args}),lookup,"")).json()).error.code).toBe(-32602);
  }
  const notification = new Request(ORIGIN+"/mcp",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",method:"tools/call",params:{name:MCP_TOOL,arguments:{token}}})});
  expect((await handleMcp(notification,lookup,"")).status).toBe(400);
  expect(lookup).not.toHaveBeenCalled();
});
it("preserves uncertain settlement and instructs same-payment recovery on transport errors",async()=>{
  const params={name:MCP_TOOL,arguments:{token}};
  const uncertain=await (await handleMcp(request("tools/call",params),async()=>Response.json({state:"uncertain"},{status:409}),"")).json();
  expect(uncertain.result).toMatchObject({isError:true,structuredContent:{state:"uncertain"},_meta:{"argos/http-status":409}});
  const failed=await (await handleMcp(request("tools/call",params),async()=>{throw Error("secret")},"")).json();
  expect(failed.result.content[0].text).toContain("SAME payment");
  expect(JSON.stringify(failed)).not.toContain("secret");
});
it("routes MCP on isolated host and advertises no A2A or invented trust",async()=>{
  expect((await handleArcus(request("tools/list"))).status).toBe(200);
  expect((await handleArcus(new Request(ORIGIN+"/mcp"))).status).toBe(405);
  const meta=agentRegistration();
  expect(meta.services.find(s=>s.name==="MCP")?.endpoint).toBe(ORIGIN+"/mcp");
  expect(meta.services.some(s=>s.name==="A2A")).toBe(false);
  expect(meta.supportedTrust).toEqual([]);
});
