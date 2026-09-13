import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("viem/accounts",()=>({privateKeyToAddress:()=>"0x1111111111111111111111111111111111111111"}));
type Element={value:string;textContent:string;hidden:boolean;disabled:boolean;checked:boolean;onclick?:()=>void;onchange?:()=>void};
const nodes:Record<string,Element>={};
const events:Record<string,()=>void>={};
let actions:Array<{action:string;ticket?:string;verifier?:string;publicKey?:string;keyHash?:string;initData?:string}>,hidden=false,failApproval=false,generate:ReturnType<typeof vi.fn>;
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
beforeEach(()=>{
 vi.resetModules();vi.useFakeTimers();actions=[];hidden=false;failApproval=false;
 for(const id of ["message","details","verify","reveal","confirm","copy","key","close","retry","consent"])nodes[id]={value:"",textContent:"",hidden:true,disabled:false,checked:false};
 vi.stubGlobal("document",{getElementById:(id:string)=>nodes[id],get hidden(){return hidden;},addEventListener:(name:string,fn:()=>void)=>{events[name]=fn;}});
 vi.stubGlobal("window",{addEventListener:(name:string,fn:()=>void)=>{events[name]=fn;},location:{assign:vi.fn()}});
 vi.stubGlobal("location",{hash:"",pathname:"/api/key-export/view"});vi.stubGlobal("history",{replaceState:vi.fn()});vi.stubGlobal("navigator",{clipboard:{writeText:vi.fn().mockResolvedValue(undefined)}});
 generate=vi.fn().mockResolvedValue({publicKey:{},privateKey:{}});
 vi.stubGlobal("crypto",{getRandomValues:(v:Uint8Array)=>v.fill(1),subtle:{generateKey:generate,exportKey:vi.fn().mockResolvedValue(new Uint8Array([1,2]).buffer),digest:vi.fn().mockResolvedValue(new Uint8Array(32).fill(1).buffer),decrypt:vi.fn().mockResolvedValue(new Uint8Array(32).fill(2).buffer)}});
 vi.stubGlobal("fetch",vi.fn(async(_url:string,init:{body:string})=>{
  const body=JSON.parse(init.body);actions.push(body);
  if(body.action==="approve"&&failApproval){failApproval=false;throw Error("Response lost");}
  return {ok:true,json:async()=>body.action==="approve"?{keyHash:"01".repeat(32)}:body.action==="export"?{address:"0x1111111111111111111111111111111111111111",encryptedPrivateKey:"AQ=="}:{provider:"x",state:actions.some(a=>a.action==="export")?"relayed":"authenticated",address:"0x1111111111111111111111111111111111111111",expiresAt:Date.now()+300000}};
 }));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
async function open(){await import("../lib/key-export/browser");await flush();nodes.confirm.checked=true;nodes.confirm.onchange?.();}
it("reveals only after approval and matching delivery, then hides after 30 seconds",async()=>{
 await open();expect(nodes.key.value).toBe("");nodes.reveal.onclick?.();await flush();
 expect(actions.map(a=>a.action)).toEqual(["status","approve","export","status"]);expect(nodes.key.value.length).toBe(66);expect(nodes.key.hidden).toBe(false);
 await vi.advanceTimersByTimeAsync(30000);expect(nodes.key.value).toBe("");expect(nodes.key.hidden).toBe(true);expect(actions.at(-1)?.action).toBe("close");
});
it("retries a lost approval response with the identical browser key",async()=>{
 await open();failApproval=true;nodes.reveal.onclick?.();await flush();expect(nodes.key.value).toBe("");nodes.retry.onclick?.();await flush();
 expect(generate).toHaveBeenCalledTimes(1);const approvals=actions.filter(a=>a.action==="approve");expect(approvals).toHaveLength(2);expect(approvals[0].publicKey).toBe(approvals[1].publicKey);expect(nodes.key.hidden).toBe(false);
});
it("never exports when backgrounded while RSA generation is unfinished",async()=>{
 let finish!:(v:unknown)=>void;generate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await open();nodes.reveal.onclick?.();hidden=true;events.visibilitychange();finish({publicKey:{},privateKey:{}});await flush();
 expect(actions.some(a=>a.action==="export"||a.action==="approve")).toBe(false);expect(nodes.key.value).toBe("");expect(nodes.reveal.disabled).toBe(true);
});
it("clears a revealed key when the page goes into the background",async()=>{
 await open();nodes.reveal.onclick?.();await flush();hidden=true;events.visibilitychange();await flush();expect(nodes.key.value).toBe("");expect(nodes.copy.hidden).toBe(true);
});
it("withholds an in-flight response after logout in another window",async()=>{
 let finish!:(v:unknown)=>void;const original=fetch;
 vi.stubGlobal("fetch",vi.fn((url:string,init:{body:string})=>{
  if(JSON.parse(init.body).action==="export"){actions.push({action:"export"});return new Promise(resolve=>{finish=resolve;});}
  if(JSON.parse(init.body).action==="status"&&actions.some(a=>a.action==="export")){actions.push({action:"status"});return Promise.resolve({ok:false,json:async()=>({error:"Session revoked"})});}
  return original(url,init);
 }));
 await open();nodes.reveal.onclick?.();await flush();
 // Server authorized this response, then the main-site session was revoked in
 // another visible window before ciphertext arrived. No visibility event fires.
 finish({ok:true,json:async()=>({address:"0x1111111111111111111111111111111111111111",encryptedPrivateKey:"AQ=="})});await flush();
 expect(nodes.key.hidden).toBe(true);expect(nodes.key.value).toBe("");expect(actions.filter(a=>a.action==="status")).toHaveLength(2);
});
it.each(["revoked","unavailable"])("hides an already revealed key when authority becomes %s",async mode=>{
 await open();nodes.reveal.onclick?.();await flush();expect(nodes.key.hidden).toBe(false);
 vi.stubGlobal("fetch",vi.fn(async()=>{if(mode==="unavailable")throw Error("Offline");return {ok:false,json:async()=>({error:"Revoked"})};}));
 await vi.advanceTimersByTimeAsync(2000);expect(nodes.key.value).toBe("");expect(nodes.copy.hidden).toBe(true);expect(nodes.message.textContent).toContain("Key hidden");
});
it("reconciles a committed Telegram proof after a lost response and retains proof after status outage",async()=>{
 vi.stubGlobal("location",{hash:"#tgWebAppData=signed-proof",pathname:"/api/key-export/view"});
 let committed=false,failedStatus=false;
 vi.stubGlobal("fetch",vi.fn(async(_url:string,init:{body:string})=>{
  const body=JSON.parse(init.body);actions.push(body);
  if(body.action==="telegram"){committed=true;if(!failedStatus)throw Error("Response lost");}
  if(body.action==="status"&&committed&&!failedStatus){failedStatus=true;throw Error("Status lost");}
  return {ok:true,json:async()=>({provider:"telegram",state:committed?"authenticated":"pending",address:"0x1111111111111111111111111111111111111111",expiresAt:Date.now()+300000})};
 }));
 await open();nodes.verify.onclick?.();await flush();nodes.verify.onclick?.();await flush();
 expect(actions.filter(a=>a.action==="telegram").map(a=>a.initData)).toEqual(["signed-proof","signed-proof"]);
 expect(nodes.message.textContent).toContain("Identity verified");expect(nodes.reveal.hidden).toBe(false);
});
it("retries a lost initial claim response with the identical ephemeral proof",async()=>{
 vi.stubGlobal("location",{hash:"#ticket="+"a".repeat(64),pathname:"/api/key-export/view"});
 const original=fetch;let failed=false;
 vi.stubGlobal("fetch",vi.fn(async(url:string,init:{body:string})=>{if(!failed){failed=true;actions.push(JSON.parse(init.body));throw Error("Claim response lost");}return original(url,init);}));
 await open();
 expect(actions.map(a=>a.action)).toEqual(["claim"]);expect(history.replaceState).toHaveBeenCalledWith(null,"","/api/key-export/view");
 expect(nodes.verify.hidden).toBe(true);expect(nodes.reveal.hidden).toBe(true);expect(nodes.retry.hidden).toBe(false);expect(nodes.key.value).toBe("");
 nodes.retry.onclick?.();await flush();expect(actions[1]).toEqual(actions[0]);expect(nodes.retry.hidden).toBe(true);expect(nodes.reveal.hidden).toBe(false);
});

it("drops its new candidate verifier when claim recovers through the existing cookie",async()=>{
 vi.stubGlobal("location",{hash:"#ticket="+"a".repeat(64),pathname:"/api/key-export/view"});
 vi.stubGlobal("fetch",vi.fn(async(_url:string,init:{body:string})=>{
  const body=JSON.parse(init.body);actions.push(body);
  return {ok:true,json:async()=>({provider:"x",state:"pending",address:"test",expiresAt:Date.now()+300000,cookieBound:true,url:"https://x.com/i/oauth2/authorize"})};
 }));
 await open();nodes.verify.onclick?.();await flush();expect(actions[0].ticket).toBe("a".repeat(64));expect(actions[1]).toEqual({action:"x"});
});
it("offers an opening retry when cookie-based status fails before any key is generated",async()=>{
 const original=fetch;let once=true;
 vi.stubGlobal("fetch",vi.fn((url:string,init:{body:string})=>{if(once){once=false;return Promise.reject(Error("Status unavailable"));}return original(url,init);}));
 await open();expect(nodes.retry.hidden).toBe(false);expect(generate).not.toHaveBeenCalled();nodes.retry.onclick?.();await flush();expect(nodes.reveal.hidden).toBe(false);expect(nodes.retry.hidden).toBe(true);
});


const restore=()=>{(events.pageshow as unknown as (event:{persisted:boolean})=>void)({persisted:true});};
it("revalidates a cached pre-reveal page without revoking it and requires consent again",async()=>{
 await open();expect(generate).not.toHaveBeenCalled();restore();
 expect(nodes.reveal.hidden).toBe(true);await flush();
 expect(actions.map(a=>a.action)).toEqual(["status","status"]);
 expect(nodes.reveal.hidden).toBe(false);expect(nodes.reveal.disabled).toBe(true);expect(nodes.confirm.checked).toBe(false);
 expect(generate).not.toHaveBeenCalled();
});
it.each(["offline","revoked","expired","other-wallet"])("does not restore stale controls when authorization is %s",async mode=>{
 await open();vi.stubGlobal("fetch",vi.fn(async()=>{
  if(mode==="offline")throw Error("Offline");if(mode==="revoked")return {ok:false,json:async()=>({error:"Revoked"})};
  return {ok:true,json:async()=>({provider:"x",address:mode==="other-wallet"?"0x2222222222222222222222222222222222222222":"0x1111111111111111111111111111111111111111",state:"authenticated",expiresAt:Date.now()+(mode==="expired"?-1:300000)})};
 }));restore();await flush();expect(nodes.reveal.hidden).toBe(true);expect(nodes.verify.hidden).toBe(true);expect(generate).not.toHaveBeenCalled();expect(nodes.key.value).toBe("");
});
it("never restores an encryption session from browser history",async()=>{
 await open();nodes.reveal.onclick?.();await flush();expect(nodes.key.hidden).toBe(false);restore();await flush();expect(nodes.key.hidden).toBe(true);expect(nodes.key.value).toBe("");expect(actions.at(-1)).toMatchObject({action:"close",acknowledged:true});
});
it("ignores an older in-flight initialization after a cached-page restore",async()=>{
 let finish!:(v:unknown)=>void;const original=fetch;let first=true;
 vi.stubGlobal("fetch",vi.fn((url:string,init:{body:string})=>{if(first){first=false;return new Promise(resolve=>{finish=resolve;});}return original(url,init);}));
 await open();restore();await flush();expect(nodes.reveal.hidden).toBe(false);
 finish({ok:true,json:async()=>({provider:"x",state:"authenticated",address:"attacker",expiresAt:Date.now()+300000})});await flush();
 expect(nodes.details.textContent).not.toContain("attacker");expect(nodes.message.textContent).toContain("Identity verified");expect(generate).not.toHaveBeenCalled();
});
