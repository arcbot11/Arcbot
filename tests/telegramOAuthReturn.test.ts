import {it,expect,vi,beforeEach,afterEach} from "vitest";
import {NextRequest} from "next/server";
import {getFunctionName} from "convex/server";
const m=vi.hoisted(()=>({action:vi.fn(),mutation:vi.fn()}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class{action=m.action;mutation=m.mutation;}}));
import {createTelegramWebSession,readWebWalletSession,WEB_WALLET_SESSION_COOKIE} from "../lib/web-wallet-session";
import {GET as callback} from "../app/api/auth/x/callback/route";
import {GET as start} from "../app/api/auth/x/start/route";
import {oauthCookieName,readTelegramRetry,telegramReturnToken,sealOAuthAttempt} from "../lib/x-oauth-attempt";
import {BROWSER_COOKIE,browserValue,hashAuth} from "../lib/web-browser-auth";
beforeEach(()=>{
 m.mutation.mockReset().mockResolvedValue(true);
 for(const [k,v]of Object.entries({X_OAUTH_CLIENT_ID:"client",X_OAUTH_CLIENT_SECRET:"secret",WEB_AUTH_SECRET:"test-secret",NEXT_PUBLIC_SITE_URL:"https://www.argosbot.io",NEXT_PUBLIC_CONVEX_URL:"https://example.convex.cloud"}))vi.stubEnv(k,v);
 m.action.mockReset().mockResolvedValue({address:"0x1111111111111111111111111111111111111111"});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json({access_token:"test"})).mockResolvedValueOnce(Response.json({data:{id:"123",username:"owner"}})));
});
it("replaces a Telegram browser session with X and invalidates the pending TG exchange cookie",async()=>{
 const tg=createTelegramWebSession("0x1111111111111111111111111111111111111111","456","web_abcdefghijklmnop",Math.floor(Date.now()/1000),"test-secret");
 const browser=browserValue("test-secret"),family=hashAuth(browser.split(".")[0]),state="v2_"+"a".repeat(43);
 const attempt=sealOAuthAttempt({verifier:"test-verifier",returnTo:"/wallet",browserFamily:family,generation:1,expiresAt:Date.now()+600000},"test-secret");
 const r=await callback(new NextRequest(`https://www.argosbot.io/api/auth/x/callback?code=test&state=${state}`,{headers:{cookie:`${oauthCookieName(state)}=${attempt}; ${BROWSER_COOKIE}=${browser}; ${WEB_WALLET_SESSION_COOKIE}=${tg}`}}));
 expect(r.headers.get("location")).toBe("https://www.argosbot.io/wallet");
 expect(readWebWalletSession(r.cookies.get(WEB_WALLET_SESSION_COOKIE)!.value,"test-secret")).toMatchObject({xUserId:"123"});
 expect(m.mutation.mock.calls.some(([ref,a])=>getFunctionName(ref)==="webAuth:activate"&&a.browserHash===family)).toBe(true);
 expect(r.cookies.get("argos_tg_web_login")?.value).toBe("");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("returns a mobile callback to Firefox before exchanging its code, then signs in only with the original browser cookies",async()=>{
 const browser=browserValue("test-secret"),family=hashAuth(browser.split(".")[0]),state="v2_"+"z".repeat(43);
 const attempt=sealOAuthAttempt({verifier:"original-pkce",returnTo:"/otc",browserFamily:family,generation:1,expiresAt:Date.now()+600000},"test-secret");
 const url=`https://www.argosbot.io/api/auth/x/callback?code=unused-code&state=${state}`;
 const handoff=await callback(new NextRequest(url,{headers:{"user-agent":"Android X in-app browser"}}));
 expect(handoff.status).toBe(200);expect(await handoff.text()).toContain("package=org.mozilla.firefox");
 expect(handoff.cookies.get(WEB_WALLET_SESSION_COOKIE)).toBeUndefined();expect(fetch).not.toHaveBeenCalled();expect(m.action).not.toHaveBeenCalled();
 const finished=await callback(new NextRequest(url+"&browserReturn=1",{headers:{cookie:`${oauthCookieName(state)}=${attempt}; ${BROWSER_COOKIE}=${browser}`}}));
 expect(finished.headers.get("location")).toBe("https://www.argosbot.io/otc");
 expect(readWebWalletSession(finished.cookies.get(WEB_WALLET_SESSION_COOKIE)!.value,"test-secret")?.browserFamily).toBe(family);
 expect(new URLSearchParams(vi.mocked(fetch).mock.calls[0][1]!.body as URLSearchParams).get("code_verifier")).toBe("original-pkce");
});
it("does not loop or exchange a mobile return without the original cookies",async()=>{
 const r=await callback(new NextRequest("https://www.argosbot.io/api/auth/x/callback?code=test&state=v2_"+"a".repeat(43)+"&browserReturn=1",{headers:{"user-agent":"Android"}}));
 expect(r.headers.get("location")).toContain("invalid_state");expect(fetch).not.toHaveBeenCalled();expect(r.cookies.get(WEB_WALLET_SESSION_COOKIE)).toBeUndefined();
});
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
async function begin(nonce="a".repeat(64)){
 const r=await start(new NextRequest("https://www.argosbot.io/api/auth/x/start?telegramLink="+nonce));
 const state=new URL(r.headers.get("location")!).searchParams.get("state")!;
 const cookie=r.cookies.get(oauthCookieName(state)!)!;
 return {state,cookie:`${cookie.name}=${cookie.value}`};
}
it("keeps two concurrent sign-ins independent and completes the older one",async()=>{
 const first=await begin(),second=await begin("b".repeat(64));
 expect(first.state).not.toBe(second.state);
 const r=await callback(new NextRequest(`https://www.argosbot.io/api/auth/x/callback?code=first&state=${first.state}`,{headers:{cookie:`${first.cookie}; ${second.cookie}`}}));
 expect(r.headers.get("location")).toContain("https://t.me/The_ArgosBot?start=link_");
 expect(m.action.mock.calls.find(([ref])=>getFunctionName(ref)==="telegram:stageXLink")![1].nonce).toBe("a".repeat(64));
 expect(r.cookies.get(oauthCookieName(second.state)!)).toBeUndefined();
});
it("keeps Telegram context on a failed exchange and its retry",async()=>{
 const first=await begin();vi.mocked(fetch).mockReset().mockResolvedValue(new Response("",{status:503}));
 const r=await callback(new NextRequest(`https://www.argosbot.io/api/auth/x/callback?code=first&state=${first.state}`,{headers:{cookie:first.cookie}}));
 const target=new URL(r.headers.get("location")!);expect(target.searchParams.get("reason")).toBe("token_exchange");
 const retry=target.searchParams.get("retry")!;expect(readTelegramRetry(retry,"test-secret")).toBe("a".repeat(64));
 const resumed=await start(new NextRequest(`https://www.argosbot.io/api/auth/x/start?retry=${encodeURIComponent(retry)}`));
 expect(resumed.headers.get("location")).toMatch(/^https:\/\/x.com\/i\/oauth2\/authorize/);
});
it("rejects a tampered attempt before token exchange or wallet creation",async()=>{
 const first=await begin();vi.mocked(fetch).mockClear();m.action.mockClear();
 const r=await callback(new NextRequest(`https://www.argosbot.io/api/auth/x/callback?code=first&state=${first.state}`,{headers:{cookie:first.cookie+"x"}}));
 expect(r.headers.get("location")).toContain("invalid_state");expect(fetch).not.toHaveBeenCalled();expect(m.action).not.toHaveBeenCalled();
});
it("rejects expired Telegram links before redirecting to X",async()=>{
 m.action.mockResolvedValue(null);const r=await start(new NextRequest("https://www.argosbot.io/api/auth/x/start?telegramLink="+"a".repeat(64)));
 expect(r.headers.get("location")).toContain("telegram_expired");
});
it("uses the same return token for repeated staging without mixing identities",()=>{
 expect(telegramReturnToken("a","123","secret")).toBe(telegramReturnToken("a","123","secret"));
 expect(telegramReturnToken("a","123","secret")).not.toBe(telegramReturnToken("a","456","secret"));
});
