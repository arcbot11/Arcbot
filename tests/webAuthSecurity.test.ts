import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
const mocks = vi.hoisted(() => ({ mutation: vi.fn(), action: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { mutation=mocks.mutation; action=mocks.action; } }));
import * as web from "../convex/webAuth";
import * as tg from "../convex/telegramWebAuth";
import { POST as telegram } from "../app/api/auth/telegram/route";
import { GET as xCallback } from "../app/api/auth/x/callback/route";
import { DELETE as signout, GET as sessionInfo } from "../app/api/auth/x/session/route";
import { POST as bootstrap } from "../app/api/auth/browser/route";
import { BROWSER_COOKIE, browserValue, hashAuth, loginSourceHash } from "../lib/web-browser-auth";
import { createWebWalletSession, readWebWalletSession, WEB_WALLET_SESSION_COOKIE as COOKIE, webWalletCsrfToken } from "../lib/web-wallet-session";
import { oauthCookieName, sealOAuthAttempt } from "../lib/x-oauth-attempt";
import { encryptXCheckpoint, decryptXCheckpoint } from "../lib/x-oauth-checkpoint";
import { websiteSession } from "../lib/otc/http";
vi.mock("../lib/otc/repository", () => ({ repository: () => ({ identity: async () => true }) }));
const secret="offline-security",site="https://www.argosbot.io",address="0x1111111111111111111111111111111111111111";
type Row=Record<string,unknown>;
const handler=(fn:unknown)=>(fn as {_handler:(ctx:unknown,args:unknown)=>Promise<unknown>})._handler;
let rows:Record<string,Row[]>,ctx:unknown, browser:string,family:string, serial:Promise<unknown>;
const methods:Record<string,unknown>={"webAuth:xStart":web.xStart,"webAuth:xLock":web.xLock,"webAuth:xSave":web.xSave,"webAuth:xUnlock":web.xUnlock,"webAuth:begin":web.begin,"webAuth:activate":web.activate,"webAuth:check":web.check,"webAuth:keepSession":web.keepSession,"webAuth:logout":web.logout,"webAuth:cleanup":web.cleanup,"telegramWebAuth:start":tg.start,"telegramWebAuth:exchange":tg.exchange,"telegramWebAuth:respond":tg.respond,"telegramWebAuth:session":tg.session};
// Convex mutations serialize conflicting writes and roll back on throw. Emulate that boundary, not just individual DB calls.
function mutate(name:string,args:unknown){const run=serial.then(async()=>{const snapshot=structuredClone(rows);try{return await handler(methods[name])(ctx,args);}catch(e){rows=snapshot;throw e;}});serial=run.catch(()=>{});return run;}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-11T22:00:00Z"));
  for(const[k,v]of Object.entries({WEB_AUTH_SECRET:secret,NEXT_PUBLIC_SITE_URL:site,NEXT_PUBLIC_CONVEX_URL:"https://example.convex.cloud",X_OAUTH_CLIENT_ID:"offline",X_OAUTH_CLIENT_SECRET:"offline"}))vi.stubEnv(k,v);
  browser=browserValue(secret);family=hashAuth(browser.split(".")[0]);serial=Promise.resolve();
  rows={webXOAuthAttempts:[],webAuthBrowsers:[],webAuthLimits:[],webWalletSessions:[],telegramWebLogins:[],telegramNativeWallets:[{_id:"wallet",telegramUserId:"123",telegramChatId:"123",address}],telegramUpdates:[{_id:"update",updateId:"u",telegramUserId:"123",telegramChatId:"123"}]};
  ctx={db:{query(table:string){let selected=rows[table];const q={eq:(k:string,v:unknown)=>{selected=selected.filter(r=>r[k]===v);return q;},lt:(k:string,v:number)=>{selected=selected.filter(r=>Number(r[k])<v).sort((a,b)=>Number(a[k])-Number(b[k]));return q;}};return{withIndex:(_:string,cb:(query:typeof q)=>unknown)=>{cb(q);return{unique:async()=>selected[0]??null,take:async(n:number)=>selected.slice(0,n)};}};},get:async(id:unknown)=>Object.values(rows).flat().find(r=>r._id===id)??null,insert:async(t:string,r:Row)=>rows[t].push({_id:`${t}${rows[t].length}`,...r}),patch:async(id:unknown,r:Row)=>Object.assign(Object.values(rows).flat().find(r=>r._id===id)!,r),delete:async(id:unknown)=>{for(const t of Object.keys(rows))rows[t]=rows[t].filter(r=>r._id!==id);}}};
  mocks.mutation.mockImplementation((ref,a)=>mutate(getFunctionName(ref),a));
  mocks.action.mockImplementation(async(ref,a)=>{switch(getFunctionName(ref)){
    case "wallets:provisionWebWallet":return{address};
    case "wallets:registerWebSession":rows.webWalletSessions.push({_id:`x${rows.webWalletSessions.length}`,sessionIdHash:hashAuth(a.sessionId),ownerXUserId:a.ownerXUserId,expiresAt:a.expiresAt});return true;
    case "wallets:revokeWebSession":{const row=rows.webWalletSessions.find(r=>r.sessionIdHash===hashAuth(a.sessionId));if(row)row.revokedAt=Date.now();return true;}
    case "wallets:verifyWebSession":return rows.webWalletSessions.some(r=>r.sessionIdHash===hashAuth(a.sessionId)&&!r.revokedAt&&r.ownerXUserId===a.ownerXUserId);
    default:throw Error(getFunctionName(ref));
  }});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json({access_token:"offline"})).mockResolvedValueOnce(Response.json({data:{id:"456",username:"alice"}})));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
const cookie=(extra="")=>`${BROWSER_COOKIE}=${browser}; ${extra}`;
async function beginDurableX() {
  const { generation } = await mutate("webAuth:begin", { secret, browserHash: family, sourceHash: "1".repeat(64) }) as { generation: number };
  const state = "v4_ff_" + "z".repeat(43), attempt = { verifier: "original-pkce", returnTo: "/otc", browserFamily: family, generation, expiresAt: Date.now() + 600000 };
  await mutate("webAuth:xStart", { secret, stateHash: hashAuth(state), browserFamily: family, generation, encrypted: encryptXCheckpoint({ attempt }, state, secret) });
  return { state, proof: `${oauthCookieName(state)}=${sealOAuthAttempt(attempt, secret)}` };
}
const completion = (state: string) => decryptXCheckpoint(String(rows.webXOAuthAttempts[0].encrypted), state, secret);
it("exchanges in the X browser, then completes after the code lifetime only in the original browser", async () => {
  const {state,proof}=await beginDurableX();
  const handoff=await xCallback(new NextRequest(`${site}/api/auth/x/callback?code=offline&state=${state}`,{headers:{"user-agent":"Android Twitter"}}));
  const html=await handoff.text();
  expect(html).toContain("Finish sign-in in browser");expect(html).not.toContain("code=offline");expect(handoff.cookies.get(COOKIE)).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);expect(mocks.action).not.toHaveBeenCalled();
  const saved=completion(state);expect(saved.identity?.id).toBe("456");expect(saved.accessToken).toBeUndefined();
  vi.advanceTimersByTime(60000);
  const response=await xCallback(new NextRequest(`${site}/api/auth/x/callback?state=${state}&proof=${saved.completionProof}`,{headers:{cookie:cookie(proof)}}));
  expect(response.headers.get("location")).toBe(site+"/otc");expect(response.cookies.get(COOKIE)).toBeDefined();expect(fetch).toHaveBeenCalledTimes(2);
});
it("state alone cannot retrieve a completed authorization, even with the initiating browser cookies", async () => {
  const {state,proof}=await beginDurableX();
  await xCallback(new NextRequest(`${site}/api/auth/x/callback?code=offline&state=${state}`,{headers:{"user-agent":"Android"}}));
  for (const cookies of ["",cookie(proof)]) {
    const denied=await xCallback(new NextRequest(`${site}/api/auth/x/callback?state=${state}`,{headers:{cookie:cookies}}));
    expect(denied.cookies.get(COOKIE)).toBeUndefined();expect(denied.headers.get("location")).toContain("invalid_state");
  }
  const proofOnly=await xCallback(new NextRequest(`${site}/api/auth/x/callback?state=${state}&proof=${completion(state).completionProof}`));
  expect(proofOnly.cookies.get(COOKIE)).toBeUndefined();expect(mocks.action).not.toHaveBeenCalled();
});
it("resumes wallet provisioning after token exchange without reusing the authorization code", async () => {
  const {state,proof}=await beginDurableX();mocks.action.mockImplementationOnce(async()=>{throw Error("temporary wallet outage");});
  const failed=await xCallback(new NextRequest(`${site}/api/auth/x/callback?code=offline&state=${state}`,{headers:{cookie:cookie(proof)}}));
  expect(await failed.text()).toContain("Continue sign-in");expect(completion(state).identity?.id).toBe("456");
  const finished=await xCallback(new NextRequest(`${site}/api/auth/x/callback?state=${state}&proof=${completion(state).completionProof}`,{headers:{cookie:cookie(proof)}}));
  expect(finished.cookies.get(COOKIE)).toBeDefined();expect(fetch).toHaveBeenCalledTimes(2);
});
it("retries a lost session activation response using the exact same session", async () => {
  const {state,proof}=await beginDurableX();let lose=true;
  mocks.mutation.mockImplementation(async(ref,args)=>{const name=getFunctionName(ref),result=await mutate(name,args);if(name==="webAuth:activate"&&lose){lose=false;throw Error("response lost");}return result;});
  await xCallback(new NextRequest(`${site}/api/auth/x/callback?code=offline&state=${state}`,{headers:{cookie:cookie(proof)}}));
  const saved=completion(state),session=readWebWalletSession(saved.sessionCookie,secret)!;
  const finished=await xCallback(new NextRequest(`${site}/api/auth/x/callback?state=${state}&proof=${saved.completionProof}`,{headers:{cookie:cookie(proof)}}));
  expect(finished.cookies.get(COOKIE)?.value).toBe(saved.sessionCookie);expect(rows.webAuthBrowsers[0].activeSessionHash).toBe(hashAuth(session.sessionId));
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("logout invalidates a saved cross-browser authorization before it can activate", async () => {
  const {state,proof}=await beginDurableX();await xCallback(new NextRequest(`${site}/api/auth/x/callback?code=offline&state=${state}`));
  await mutate("webAuth:logout",{secret,browserHash:family});
  const denied=await xCallback(new NextRequest(`${site}/api/auth/x/callback?state=${state}&proof=${completion(state).completionProof}`,{headers:{cookie:cookie(proof)}}));
  expect(denied.headers.get("location")).toContain("invalid_state");expect(denied.cookies.get(COOKIE)).toBeUndefined();
});
it("encrypts checkpoints and rejects changing the state or ciphertext", async () => {
  const {state}=await beginDurableX();const ciphertext=String(rows.webXOAuthAttempts[0].encrypted);
  expect(ciphertext).not.toContain("original-pkce");
  expect(()=>decryptXCheckpoint(ciphertext,state+"x",secret)).toThrow();
  expect(()=>decryptXCheckpoint(ciphertext,state,"wrong-secret")).toThrow();
  expect(()=>decryptXCheckpoint("AAAA"+ciphertext.slice(4),state,secret)).toThrow();
});
it("serializes callback processing and permits recovery of an abandoned lease", async () => {
  const {state}=await beginDurableX(),args={secret,stateHash:hashAuth(state)};
  expect(await mutate("webAuth:xLock",{...args,lease:"one"})).toMatchObject({status:"ready"});
  expect(await mutate("webAuth:xLock",{...args,lease:"two"})).toEqual({status:"busy"});
  vi.advanceTimersByTime(120001);
  expect(await mutate("webAuth:xLock",{...args,lease:"two"})).toMatchObject({status:"ready"});
  await expect(mutate("webAuth:xSave",{...args,lease:"one",encrypted:"stale"})).rejects.toThrow();
});
const req=(action:string,extra="")=>new NextRequest(site+"/api/auth/telegram",{method:"POST",headers:{origin:site,cookie:cookie(extra),"content-type":"application/json"},body:JSON.stringify({action})});
async function beginTg(){const r=await telegram(req("start"));expect(r.status).toBe(200);const proof=r.cookies.get("argos_tg_web_login")!.value;const token=proof.split(".")[0];await mutate("telegramWebAuth:respond",{updateId:"u",tokenHash:hashAuth(token),approve:false});await mutate("telegramWebAuth:respond",{updateId:"u",tokenHash:hashAuth(token),approve:true});return `argos_tg_web_login=${proof}`;}
it("resumes an existing unapproved Telegram attempt without replacing its generation", async () => {
  const started=await telegram(req("start")),proof=`argos_tg_web_login=${started.cookies.get("argos_tg_web_login")!.value}`;
  const generation=rows.webAuthBrowsers[0].generation,original=await started.json();
  const resumed=await telegram(req("resume",proof));
  expect(await resumed.json()).toMatchObject({status:"pending",code:original.code,url:original.url});
  expect(rows.webAuthBrowsers[0].generation).toBe(generation);expect(rows.telegramWebLogins).toHaveLength(1);
});
it("recovers a Telegram approval after reload without redirecting an already signed-in account", async () => {
  const proof=await beginTg(),resumed=await telegram(req("resume",proof));
  expect(await resumed.json()).toMatchObject({status:"approved",returnTo:"/wallet"});
  const session=resumed.cookies.get(COOKIE)!.value;
  expect(await (await telegram(req("resume",`${proof}; ${COOKIE}=${session}`))).json()).toEqual({status:"none"});
});
it("allows status reads after 30 minutes but preserves CSRF and blocks new financial actions", async () => {
  const response=await xCallback(await beginX()),value=response.cookies.get(COOKIE)!.value,session=readWebWalletSession(value,secret)!;
  vi.advanceTimersByTime(31*60000);
  const request=new NextRequest(site+"/api/otc",{method:"POST",headers:{origin:site,cookie:cookie(`${COOKIE}=${value}`),"x-argus-csrf":webWalletCsrfToken(session.sessionId,secret)}});
  expect(await websiteSession(request,true,false)).toMatchObject({walletAddress:address,owner:"456"});
  await expect(websiteSession(request,true)).rejects.toThrow("Reconnect before moving funds");
  request.headers.delete("x-argus-csrf");await expect(websiteSession(request,true,false)).rejects.toThrow("Invalid session token");
  request.headers.set("origin","https://foreign.example");await expect(websiteSession(request,true,false)).rejects.toThrow("Invalid request origin");
});
async function beginX(){const {generation}=await mutate("webAuth:begin",{secret,browserHash:family,sourceHash:"1".repeat(64)}) as {generation:number};const state="v2_"+"a".repeat(43);const attempt=sealOAuthAttempt({verifier:"offline",returnTo:"/wallet",browserFamily:family,generation,expiresAt:Date.now()+600000},secret);return new NextRequest(`${site}/api/auth/x/callback?code=offline&state=${state}`,{headers:{cookie:cookie(`${oauthCookieName(state)}=${attempt}`)}});}
it.each(["x","tg"])("only the newest sign-in wins concurrent X/TG completion (newest=%s)",async newest=>{
  let x:NextRequest,proof:string;
  if(newest==="tg"){x=await beginX();proof=await beginTg();}else{proof=await beginTg();x=await beginX();}
  const [tr,xr]=await Promise.all([telegram(req("check",proof)),xCallback(x)]);
  expect(Boolean(tr.cookies.get(COOKIE))).toBe(newest==="tg");expect(Boolean(xr.cookies.get(COOKIE))).toBe(newest==="x");
  expect(rows.webAuthBrowsers[0].activeSessionHash).toBeTruthy();
});
it("replaces an active TG session with X and rejects the old cookie at session verification",async()=>{
  const proof=await beginTg(),tr=await telegram(req("check",proof)),old=tr.cookies.get(COOKIE)!.value;
  const xr=await xCallback(await beginX());expect(xr.cookies.get(COOKIE)).toBeDefined();
  expect(await (await sessionInfo(new NextRequest(site+"/api/auth/x/session",{headers:{cookie:cookie(`${COOKIE}=${old}`)}}))).json()).toEqual({authenticated:false});
  expect(rows.telegramWebLogins[0].revokedAt).toBeTruthy();
});
it("logout invalidates approved TG and pending X attempts, even with retained cookies",async()=>{
  const proof=await beginTg();const out=await signout(new NextRequest(site+"/api/auth/x/session",{method:"DELETE",headers:{origin:site,cookie:cookie(proof)}}));
  expect(out.status).toBe(200);expect(out.cookies.get("argos_tg_web_login")?.value).toBe("");
  expect(await (await telegram(req("check",proof))).json()).toEqual({status:"expired"});
  const x=await beginX();await signout(new NextRequest(site+"/api/auth/x/session",{method:"DELETE",headers:{origin:site,cookie:cookie()}}));
  expect((await xCallback(x)).cookies.get(COOKIE)).toBeUndefined();
});
it("a delayed successful login response cannot restore authorization after logout",async()=>{
  const proof=await beginTg(),response=await telegram(req("check",proof)),value=response.cookies.get(COOKIE)!.value;
  await signout(new NextRequest(site+"/api/auth/x/session",{method:"DELETE",headers:{origin:site,cookie:cookie()}}));
  expect(await (await sessionInfo(new NextRequest(site+"/api/auth/x/session",{headers:{cookie:cookie(`${COOKIE}=${value}`)}}))).json()).toEqual({authenticated:false});
});
it("requires CSRF for authenticated sign-out and then revokes its whole browser generation",async()=>{
  const proof=await beginTg(),r=await telegram(req("check",proof)),value=r.cookies.get(COOKIE)!.value,s=readWebWalletSession(value,secret)!;
  const headers={origin:site,cookie:cookie(`${COOKIE}=${value}`)};
  expect((await signout(new NextRequest(site+"/api/auth/x/session",{method:"DELETE",headers}))).status).toBe(403);
  expect((await signout(new NextRequest(site+"/api/auth/x/session",{method:"DELETE",headers:{...headers,"x-argus-csrf":webWalletCsrfToken(s.sessionId,secret)}}))).status).toBe(200);
  expect(rows.webAuthBrowsers[0].activeSessionHash).toBeUndefined();
});
it("revokes pre-feature X sessions captured when replacement begins",async()=>{
  const value=createWebWalletSession(address,"456","alice",secret),s=readWebWalletSession(value,secret)!;
  rows.webWalletSessions.push({_id:"legacy",sessionIdHash:hashAuth(s.sessionId),ownerXUserId:"456"});
  const r=await telegram(req("start",`${COOKIE}=${value}`)),proof=r.cookies.get("argos_tg_web_login")!.value,token=proof.split(".")[0];
  for(const approve of [false,true])await mutate("telegramWebAuth:respond",{updateId:"u",tokenHash:hashAuth(token),approve});
  await telegram(req("check",`argos_tg_web_login=${proof}`));expect(rows.webWalletSessions[0].revokedAt).toBeTruthy();
});
it("requires the browser cookie as well as the wallet cookie for new sessions",async()=>{
  const proof=await beginTg(),r=await telegram(req("check",proof)),value=r.cookies.get(COOKIE)!.value;
  const response=await sessionInfo(new NextRequest(site+"/api/auth/x/session",{headers:{cookie:`${COOKIE}=${value}`}}));expect(await response.json()).toEqual({authenticated:false});
});
it("reports a temporary verification outage without declaring the browser signed out",async()=>{
 const value=createWebWalletSession(address,"456","alice",secret);
 mocks.action.mockRejectedValueOnce(Error("Temporary backend failure"));
 const response=await sessionInfo(new NextRequest(site+"/api/auth/x/session",{headers:{cookie:cookie(`${COOKIE}=${value}`)}}));
 expect(response.status).toBe(503);expect(await response.json()).toEqual({error:"Session check unavailable."});
 expect(response.cookies.get(COOKIE)).toBeUndefined();
});
it("only one session can activate per generation; retries of that session remain idempotent",async()=>{
  const {generation}=await mutate("webAuth:begin",{secret,browserHash:family,sourceHash:"1".repeat(64)}) as {generation:number};
  const a={secret,browserHash:family,generation,sessionIdHash:"a".repeat(64),expiresAt:Date.now()+7200000};
  expect(await mutate("webAuth:activate",a)).toBe(true);expect(await mutate("webAuth:activate",{...a,sessionIdHash:"b".repeat(64)})).toBe(false);expect(await mutate("webAuth:activate",a)).toBe(true);
});
it("choosing the current session cancels pending competing login without revoking current access",async()=>{
  const {generation}=await mutate("webAuth:begin",{secret,browserHash:family,sourceHash:"1".repeat(64)}) as {generation:number};
  await mutate("webAuth:activate",{secret,browserHash:family,generation,sessionIdHash:"a".repeat(64),expiresAt:Date.now()+7200000});
  const proof=await beginTg();
  expect(await mutate("webAuth:keepSession",{secret,browserHash:family,sessionIdHash:"a".repeat(64)})).toBe(true);
  expect(await (await telegram(req("check",proof))).json()).toEqual({status:"expired"});
  expect(await mutate("webAuth:check",{secret,browserHash:family,sessionIdHash:"a".repeat(64)})).toBe(true);
});
it("throttles repeated browser starts and rotating browsers from one source",async()=>{
  for(let i=0;i<5;i++)expect((await telegram(req("start"))).status).toBe(200);
  expect((await telegram(req("start"))).status).toBe(429);expect(rows.telegramWebLogins).toHaveLength(5);
  for(let i=0;i<15;i++){browser=browserValue(secret);expect((await telegram(req("start"))).status).toBe(200);}
  browser=browserValue(secret);expect((await telegram(req("start"))).status).toBe(429);expect(rows.telegramWebLogins).toHaveLength(20);
  vi.advanceTimersByTime(60001);expect((await telegram(req("start"))).status).toBe(200);
});
it("rejects oversized bodies before creating a challenge",async()=>{
  const r=await telegram(new NextRequest(site+"/api/auth/telegram",{method:"POST",headers:{origin:site,cookie:cookie()},body:JSON.stringify({action:"start",extra:"x".repeat(513)})}));expect(r.status).toBe(413);expect(rows.telegramWebLogins).toHaveLength(0);
});
it("cleans expired records without deleting still-active sessions",async()=>{
  const proof=await beginTg();await telegram(req("check",proof));
  rows.telegramWebLogins.push({_id:"expired",expiresAt:Date.now()-7200001});
  rows.webAuthBrowsers.push({_id:"old",browserHash:"e".repeat(64),expiresAt:Date.now()-1,generation:1});
  rows.webAuthLimits.push({_id:"old-limit",key:"old",resetAt:Date.now()-60001});
  await mutate("webAuth:cleanup",{});
  expect(rows.telegramWebLogins).toHaveLength(1);expect(rows.webAuthBrowsers).toHaveLength(1);expect(rows.webAuthLimits.some(r=>r._id==="old-limit")).toBe(false);
  vi.advanceTimersByTime(7810000);await mutate("webAuth:cleanup",{});expect(rows.telegramWebLogins).toHaveLength(0);
});
it("bootstraps one signed browser cookie without allocating a database record",async()=>{
  const r=await bootstrap(new NextRequest(site+"/api/auth/browser",{method:"POST",headers:{origin:site}}));expect(r.cookies.get(BROWSER_COOKIE)).toBeDefined();expect(r.cookies.get(COOKIE)).toBeUndefined();expect(rows.webAuthBrowsers).toHaveLength(0);
  const repeat=await bootstrap(new NextRequest(site+"/api/auth/browser",{method:"POST",headers:{origin:site,cookie:cookie()}}));expect(repeat.cookies.get(BROWSER_COOKIE)).toBeUndefined();
});
it("ignores spoofable forwarding headers outside Vercel",()=>{
  vi.stubEnv("VERCEL","");const a=new NextRequest(site,{headers:{"x-forwarded-for":"1.2.3.4","x-vercel-forwarded-for":"2.3.4.5"}}),b=new NextRequest(site,{headers:{"x-forwarded-for":"9.8.7.6","x-vercel-forwarded-for":"8.7.6.5"}});
  expect(loginSourceHash(a,secret)).toBe(loginSourceHash(b,secret));
});
