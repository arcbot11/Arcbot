import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
import { BROWSER_COOKIE, browserValue } from "../lib/web-browser-auth";
import { createWebWalletSession, readWebWalletSession, WEB_WALLET_SESSION_COOKIE } from "../lib/web-wallet-session";
const m=vi.hoisted(()=>({mutation:vi.fn(),action:vi.fn()}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class{mutation=m.mutation;action=m.action;}}));
import { POST } from "../app/api/auth/telegram/route";
const site="https://www.argosbot.io", secret="offline-test-only", wallet="0x1111111111111111111111111111111111111111";
const request=(action:string,cookie="",origin=site,extra:Record<string,unknown>={})=>new NextRequest(`${site}/api/auth/telegram`,{method:"POST",headers:{origin,cookie:`${BROWSER_COOKIE}=${browserValue(secret)}; ${cookie}`,"content-type":"application/json"},body:JSON.stringify({action,...extra})});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("WEB_AUTH_SECRET",secret);vi.stubEnv("NEXT_PUBLIC_CONVEX_URL","https://example.convex.cloud");vi.stubEnv("NEXT_PUBLIC_SITE_URL",site);m.mutation.mockResolvedValue({status:"pending"});m.action.mockResolvedValue(true);});
afterEach(()=>vi.unstubAllEnvs());
it("rejects cross-origin initiation and exchange before using backend authority",async()=>{
  for(const action of ["start","check"])expect((await POST(request(action,"","https://evil.example"))).status).toBe(403);
  expect(m.mutation).not.toHaveBeenCalled();
});
it("puts the browser proof in an HttpOnly cookie, never the Telegram link",async()=>{
  const r=await POST(request("start")),data=await r.json(),cookie=r.cookies.get("argos_tg_web_login")!.value;
  const [token,verifier]=cookie.split(".");
  expect(data.url).toBe(`https://t.me/The_ArgosBot?start=web_${token}`);
  expect(data.url).not.toContain(verifier);expect(JSON.stringify(data)).not.toContain(verifier);
  expect(r.headers.get("set-cookie")).toMatch(/HttpOnly/);expect(r.headers.get("set-cookie")).toMatch(/SameSite=strict/i);
  expect(getFunctionName(m.mutation.mock.calls[0][0])).toBe("telegramWebAuth:start");
});
it("cannot exchange a link without the browser proof",async()=>{
  expect(await (await POST(request("check"))).json()).toEqual({status:"expired"});
  expect(m.mutation).not.toHaveBeenCalled();
});
it("uses atomic exchange for account replacement and issues a browser-bound session",async()=>{
  const previous=createWebWalletSession(wallet,"456","alice",secret);
  const proof=`argos_tg_web_login=${"a".repeat(32)}.${"b".repeat(64)}`;
  m.mutation.mockResolvedValue({status:"approved",telegramUserId:"123",walletAddress:wallet,authenticatedAt:Math.floor(Date.now()/1000)});
  const r=await POST(request("check",`${proof}; ${WEB_WALLET_SESSION_COOKIE}=${previous}`));
  const current=readWebWalletSession(r.cookies.get(WEB_WALLET_SESSION_COOKIE)!.value,secret)!;
  expect(current).toMatchObject({provider:"telegram",telegramUserId:"123"});expect(current.xUserId).toBeUndefined();
  expect(getFunctionName(m.mutation.mock.calls[0][0])).toBe("telegramWebAuth:exchange");
  expect(current.browserFamily).toBe(m.mutation.mock.calls[0][1].browserFamily);
  expect(m.action).not.toHaveBeenCalled();
  expect(r.cookies.getAll().filter(c=>c.name===WEB_WALLET_SESSION_COOKIE)).toHaveLength(1);
});
it("does not issue access when replacing the old session cannot be confirmed",async()=>{
  m.mutation.mockResolvedValue({status:"approved",telegramUserId:"123",walletAddress:wallet,authenticatedAt:Math.floor(Date.now()/1000)});
  m.mutation.mockRejectedValue(Error("unavailable"));
  const cookie=`argos_tg_web_login=${"a".repeat(32)}.${"b".repeat(64)}; ${WEB_WALLET_SESSION_COOKIE}=${createWebWalletSession(wallet,"456","alice",secret)}`;
  const r=await POST(request("check",cookie));expect(r.status).toBe(503);expect(r.cookies.get(WEB_WALLET_SESSION_COOKIE)).toBeUndefined();
});

const savedProof=`argos_tg_web_login=${"a".repeat(32)}.${"b".repeat(64)}`;
it("reuses a pending approval when Telegram sign-in is clicked again",async()=>{
  m.mutation.mockResolvedValue({status:"pending",code:"ABCDEF12",expiresAt:Date.now()+60000,returnTo:"/otc"});
  const response=await POST(request("start",savedProof,site,{returnTo:"/wallet"}));
  expect(await response.json()).toMatchObject({status:"pending",code:"ABCDEF12",returnTo:"/otc",url:`https://t.me/The_ArgosBot?start=web_${"a".repeat(32)}`});
  expect(m.mutation).toHaveBeenCalledTimes(1);
  expect(getFunctionName(m.mutation.mock.calls[0][0])).toBe("telegramWebAuth:exchange");
  expect(response.cookies.get("argos_tg_web_login")).toBeUndefined();
});
it("finishes an approved saved attempt instead of replacing its authorization",async()=>{
  m.mutation.mockResolvedValue({status:"approved",telegramUserId:"123",walletAddress:wallet,authenticatedAt:Math.floor(Date.now()/1000),returnTo:"/otc"});
  const response=await POST(request("start",savedProof));
  expect(await response.json()).toEqual({status:"approved",returnTo:"/otc"});
  expect(response.cookies.get(WEB_WALLET_SESSION_COOKIE)).toBeDefined();
  expect(m.mutation).toHaveBeenCalledTimes(1);
});
it("only replaces a pending challenge after an explicit account-change request",async()=>{
  const response=await POST(request("start",savedProof,site,{restart:true}));
  expect(response.cookies.get("argos_tg_web_login")!.value).not.toBe(savedProof.split("=")[1]);
  expect(getFunctionName(m.mutation.mock.calls[0][0])).toBe("telegramWebAuth:start");
});
it("creates a fresh challenge when the saved browser proof is expired or invalidated",async()=>{
  m.mutation.mockResolvedValueOnce({status:"expired"}).mockResolvedValueOnce(undefined);
  const response=await POST(request("start",savedProof));
  expect((await response.json()).status).toBe("pending");
  expect(m.mutation.mock.calls.map(c=>getFunctionName(c[0]))).toEqual(["telegramWebAuth:exchange","telegramWebAuth:start"]);
});
it("keeps a pending challenge intact when its recovery response fails",async()=>{
  m.mutation.mockRejectedValue(Error("transport failed"));
  const response=await POST(request("start",savedProof));
  expect(response.status).toBe(503);
  expect(response.cookies.get("argos_tg_web_login")).toBeUndefined();
  expect(m.mutation).toHaveBeenCalledTimes(1);
});
it("requires a fresh challenge when the same TG session is already signed in",async()=>{
  m.mutation.mockResolvedValue({status:"approved",telegramUserId:"123",walletAddress:wallet,authenticatedAt:Math.floor(Date.now()/1000)});
  const signedIn=await POST(request("check",savedProof));
  const session=signedIn.cookies.get(WEB_WALLET_SESSION_COOKIE)!.value;
  m.mutation.mockClear();m.mutation.mockResolvedValue(undefined);
  const restarted=await POST(request("start",`${savedProof}; ${WEB_WALLET_SESSION_COOKIE}=${session}`));
  expect((await restarted.json()).status).toBe("pending");
  expect(getFunctionName(m.mutation.mock.calls[0][0])).toBe("telegramWebAuth:start");
  expect(restarted.cookies.get(WEB_WALLET_SESSION_COOKIE)).toBeUndefined();
});
