import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createHmac} from "node:crypto";
import {getFunctionName} from "convex/server";
vi.mock("@coinbase/cdp-sdk/auth",()=>({generateJwt:vi.fn().mockResolvedValue("jwt")}));
import {website,telegram,customerAccountName} from "../convex/walletExportEnrollment";
const secret="website-secret-".repeat(4),address="0x1111111111111111111111111111111111111111";
const invoke=(fn:unknown,ctx:unknown,args:unknown)=>(fn as {_handler:(ctx:unknown,args:unknown)=>Promise<unknown>})._handler(ctx,args);
beforeEach(()=>{vi.stubEnv("WEB_AUTH_SECRET",secret);vi.stubEnv("CDP_API_KEY_ID","id");vi.stubEnv("CDP_API_KEY_SECRET","key");vi.stubEnv("WALLET_SIGNER_IDEMPOTENCY_SECRET","naming-secret");vi.stubGlobal("fetch",vi.fn());});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function fixture(provider:"x"|"telegram"="x"){
 const owner={provider,userId:"123"};
 const candidate={enrolled:false,address,bindingId:"binding",projectId:"project"};
 const ctx={runQuery:vi.fn(async(ref:Parameters<typeof getFunctionName>[0],_args:unknown)=>getFunctionName(ref)==="walletExports:telegramEnrollmentOwner"?owner:candidate),runMutation:vi.fn()};
 vi.mocked(fetch).mockResolvedValue(Response.json({address,name:customerAccountName(owner,"naming-secret")}));
 return {owner,ctx,candidate};
}
it.each(["x","telegram"] as const)("enrolls %s only after exact CDP name/address matching",async provider=>{
 const f=fixture(provider);expect(await invoke(website,f.ctx,{secret,...f.owner})).toEqual({eligible:true});
 expect(fetch).toHaveBeenCalledTimes(1);expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/by-name/");
 expect(f.ctx.runMutation).toHaveBeenCalledWith(expect.anything(),{...f.owner,address,bindingId:"binding",projectId:"project",cdpAccountName:customerAccountName(f.owner,"naming-secret")});
});
it("uses the signer naming domains and separates identical numeric X/TG IDs",()=>{
 const digest=(s:string)=>createHmac("sha256","naming-secret").update(s).digest("hex").slice(0,25);
 expect(customerAccountName({provider:"x",userId:"123"},"naming-secret")).toBe("arcbot-rh-"+digest("arcbot:legacyNetwork:4663:x:123"));
 expect(customerAccountName({provider:"telegram",userId:"123"},"naming-secret")).toBe("argos-tg-"+digest("argos:telegram-wallet:v1:tg:123"));
});
it.each(["address","name","404","403","500"])("never enrolls after CDP %s failure",async mode=>{
 const f=fixture();vi.mocked(fetch).mockResolvedValue(/^\d+$/.test(mode)?new Response("private provider error",{status:Number(mode)}):Response.json({address:mode==="address"?"0x2222222222222222222222222222222222222222":address,name:mode==="name"?"Personal1":customerAccountName(f.owner,"naming-secret")}));
 await expect(invoke(website,f.ctx,{secret,...f.owner})).rejects.toThrow();expect(f.ctx.runMutation).not.toHaveBeenCalled();
});
it("does not access CDP on an unauthorized server request",async()=>{
 const f=fixture();await expect(invoke(website,f.ctx,{secret:"wrong",...f.owner})).rejects.toThrow("Unauthorized");expect(f.ctx.runQuery).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it("keeps existing verified accounts fast and retains backend denials",async()=>{
 const f=fixture();f.ctx.runQuery.mockResolvedValue({enrolled:true} as never);
 expect(await invoke(website,f.ctx,{secret,...f.owner})).toEqual({eligible:true});expect(fetch).not.toHaveBeenCalled();expect(f.ctx.runMutation).not.toHaveBeenCalled();
 f.ctx.runQuery.mockRejectedValue(Error("revoked"));await expect(invoke(website,f.ctx,{secret,...f.owner})).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
});
it("resolves TG ownership solely from its validated private update",async()=>{
 const f=fixture("telegram");await invoke(telegram,f.ctx,{updateId:"update"});
 expect(f.ctx.runQuery.mock.calls[0][1]).toEqual({updateId:"update"});expect(f.ctx.runMutation.mock.calls[0][1]).toMatchObject({provider:"telegram",userId:"123"});
});
