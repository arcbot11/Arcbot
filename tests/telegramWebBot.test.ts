import {afterEach,it,expect,vi} from "vitest";
import {getFunctionName} from "convex/server";
import {processUpdate} from "../convex/telegram";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each([false,true])("routes website sign-in through the real bot handler (callback=%s)",async callback=>{
 vi.stubEnv("TELEGRAM_BOT_TOKEN","mock-only");
 const fetcher=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal("fetch",fetcher);
 const ctx={runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>{
  const name=getFunctionName(ref);if(name==="telegram:consumeRateLimit")return true;
  if(name==="telegramWebAuth:respond")return callback?{status:"approved"}:{status:"confirm",code:"ABCDEF12"};
 }),runAction:vi.fn()};
 const token="a".repeat(32),chat={id:123,type:"private"},from={id:123};
 const update=callback?{callback_query:{id:"cb",from,message:{chat},data:`webok_${token}`}}:{message:{chat,from,text:`/start web_${token}`}};
 await (processUpdate as unknown as {_handler:(ctx:unknown,a:unknown)=>Promise<void>})._handler(ctx,{updateId:"tg-web",updateJson:JSON.stringify(update)});
 const call=ctx.runMutation.mock.calls.find(([ref])=>getFunctionName(ref)==="telegramWebAuth:respond");
 expect(call).toBeDefined();expect(ctx.runAction).not.toHaveBeenCalled();
 const sent=fetcher.mock.calls.map(c=>JSON.parse((c as unknown as [string,{body:string}])[1].body));
 expect(sent.some(b=>b.text?.includes(callback?"Website sign-in approved":"ABCDEF12"))).toBe(true);
});
