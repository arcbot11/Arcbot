import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {ConvexError} from "convex/values";
const m=vi.hoisted(()=>({mutate:vi.fn(),gate:vi.fn(),session:vi.fn()}));
vi.mock("../lib/launches/execution-checks",()=>({assertLaunchEnabled:m.gate}));
vi.mock("../lib/launches/service",()=>({launchBackend:()=>({mutate:m.mutate}),advanceLaunch:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:m.session}));
import {WebError} from "../lib/otc/http";
import {LaunchError} from "../lib/launches/policy";
import {POST} from "../app/api/wallet/launches/route";
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({owner:"1",walletAddress:"0x1111111111111111111111111111111111111111"});});
afterEach(()=>vi.unstubAllEnvs());
it.each(["csrf","pause"])("marks a definite pre-acceptance %s rejection",async kind=>{
  vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED","true");vi.stubEnv("NEXT_PUBLIC_CONVEX_URL","https://example.convex.cloud");vi.stubEnv("WEB_AUTH_SECRET","secret");
  if(kind==="csrf")m.session.mockRejectedValue(new WebError("Invalid CSRF",403));
  else m.gate.mockImplementation(()=>{throw new LaunchError("EXECUTION_DISABLED","Paused");});
  const result=await POST(new NextRequest("https://www.argosbot.io/api/wallet/launches",{method:"POST",body:JSON.stringify({action:"execute",requestId:"00000000-0000-4000-8000-000000000001",revision:1})}));
  expect(await result.json()).toMatchObject({acceptance:"rejected"});expect(m.mutate).not.toHaveBeenCalled();
});
it("distinguishes authoritative rejection from a transport error",async()=>{
  vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED","true");vi.stubEnv("NEXT_PUBLIC_CONVEX_URL","https://example.convex.cloud");vi.stubEnv("WEB_AUTH_SECRET","secret");
  const request=()=>new NextRequest("https://www.argosbot.io/api/wallet/launches",{method:"POST",body:JSON.stringify({action:"execute",requestId:"00000000-0000-4000-8000-000000000001",revision:1})});
  m.mutate.mockRejectedValue(new ConvexError({acceptance:"rejected",message:"Prepare again."}));
  const rejected=await POST(request());expect(rejected.status).toBe(409);expect(await rejected.json()).toMatchObject({acceptance:"rejected"});
  m.mutate.mockRejectedValue(Error("lost response"));
  const uncertain=await POST(request());expect(uncertain.status).toBe(503);expect(await uncertain.json()).not.toHaveProperty("acceptance");
});
