import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({command:vi.fn(),cdp:vi.fn(),telegram:vi.fn(),key:vi.fn()}));
vi.mock("../lib/key-export/broker",async original=>({...await original<typeof import("../lib/key-export/broker")>(),exportCommand:mocks.command,encryptedCdpExport:mocks.cdp}));
vi.mock("../lib/key-export/crypto",async original=>({...await original<typeof import("../lib/key-export/crypto")>(),verifyTelegramExport:mocks.telegram,validateExportKey:mocks.key}));
import {digest} from "../lib/key-export/crypto";
import {POST} from "../app/api/key-export/route";
import {GET as view} from "../app/api/key-export/view/route";
import {middleware} from "../middleware";
const origin="https://keys.argosbot.io",ticket="a".repeat(64),verifier="b".repeat(64),keyHash="c".repeat(64);
const request=(body:Record<string,unknown>,source=origin)=>new NextRequest(`${origin}/api/key-export`,{method:"POST",headers:{origin:source,"content-type":"application/json"},body:JSON.stringify({ticket,verifier,...body})});
beforeEach(()=>{vi.resetAllMocks();for(const key of ["WEB_AUTH_SECRET","OTC_SERVICE_SECRET","WALLET_SIGNER_TOKEN","CDP_API_KEY_ID","CDP_API_KEY_SECRET","CDP_WALLET_SECRET","TELEGRAM_BOT_TOKEN"])vi.stubEnv(key,"");vi.stubEnv("WALLET_EXPORT_ENABLED","true");vi.stubEnv("WALLET_EXPORT_RUNTIME","broker");vi.stubEnv("WALLET_EXPORT_ORIGIN",origin);vi.stubEnv("WALLET_EXPORT_SERVICE_SECRET","x".repeat(40));vi.stubEnv("NEXT_PUBLIC_CONVEX_URL","https://test.convex.cloud");mocks.key.mockReturnValue(keyHash);});
afterEach(()=>vi.unstubAllEnvs());
it.each(["origin","disabled","main","credentials","address-field","owner-field","name-field"])("never calls CDP for an invalid %s request",async mode=>{
 if(mode==="disabled")vi.stubEnv("WALLET_EXPORT_ENABLED","false");if(mode==="main")vi.stubEnv("WALLET_EXPORT_RUNTIME","");if(mode==="credentials")vi.stubEnv("CDP_API_KEY_ID","ordinary-signer");
 const input:Record<string,unknown>={action:"export",keyHash};if(mode.endsWith("-field"))input[mode.replace("-field","")]="attacker-input";
 expect((await POST(request(input,mode==="origin"?"https://evil.invalid":origin))).status).toBe(["disabled","main","credentials"].includes(mode)?503:403);expect(mocks.command).not.toHaveBeenCalled();expect(mocks.cdp).not.toHaveBeenCalled();
});
it("uses only the server-resolved export target and rechecks before returning ciphertext",async()=>{
 const input={address:"0x1111111111111111111111111111111111111111",projectId:"project",publicKey:"approved",exportId:"uuid"};
 mocks.command.mockResolvedValueOnce(input).mockResolvedValueOnce(true);mocks.cdp.mockResolvedValue({encryptedPrivateKey:"ciphertext",address:input.address});
 const result=await POST(request({action:"export",keyHash}));expect(result.status).toBe(200);expect(await result.json()).toEqual({encryptedPrivateKey:"ciphertext",address:input.address});expect(mocks.cdp).toHaveBeenCalledWith(input);expect(mocks.command.mock.calls.map(c=>c[0])).toEqual(["begin","relayed"]);expect(result.headers.get("cache-control")).toBe("no-store");
});
it("withholds ciphertext after session revocation and redacts provider failures",async()=>{
 mocks.command.mockResolvedValueOnce({}).mockRejectedValueOnce(Error("revoked"));mocks.cdp.mockResolvedValue({encryptedPrivateKey:"DO_NOT_LEAK"});
 const response=await POST(request({action:"export",keyHash}));expect(response.status).toBe(403);expect(await response.text()).not.toContain("DO_NOT_LEAK");
});
it("requires explicit consent and a validated public key for approval",async()=>{
 expect((await POST(request({action:"approve",publicKey:"key"}))).status).toBe(403);expect(mocks.command.mock.calls.every(c=>c[0]==="failure")).toBe(true);
 mocks.key.mockImplementation(()=>{throw Error("Invalid key");});expect((await POST(request({action:"approve",publicKey:"key",confirmed:true}))).status).toBe(403);expect(mocks.command.mock.calls.every(c=>c[0]==="failure")).toBe(true);
});
it("uses the Telegram proof's ID and cannot treat it as X authorization",async()=>{
 mocks.telegram.mockReturnValue({userId:"123",proofHash:"d".repeat(64)});mocks.command.mockResolvedValue(true);
 expect((await POST(request({action:"telegram",initData:"signed"}))).status).toBe(200);
 expect(mocks.command).toHaveBeenCalledWith("authenticated",expect.objectContaining({provider:"telegram",userId:"123"}),expect.anything());
});
it("renders an isolated nonce-protected page without wallet framework or ordinary third-party scripts",async()=>{
 const response=await view(new Request(`${origin}/api/key-export/view`)),html=await response.text();
 expect(response.status).toBe(200);expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");expect(response.headers.get("referrer-policy")).toBe("no-referrer");expect(html).not.toContain("/_next/");expect(html).not.toContain('src="https://');
});
it.each(["/api/otc","/wallet","/_next/static/test.js","/api/wallet-signer/v1/wallets"])("blocks %s on the isolated broker, including prefetch",path=>{
 expect(middleware(new NextRequest(origin+path,{headers:{purpose:"prefetch","next-router-prefetch":"1"}})).status).toBe(404);
});

it("reuses an existing HttpOnly verifier only for the same ticket on claim",async()=>{
 mocks.command.mockResolvedValue({provider:"x",state:"pending",address:"test",expiresAt:Date.now()+300000});
 const requestWithCookie=(cookieTicket:string)=>new NextRequest(origin+"/api/key-export",{method:"POST",headers:{origin,cookie:"__Host-argos_export="+cookieTicket+"."+verifier},body:JSON.stringify({action:"claim",ticket,verifier:"d".repeat(64)})});
 const result=await POST(requestWithCookie(ticket));expect(await result.json()).toMatchObject({cookieBound:true});
 expect(mocks.command.mock.calls[0][1]).toMatchObject({ticketHash:digest(ticket),browserHash:digest(verifier)});
 expect(result.cookies.get("__Host-argos_export")?.value).toBe(ticket+"."+verifier);
 mocks.command.mockClear();const other=await POST(requestWithCookie("e".repeat(64)));expect((await other.json()).cookieBound).toBeUndefined();
 expect(mocks.command.mock.calls[0][1]).toMatchObject({ticketHash:digest(ticket),browserHash:digest("d".repeat(64))});
});
