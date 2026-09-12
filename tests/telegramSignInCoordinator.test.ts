import {beforeEach,afterEach,it,expect,vi} from "vitest";
let signin:typeof import("../lib/telegram-web-signin");
const pending={status:"pending",code:"ABCDEF12",expiresAt:Date.now()+600000,url:"https://t.me/The_ArgosBot?start=web_test",returnTo:"/otc"};
const storage=new Map<string,string>();
beforeEach(async()=>{
  vi.resetModules(); storage.clear();
  vi.stubGlobal("sessionStorage",{setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
  signin=await import("../lib/telegram-web-signin");
});
afterEach(()=>vi.unstubAllGlobals());
it("shares browser setup across simultaneously mounted sign-in controls",async()=>{
  let resolve!:(r:Response)=>void;
  const fetcher=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal("fetch",fetcher);
  const first=signin.prepareSignInBrowser(),second=signin.prepareSignInBrowser();
  expect(fetcher).toHaveBeenCalledTimes(1);resolve(Response.json({ready:true}));await Promise.all([first,second]);
});
it("shares a poll between the popup and page recovery and restores the pending marker",async()=>{
  let resolve!:(r:Response)=>void;
  const fetcher=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal("fetch",fetcher);
  const popup=signin.readTelegramSignIn(),recovery=signin.readTelegramSignIn();
  expect(fetcher).toHaveBeenCalledTimes(1);resolve(Response.json(pending));
  expect(await popup).toEqual(pending);expect(await recovery).toEqual(pending);
  expect(storage.get(signin.TELEGRAM_SIGNIN_PENDING)).toBe(String(pending.expiresAt));
});
it("does not multiply challenges or inspect the previous cookie during a start",async()=>{
  let resolve!:(r:Response)=>void;
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({ready:true})).mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal("fetch",fetcher);
  const first=signin.startTelegramSignIn("/otc"),second=signin.startTelegramSignIn("/wallet");
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  const poll=signin.readTelegramSignIn();expect(fetcher).toHaveBeenCalledTimes(2);
  resolve(Response.json(pending));expect(await first).toEqual(pending);await second;await poll;
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({action:"start",returnTo:"/otc"});
});
it("finishes an existing poll before replacing its challenge",async()=>{
  let resolve!:(r:Response)=>void;
  const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;})).mockResolvedValueOnce(Response.json({ready:true})).mockResolvedValueOnce(Response.json(pending));vi.stubGlobal("fetch",fetcher);
  const poll=signin.readTelegramSignIn(),start=signin.startTelegramSignIn("/otc",true);
  expect(fetcher).toHaveBeenCalledTimes(1);resolve(Response.json({status:"expired"}));await poll;await start;
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({action:"start",returnTo:"/otc",restart:true});
});
it("allows recovery after a transport failure without clearing the saved attempt",async()=>{
  storage.set(signin.TELEGRAM_SIGNIN_PENDING,String(pending.expiresAt));
  const fetcher=vi.fn().mockRejectedValueOnce(Error("network")).mockResolvedValueOnce(Response.json(pending));vi.stubGlobal("fetch",fetcher);
  await expect(signin.readTelegramSignIn()).rejects.toThrow("network");
  expect(storage.has(signin.TELEGRAM_SIGNIN_PENDING)).toBe(true);
  expect(await signin.readTelegramSignIn()).toEqual(pending);
});
