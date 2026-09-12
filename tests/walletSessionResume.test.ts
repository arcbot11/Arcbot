import React from "react";
import {it,expect,vi,afterEach} from "vitest";
const h=vi.hoisted(()=>({value:null as unknown,cleanup:undefined as undefined|(()=>void)}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
 useState:()=>[h.value,(next:unknown)=>{h.value=typeof next==="function"?next(h.value):next;}],
 useEffect:(effect:()=>void|(()=>void))=>{h.cleanup=effect()||undefined;},
}));
import {WalletSessionProvider} from "../components/WalletSessionProvider";
afterEach(()=>{h.cleanup?.();h.value=null;vi.unstubAllGlobals();});
it.each(["pageshow","visibilitychange"])("refreshes on %s and discards a pre-login response",async event=>{
 vi.stubGlobal("React",React);
 const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:"visible"});
 vi.stubGlobal("window",win);vi.stubGlobal("document",doc);vi.stubGlobal("localStorage",{setItem:vi.fn()});
 let finishOld!:(r:Response)=>void;
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finishOld=resolve;})).mockResolvedValue(Response.json({authenticated:true,walletAddress:"wallet",expiresAt:Math.floor(Date.now()/1000)+3600}));
 vi.stubGlobal("fetch",fetcher);WalletSessionProvider({children:null});
 (event==="pageshow"?win:doc).dispatchEvent(new Event(event));
 await vi.waitFor(()=>expect(h.value).toMatchObject({authenticated:true}));
 finishOld(Response.json({authenticated:false}));
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(h.value).toMatchObject({authenticated:true});expect(fetcher).toHaveBeenCalledTimes(2);
});
