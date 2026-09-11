import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {getFunctionName} from "convex/server";
import {scheduleInteractionRetry} from "../convex/xReplies";
import {continueArcCommand,executeCommand} from "../convex/wallets";
import {ARC_WALLET_PENDING,ARC_COMMAND_HTTP_TIMEOUT_MS,arcPendingRetryDelay,arcServiceResult} from "../lib/arc/social-timing";
const invoke=(fn:unknown,ctx:unknown,args:unknown)=>(fn as {_handler:(ctx:unknown,args:unknown)=>Promise<unknown>})._handler(ctx,args);
beforeEach(()=>{vi.stubEnv("WEB_AUTH_SECRET","test-secret");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
function fixture(){
 const row:Record<string,unknown>={_id:"interaction",postId:"post",status:"processing",retryCount:60,createdAt:Date.now()-20*60_000};
 const runAfter=vi.fn();
 return {row,ctx:{db:{query:()=>({withIndex:()=>({unique:async()=>row})}),patch:async(_id:string,change:object)=>Object.assign(row,change)},scheduler:{runAfter}}};
}
it("keeps pending wallet outcomes scheduled beyond the ordinary retry limit without duplicate jobs",async()=>{
 const {row,ctx}=fixture();
 await invoke(scheduleInteractionRetry,ctx,{postId:"post",safeError:ARC_WALLET_PENDING});
 expect(row.retryCount).toBe(0);expect(row.nextRetryAt).toBeGreaterThan(Date.now());expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
 await invoke(scheduleInteractionRetry,ctx,{postId:"post",safeError:ARC_WALLET_PENDING});
 expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
 row.nextRetryAt=Date.now()-1;
 await invoke(scheduleInteractionRetry,ctx,{postId:"post",safeError:ARC_WALLET_PENDING});
 expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(2);
});
it.each(["completed","rejected","publishing"])("never reopens %s publication",async status=>{
 const {row,ctx}=fixture();row.status=status;
 await invoke(scheduleInteractionRetry,ctx,{postId:"post",safeError:ARC_WALLET_PENDING});
 expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
});
it("backs off observation while keeping realistic early polling",()=>{
 expect(arcPendingRetryDelay(0,60_000)).toBe(15_000);
 expect(arcPendingRetryDelay(0,20*60_000)).toBe(30_000);
 expect(arcPendingRetryDelay(0,45*60_000)).toBe(60_000);
 expect(arcPendingRetryDelay(0,24*60*60_000)).toBe(300_000);
 expect(arcServiceResult({error:"upstream timeout"}).pending).toBe(true);
 expect(arcServiceResult({ok:false,message:"Transaction reverted."}).ok).toBe(false);
});
it.each(["timeout","malformed"])("keeps %s responses pending without failing the request or duplicating X polling",async kind=>{
 const request={source:"x",status:"prepared",ownerXUserId:"alice",_creationTime:Date.now()-20*60_000};
 const ctx={runQuery:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>getFunctionName(ref).endsWith("getWalletRequest")?request:{wallet:{address:"0x1111111111111111111111111111111111111111"}}),runMutation:vi.fn(),scheduler:{runAfter:vi.fn()}};
 vi.stubGlobal("fetch",kind==="timeout"?vi.fn().mockRejectedValue(new Error("timed out")):vi.fn().mockResolvedValue({ok:true,json:async()=>({error:"proxy"})}));
 const timeout=vi.spyOn(AbortSignal,"timeout");
 const result=await invoke(continueArcCommand,ctx,{requestId:"x:post:buy",attempt:80});
 expect(result).toMatchObject({pending:true});expect(ctx.runMutation).not.toHaveBeenCalled();expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
 expect(timeout).toHaveBeenCalledWith(ARC_COMMAND_HTTP_TIMEOUT_MS);
});

it.each(["telegram","x"])("defers pending %s messages until verification",async source=>{
 const request={source,status:"prepared",ownerXUserId:"alice",_creationTime:Date.now()};
 const ctx={runQuery:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>getFunctionName(ref).endsWith("getWalletRequest")?request:{wallet:{address:"0x1111111111111111111111111111111111111111"}}),runMutation:vi.fn(),scheduler:{runAfter:vi.fn()}};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({pending:true,message:"Arc request recorded. Check wallet history."})}));
 expect(await invoke(continueArcCommand,ctx,{requestId:"request"})).toMatchObject({pending:true,deferred:true,message:""});
 expect(ctx.runMutation).not.toHaveBeenCalled();
 expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(source==="telegram"?1:0);
});

it("blocks a forged Base withdrawal from X before wallet access",async()=>{
 const ctx={runQuery:vi.fn(),runMutation:vi.fn(),runAction:vi.fn()};
 const result=await invoke(executeCommand,ctx,{source:"x",xUserId:"12345",sourcePostId:"post",text:"withdraw",parsedCommandJson:JSON.stringify({kind:"send",chainId:8453,unit:"eth",amount:"0.001",recipient:"0x1111111111111111111111111111111111111111"})});
 expect(result).toMatchObject({ok:false});expect(ctx.runQuery).not.toHaveBeenCalled();expect(ctx.runMutation).not.toHaveBeenCalled();expect(ctx.runAction).not.toHaveBeenCalled();
});
