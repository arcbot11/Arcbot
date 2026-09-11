import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {EventEmitter} from "node:events";
import {NextRequest} from "next/server";
import {middleware} from "../middleware";
const m=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock("node:dns/promises",()=>({lookup:m.lookup}));
vi.mock("node:https",()=>({request:m.request}));
import {GET} from "../app/api/token-image/route";
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("NODE_ENV","production");});
afterEach(()=>vi.unstubAllEnvs());
it.each(["/wallet","/wallet/","/wallet/0x123","/otc","/otc/"])("forwards a strict nonce policy for %s",path=>{
 const response=middleware(new NextRequest("https://www.argosbot.io"+path));
 const csp=response.headers.get("Content-Security-Policy")!;
 expect(csp).toContain("'strict-dynamic'");expect(csp).toMatch(/'nonce-[^']+'/);
 expect(csp.split("script-src")[1].split(";")[0]).not.toContain("unsafe-inline");
 expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
 expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
});
function respond(status=200,headers:Record<string,string>={"content-type":"image/png"},body=Buffer.from("png")){
 m.request.mockImplementationOnce((_url,options,callback)=>{
   // Simulate the socket resolver. It must use only the original checked address.
   const resolved=vi.fn();options.lookup("images.example",{},resolved);
   expect(resolved).toHaveBeenCalledWith(null,"8.8.8.8",4);
   const all=vi.fn();options.lookup("images.example",{all:true},all);
   expect(all).toHaveBeenCalledWith(null,[{address:"8.8.8.8",family:4}]);
   expect(options.agent).toBe(false);
   const req=new EventEmitter() as EventEmitter&{end:()=>void};
   req.end=()=>queueMicrotask(()=>{
     const res=Object.assign(new EventEmitter(),{statusCode:status,headers,destroy:vi.fn()});
     callback(res);res.emit("data",body);res.emit("end");
   });return req;
 });
}
const imageRequest=(url="https://images.example/logo.png")=>new NextRequest("https://www.argosbot.io/api/token-image?url="+encodeURIComponent(url));
it("pins the validated address even if a subsequent DNS lookup would be private",async()=>{
 m.lookup.mockResolvedValueOnce([{address:"8.8.8.8",family:4}]).mockResolvedValue([{address:"127.0.0.1",family:4}]);respond();
 const result=await GET(imageRequest());expect(result.status).toBe(200);expect(m.lookup).toHaveBeenCalledTimes(1);
 expect(await result.text()).toBe("png");
});
it("rejects a redirect that resolves to a private host",async()=>{
 m.lookup.mockResolvedValueOnce([{address:"8.8.8.8",family:4}]).mockResolvedValueOnce([{address:"10.0.0.1",family:4}]);respond(302,{location:"https://private.example/image"});
 expect((await GET(imageRequest())).status).toBe(307);expect(m.request).toHaveBeenCalledTimes(1);
});
it.each(["https://127.0.0.1/image","https://[::ffff:7f00:1]/image","https://[::1]/image","http://images.example/image"])("rejects unsafe target %s",async url=>{
 expect((await GET(imageRequest(url))).status).toBe(307);expect(m.request).not.toHaveBeenCalled();
});
it.each(["text/html","image/svg+xml"])("rejects %s",async type=>{
 m.lookup.mockResolvedValue([{address:"8.8.8.8",family:4}]);respond(200,{"content-type":type});
 expect((await GET(imageRequest())).status).toBe(307);
});
it("limits streamed response size",async()=>{
 m.lookup.mockResolvedValue([{address:"8.8.8.8",family:4}]);respond(200,{"content-type":"image/png"},Buffer.alloc(5*1024*1024+1));
 expect((await GET(imageRequest())).status).toBe(307);
});
