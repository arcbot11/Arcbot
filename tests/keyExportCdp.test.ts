import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {generateKeyPairSync} from "node:crypto";
const auth=vi.hoisted(()=>({jwt:vi.fn(async()=>"jwt"),wallet:vi.fn(async()=>"wallet-jwt")}));
vi.mock("@coinbase/cdp-sdk/auth",()=>({generateJwt:auth.jwt,generateWalletJwt:auth.wallet}));
import {encryptedCdpExport} from "../lib/key-export/broker";
import {safeExportError} from "../lib/key-export/errors";
const publicKey=generateKeyPairSync("rsa",{modulusLength:4096}).publicKey.export({type:"spki",format:"der"}).toString("base64");
const address="0x1111111111111111111111111111111111111111",name="arcbot-rh-"+"a".repeat(25);
const input={address,projectId:"project",cdpAccountName:name,publicKey,exportId:"11111111-1111-4111-8111-111111111111"};
beforeEach(()=>{vi.clearAllMocks();for(const [key,value] of Object.entries({WALLET_EXPORT_CDP_PROJECT_ID:"project",WALLET_EXPORT_CDP_API_KEY_ID:"export-key",WALLET_EXPORT_CDP_API_KEY_SECRET:"export-secret",WALLET_EXPORT_CDP_WALLET_SECRET:"wallet-secret"}))vi.stubEnv(key,value);});
afterEach(()=>vi.unstubAllEnvs());
it("uses the encrypted REST operation, approved RSA key, and stable CDP idempotency ID",async()=>{
 const ciphertext=Buffer.alloc(512,7).toString("base64"),fetcher=vi.fn().mockResolvedValueOnce(Response.json({address,name})).mockResolvedValueOnce(Response.json({encryptedPrivateKey:ciphertext}));
 expect(await encryptedCdpExport(input,fetcher)).toEqual({encryptedPrivateKey:ciphertext,address});
 expect(fetcher).toHaveBeenLastCalledWith(`https://api.cdp.coinbase.com/platform/v2/evm/accounts/${address}/export`,expect.objectContaining({method:"POST",redirect:"error",body:JSON.stringify({exportEncryptionKey:publicKey}),headers:expect.objectContaining({"X-Idempotency-Key":input.exportId,"X-Wallet-Auth":"wallet-jwt"})}));
 expect(auth.jwt).toHaveBeenCalledWith(expect.objectContaining({apiKeyId:"export-key",requestMethod:"POST"}));
});
it.each(["address","name","protected-name","project","get-error"])("never requests a key after a CDP %s mismatch",async mode=>{
 const fetcher=vi.fn().mockResolvedValue(mode==="get-error"?new Response("upstream details",{status:403}):Response.json({address:mode==="address"?"0x2222222222222222222222222222222222222222":address,name:mode==="name"?"Personal1":name}));
 await expect(encryptedCdpExport({...input,...(mode==="project"?{projectId:"wrong"}:{}),...(mode==="protected-name"?{cdpAccountName:"Personal1"}:{})},fetcher)).rejects.toThrow();
 expect(fetcher.mock.calls.filter(call=>(call[1] as RequestInit).method==="POST")).toHaveLength(0);
});
it("rejects a plaintext-looking or oversized provider response without exposing it",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({address,name})).mockResolvedValueOnce(Response.json({privateKey:"not-allowed",encryptedPrivateKey:"1".repeat(64)}));
 await expect(encryptedCdpExport(input,fetcher)).rejects.toThrow("invalid");
});
it("resolves by audited name and preserves CDP canonical address for export",async()=>{
 const canonical="0x52908400098527886E0F7030069857D2E4169EE7",ciphertext=Buffer.alloc(512,7).toString("base64");
 const fetcher=vi.fn(async(url:Parameters<typeof fetch>[0])=>String(url).endsWith('/by-name/'+name)?Response.json({address:canonical,name}):String(url).endsWith(canonical+'/export')?Response.json({encryptedPrivateKey:ciphertext}):new Response("",{status:404}));
 expect(await encryptedCdpExport({...input,address:canonical.toLowerCase()},fetcher)).toEqual({address:canonical.toLowerCase(),encryptedPrivateKey:ciphertext});
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([[401,"UNAVAILABLE"],[403,"UNAVAILABLE"],[404,"ELIGIBILITY"],[503,"PROVIDER_RETRY"]])("classifies CDP lookup %s without forwarding its response",async(status,code)=>{
 const fetcher=vi.fn().mockResolvedValue(new Response("PRIVATE PROVIDER DETAILS",{status:Number(status)}));
 try{await encryptedCdpExport(input,fetcher);throw Error("Expected rejection");}catch(error){const safe=safeExportError(error);expect(safe.code).toBe(code);expect(safe.message).not.toContain("PRIVATE");}
 expect(fetcher).toHaveBeenCalledTimes(1);
});
