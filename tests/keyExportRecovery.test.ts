import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {exportBrowserLinks} from "../lib/key-export/browser-return";
import {safeExportError,exportFail} from "../lib/key-export/errors";
import {digest,seal,unseal} from "../lib/key-export/crypto";
const mocks=vi.hoisted(()=>({command:vi.fn(),token:vi.fn(),identity:vi.fn(),session:vi.fn(),mutation:vi.fn()}));
vi.mock("../lib/key-export/broker",async original=>({...await original<typeof import("../lib/key-export/broker")>(),exportCommand:mocks.command,xExportToken:mocks.token,xExportIdentity:mocks.identity}));
vi.mock("../lib/otc/http",()=>({websiteSession:mocks.session}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class {mutation=mocks.mutation;}}));
import {GET} from "../app/api/key-export/callback/route";
import {POST as start} from "../app/api/wallet/key-export/route";
const origin="https://keys.argosbot.io",secret="test-export-secret-".repeat(4),state="a".repeat(64),ticket="b".repeat(64),verifier="c".repeat(64),ticketHash=digest(ticket),browserHash=digest(verifier);
beforeEach(()=>{
 vi.resetAllMocks();for(const key of ["WEB_AUTH_SECRET","OTC_SERVICE_SECRET","WALLET_SIGNER_TOKEN","CDP_API_KEY_ID","CDP_API_KEY_SECRET","CDP_WALLET_SECRET","TELEGRAM_BOT_TOKEN"])vi.stubEnv(key,"");
 for(const [key,value] of Object.entries({WALLET_EXPORT_ENABLED:"true",WALLET_EXPORT_RUNTIME:"broker",WALLET_EXPORT_ORIGIN:origin,WALLET_EXPORT_SERVICE_SECRET:secret,NEXT_PUBLIC_CONVEX_URL:"https://test.convex.cloud"}))vi.stubEnv(key,value);
});
afterEach(()=>vi.unstubAllEnvs());
const callback=()=>GET(new NextRequest(`${origin}/api/key-export/callback?state=${state}&code=disposable-code`,{headers:{cookie:`__Host-argos_export=${ticket}.${verifier}`}}));
const grant=()=>({done:false,ticketHash,browserHash,encryptedVerifier:seal("test-pkce",secret,`x-pkce:${digest(state)}`)});
it("saves a purpose-bound sealed token before fetching X identity",async()=>{
 mocks.command.mockResolvedValueOnce(grant());mocks.token.mockResolvedValue("test-access-token");mocks.identity.mockResolvedValue("123");
 const response=await callback();expect(response.headers.get("location")).toBe(`${origin}/api/key-export/view`);
 expect(mocks.command.mock.calls.map(c=>c[0])).toEqual(["oauthTake","oauthSaveToken","authenticated"]);
 const saved=mocks.command.mock.calls[1][1];expect(saved.encryptedToken).not.toContain("test-access-token");
 expect(unseal(saved.encryptedToken,secret,`x-token:${digest(state)}:${ticketHash}:${browserHash}`)).toBe("test-access-token");
 expect(mocks.command.mock.calls[2][1]).toMatchObject({userId:"123",stateHash:digest(state),attempt:saved.attempt});
});
it("resumes a durable token without exchanging a consumed code twice",async()=>{
 mocks.command.mockResolvedValueOnce({...grant(),encryptedToken:seal("saved",secret,`x-token:${digest(state)}:${ticketHash}:${browserHash}`)});mocks.identity.mockResolvedValue("123");
 await callback();expect(mocks.token).not.toHaveBeenCalled();expect(mocks.identity).toHaveBeenCalledWith("saved");expect(mocks.command.mock.calls.map(c=>c[0])).toEqual(["oauthTake","authenticated"]);
});
it("recovers completed authentication without replaying provider operations",async()=>{
 mocks.command.mockResolvedValueOnce({done:true});await callback();expect(mocks.token).not.toHaveBeenCalled();expect(mocks.identity).not.toHaveBeenCalled();
});
it("keeps a cookie-bound callback retry after provider failure without exposing export credentials",async()=>{
 mocks.command.mockResolvedValueOnce(grant());mocks.token.mockRejectedValue(Error("disposable-code provider-secret"));
 const result=await callback(),html=await result.text();expect(html).toContain("Retry verification");expect(html).toContain("code=disposable-code");expect(html).not.toContain("provider-secret");expect(html).not.toContain(ticket);expect(html).not.toContain(verifier);expect(result.cookies.getAll()).toHaveLength(0);
});
it("keeps session and CSRF checks while avoiding a redundant recent-login gate",async()=>{
 vi.stubEnv("WALLET_EXPORT_RUNTIME","");vi.stubEnv("WEB_AUTH_SECRET","web-secret-".repeat(4));mocks.session.mockResolvedValue({provider:"x",browserFamily:"family",xUserId:"123",sessionId:"session"});
 const request=new NextRequest("https://www.argosbot.io/api/wallet/key-export",{method:"POST",body:JSON.stringify({attemptId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"})});expect((await start(request)).status).toBe(200);expect(mocks.session).toHaveBeenCalledWith(request,true,false);
});
it.each(["Android","iPhone"])("provides real %s browser handoff links with no grant or OAuth code",ua=>{
 const html=exportBrowserLinks(origin,ua);expect(html).toContain(ua==="Android"?"package=org.mozilla.firefox":"firefox://open-url");expect(html).toContain("Finish in browser");expect(html).not.toMatch(/ticket=|state=|code=|verifier=/);
});
it("redacts arbitrary errors while preserving fixed actionable codes",()=>{
 expect(safeExportError(Error("PRIVATE_KEY token secret"))).toMatchObject({code:"AUTHORIZATION",status:403});
 for(const code of ["RATE_LIMITED","EXPIRED","PENDING_TRANSACTIONS","PROVIDER_RETRY"] as const){try{exportFail(code);}catch(error){expect(safeExportError(error).code).toBe(code);}}
});

it("never exchanges or authenticates an X callback without the original export cookie",async()=>{
 const result=await GET(new NextRequest(origin+"/api/key-export/callback?state="+state+"&code=owner-code",{headers:{"user-agent":"Android"}}));
 expect(mocks.command).not.toHaveBeenCalled();expect(mocks.token).not.toHaveBeenCalled();
 const html=await result.text();expect(html).toContain("Finish verification in browser");expect(html).toContain("package=org.mozilla.firefox");expect(html).not.toContain(ticket);expect(html).not.toContain(verifier);
 expect(result.headers.get("referrer-policy")).toBe("no-referrer");expect(result.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
});
it("rejects a callback cookie that does not match the claimed grant",async()=>{
 mocks.command.mockImplementation(async(name)=>{if(name==="oauthTake")exportFail("BROWSER_MISMATCH");});
 const result=await callback();expect(mocks.token).not.toHaveBeenCalled();expect(mocks.identity).not.toHaveBeenCalled();expect(await result.text()).toContain("Finish verification in browser");
 expect(mocks.command.mock.calls[0][1]).toMatchObject({ticketHash,browserHash,codeHash:digest("disposable-code")});
});
it("retries website initiation with the same session-bound ticket",async()=>{
 vi.stubEnv("WALLET_EXPORT_RUNTIME","");vi.stubEnv("WEB_AUTH_SECRET","web-secret-".repeat(4));mocks.session.mockResolvedValue({provider:"x",browserFamily:"family",xUserId:"123",sessionId:"session"});
 const request=(attemptId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")=>new NextRequest("https://www.argosbot.io/api/wallet/key-export",{method:"POST",body:JSON.stringify({attemptId})});
 const first=await (await start(request())).json(),second=await (await start(request())).json();expect(second).toEqual(first);
 expect(mocks.mutation.mock.calls[0][1].ticketHash).toBe(mocks.mutation.mock.calls[1][1].ticketHash);
 expect(await (await start(request("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"))).json()).not.toEqual(first);
 mocks.session.mockResolvedValue({provider:"x",browserFamily:"family",xUserId:"123",sessionId:"new-session"});expect(await (await start(request())).json()).not.toEqual(first);
});


it("directs an interrupted unsaved X exchange to fresh verification without replaying its code",async()=>{
 mocks.command.mockImplementation(async name=>{if(name==="oauthTake")exportFail("OAUTH_RESTART");});
 const html=await (await callback()).text();
 expect(html).toContain('href="/api/key-export/view" rel="noreferrer">Verify with X again');
 expect(html).toContain("X verification was interrupted");expect(html).not.toContain("code=disposable-code");expect(html).not.toContain("Retry verification");expect(mocks.token).not.toHaveBeenCalled();
});
it.each(["EXPIRED","AUTHORIZATION","ELIGIBILITY","UNAVAILABLE"] as const)("offers a wallet return rather than a callback replay for %s",async code=>{
 mocks.command.mockImplementation(async name=>{if(name==="oauthTake")exportFail(code);});
 const html=await (await callback()).text();expect(html).toContain('href="https://www.argosbot.io/wallet"');expect(html).not.toContain("code=disposable-code");expect(html).not.toContain("Finish verification in browser</a>");
});
it("tells users to wait on an active callback lease",async()=>{
 mocks.command.mockImplementation(async name=>{if(name==="oauthTake")exportFail("BUSY");});
 const html=await (await callback()).text();expect(html).toContain("Wait 30 seconds");expect(html).toContain("Retry after 30 seconds");expect(html).toContain("code=disposable-code");
});
