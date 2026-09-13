import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {middleware} from "../middleware";
import {brokerConfiguration,exportCredentials,exportXCredentials} from "../lib/key-export/broker";
import {exportReadiness} from "../lib/key-export/readiness";
const origin="https://keys.argosbot.io",site="https://www.argosbot.io";
const env={WALLET_EXPORT_RUNTIME:"shared",WALLET_EXPORT_ENABLED:"true",WALLET_EXPORT_ORIGIN:origin,NEXT_PUBLIC_WALLET_EXPORT_ORIGIN:origin,NEXT_PUBLIC_SITE_URL:site,WALLET_EXPORT_SERVICE_SECRET:"export-".repeat(8),NEXT_PUBLIC_CONVEX_URL:"https://test.convex.cloud",WALLET_EXPORT_CDP_PROJECT_ID:"project",WEB_AUTH_SECRET:"web-".repeat(10),CDP_API_KEY_ID:"existing-id",CDP_API_KEY_SECRET:"existing-secret",CDP_WALLET_SECRET:"existing-wallet",X_OAUTH_CLIENT_ID:"existing-x-id",X_OAUTH_CLIENT_SECRET:"existing-x-secret"};
beforeEach(()=>{for(const [name,value] of Object.entries(env))vi.stubEnv(name,value);for(const name of ["WALLET_EXPORT_CDP_API_KEY_ID","WALLET_EXPORT_CDP_API_KEY_SECRET","WALLET_EXPORT_CDP_WALLET_SECRET","WALLET_EXPORT_X_CLIENT_ID","WALLET_EXPORT_X_CLIENT_SECRET"])vi.stubEnv(name,"");});
afterEach(()=>vi.unstubAllEnvs());
it("permits the existing credentials only in explicit shared mode",()=>{
 expect(brokerConfiguration(new Request(origin+"/api/key-export"))).toMatchObject({origin});
 expect(exportCredentials()).toEqual({apiKeyId:env.CDP_API_KEY_ID,apiKeySecret:env.CDP_API_KEY_SECRET,walletSecret:env.CDP_WALLET_SECRET});
 expect(exportXCredentials()).toEqual({clientId:env.X_OAUTH_CLIENT_ID,secret:env.X_OAUTH_CLIENT_SECRET});
 vi.stubEnv("WALLET_EXPORT_RUNTIME","broker");
 expect(()=>brokerConfiguration(new Request(origin+"/api/key-export"))).toThrow("isolated");
 expect(()=>exportCredentials()).toThrow();expect(()=>exportXCredentials()).toThrow();
});
it("never mixes incomplete dedicated credentials with ordinary credentials",()=>{
 vi.stubEnv("WALLET_EXPORT_CDP_API_KEY_ID","dedicated");vi.stubEnv("WALLET_EXPORT_X_CLIENT_ID","dedicated");
 expect(()=>exportCredentials()).toThrow();expect(()=>exportXCredentials()).toThrow();
});
it.each(["/wallet","/","/api/otc","/api/wallet/key-export","/api/wallet-signer/v1/wallets","/_next/static/test.js"])("blocks ordinary %s routes on the export host even during prefetch",path=>{
 expect(middleware(new NextRequest(origin+path,{headers:{purpose:"prefetch"}})).status).toBe(404);
});
it.each([site,"https://preview.vercel.app","https://evil.invalid"])("denies reveal routes on %s",host=>{
 for(const path of ["/api/key-export","/api/key-export/view","/api/key-export/script","/api/key-export/callback"]){expect(middleware(new NextRequest(host+path)).status).toBe(404);expect(()=>brokerConfiguration(new Request(host+path))).toThrow();}
});
it("serves only the broker routes on the export origin while preserving ordinary website routes",()=>{
 for(const path of ["/api/key-export","/api/key-export/view","/api/key-export/script","/api/key-export/callback"]){expect(middleware(new NextRequest(origin+path)).headers.get("x-middleware-next")).toBe("1");}
 expect(middleware(new NextRequest(site+"/wallet")).headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
 expect(middleware(new NextRequest(site+"/api/wallet/key-export")).status).toBe(200);
});
it("fails closed for missing mode, unsafe origin and shared service secrets",()=>{
 vi.stubEnv("WALLET_EXPORT_SERVICE_SECRET",env.WEB_AUTH_SECRET);expect(()=>brokerConfiguration(new Request(origin))).toThrow();
 vi.stubEnv("WALLET_EXPORT_RUNTIME","");expect(middleware(new NextRequest(origin+"/api/key-export")).status).toBe(404);
 vi.stubEnv("WALLET_EXPORT_RUNTIME","shared");vi.stubEnv("WALLET_EXPORT_ORIGIN",site);expect(middleware(new NextRequest(site+"/api/key-export")).status).toBe(404);expect(()=>brokerConfiguration(new Request(site))).toThrow();
});
it("reports configuration problems without returning credential values",()=>{
 expect(exportReadiness(env)).toEqual({configured:true,enabled:true,missing:[],problems:[]});
 const result=exportReadiness({...env,WALLET_EXPORT_CDP_API_KEY_ID:"partial",WALLET_EXPORT_SERVICE_SECRET:env.WEB_AUTH_SECRET});
 expect(result.configured).toBe(false);expect(result.missing).toContain("WALLET_EXPORT_CDP_API_KEY_SECRET");
 expect(JSON.stringify(result)).not.toContain(env.WEB_AUTH_SECRET);
});
