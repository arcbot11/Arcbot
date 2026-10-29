import { expect, it } from "vitest";
import { handleVercel } from "../lib/agent-bridge/vercel";
import { OPTIONS as standalonePreflight } from "../app/api/cts-agent/[[...path]]/route";
import { handleArcus } from "../lib/arcus-lookup/http";
import * as standard from "../app/api/v1/bridge/lookup/route";
import * as direct from "../app/api/v1/bridge/lookup/direct/route";

const origin = "https://www.argosbot.io";
function cors(response: Response) {
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  const allowed=response.headers.get("access-control-allow-headers")!.toLowerCase();
  for(const h of ["authorization","payment-signature","payment-transaction","content-type"])expect(allowed).toContain(h);
  expect(response.headers.get("access-control-expose-headers")!.toLowerCase()).toContain("payment-response");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
}
it("preflights paid lookups, signed job creation, authorization and A2A without executing them",async()=>{
  for(const path of ["/v1/lookup","/v1/lookup/direct","/v1/jobs","/v1/jobs/direct","/v1/authorization","/a2a","/v1/jobs/ab_"+"a".repeat(48)+"/next"]){
    const r=await standalonePreflight(new Request("https://bridge-api.argosbot.io"+path,{method:"OPTIONS",headers:{origin,"Access-Control-Request-Headers":"authorization,payment-signature,payment-transaction,content-type"}}));
    expect(r.status).toBe(204);cors(r);expect(r.headers.get("cache-control")).toBe("no-store");
  }
});
it("includes recovery headers on website and Arcus lookup preflights and real error responses",async()=>{
  for(const route of [standard,direct]){cors(await route.OPTIONS());const r=await route.GET(new Request(origin+"/api/v1/bridge/lookup?token=invalid"));expect(r.status).toBe(400);cors(r);}
  const arcus=await handleArcus(new Request("https://arcus-api.argosbot.io/v1/lookup",{method:"OPTIONS"}));cors(arcus);
  const r=await handleVercel(new Request("https://bridge-api.argosbot.io/v1/lookup?token=invalid",{headers:{origin}}));expect(r.status).toBe(400);cors(r);
});
it("does not expose the internal worker endpoint through public CORS",async()=>{
  const r=await handleVercel(new Request("https://bridge-api.argosbot.io/internal/poll",{method:"POST",body:"{}",headers:{origin}}));expect(r.status).toBe(401);expect(r.headers.has("access-control-allow-origin")).toBe(false);
});
