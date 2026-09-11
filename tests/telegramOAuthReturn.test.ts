import {it,expect,vi,beforeEach,afterEach} from "vitest";
import {NextRequest} from "next/server";
import {getFunctionName} from "convex/server";
const m=vi.hoisted(()=>({action:vi.fn()}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class{action=m.action;}}));
import {GET as callback} from "../app/api/auth/x/callback/route";
import {GET as start} from "../app/api/auth/x/start/route";
beforeEach(()=>{
 for(const [k,v]of Object.entries({X_OAUTH_CLIENT_ID:"client",X_OAUTH_CLIENT_SECRET:"secret",WEB_AUTH_SECRET:"test-secret",NEXT_PUBLIC_SITE_URL:"https://www.argosbot.io",NEXT_PUBLIC_CONVEX_URL:"https://example.convex.cloud"}))vi.stubEnv(k,v);
 m.action.mockReset().mockResolvedValue({address:"0x1111111111111111111111111111111111111111"});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json({access_token:"test"})).mockResolvedValueOnce(Response.json({data:{id:"123",username:"owner"}})));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("returns directly to Telegram without a web confirmation or website session",async()=>{
 const r=await callback(new NextRequest("https://www.argosbot.io/api/auth/x/callback?code=test&state=test-state",{headers:{cookie:"argus_x_oauth_state=test-state; argus_x_oauth_verifier=test-verifier; argus_telegram_link="+"a".repeat(64)}}));
 const target=new URL(r.headers.get("location")!);expect(target.origin+target.pathname).toBe("https://t.me/The_ArgosBot");expect(target.searchParams.get("start")).toMatch(/^link_[a-f0-9]{32}$/);
 const staged=m.action.mock.calls.find(([ref])=>getFunctionName(ref)==="telegram:stageXLink");expect(staged![1]).toMatchObject({nonce:"a".repeat(64),ownerXUserId:"123",returnToken:target.searchParams.get("start")!.slice(5)});
 expect(m.action.mock.calls.some(([ref])=>getFunctionName(ref)==="telegram:completeXLink")).toBe(false);
 expect(m.action.mock.calls.some(([ref])=>getFunctionName(ref)==="wallets:registerWebSession")).toBe(false);
 expect(r.headers.get("set-cookie")).toContain("Path=/api/auth/x");
});
it("moves to the callback host before setting sign-in cookies",async()=>{
 const r=await start(new NextRequest("https://argosbot.io/api/auth/x/start?telegramLink="+"a".repeat(64)));
 expect(r.headers.get("location")).toBe("https://www.argosbot.io/api/auth/x/start?telegramLink="+"a".repeat(64));expect(r.headers.get("set-cookie")).toBeNull();
});
it("rejects a callback without its browser state",async()=>{
 const r=await callback(new NextRequest("https://www.argosbot.io/api/auth/x/callback?code=test&state=bad"));
 expect(r.headers.get("location")).toContain("invalid_state");expect(m.action).not.toHaveBeenCalled();
});
