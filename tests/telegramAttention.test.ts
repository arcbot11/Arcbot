import {expect,it,vi} from "vitest";
import {getFunctionName} from "convex/server";
import {deliver} from "../convex/telegramDeliveries";
import {ARC_SIGNED_PAUSED} from "../lib/arc/social-timing";

it("keeps linked-wallet delivery pending after a pause notice and delivers the later verified result",async()=>{
 const row={requestId:"request",telegramUpdateId:"update",ownerXUserId:"owner",telegramUserId:"123",telegramChatId:"123"};
 let result:Record<string,unknown>={status:"prepared",attention:ARC_SIGNED_PAUSED};
 const ctx={runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0],args:unknown)=>{void args;return getFunctionName(ref)==="telegramDeliveries:reserve"?row:true;}),
   runQuery:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>getFunctionName(ref)==="telegram:boundUpdateLink"?{valid:true,link:{ownerXUserId:"owner"}}:result),runAction:vi.fn(async()=>true)};
 const invoke=()=> (deliver as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<void>})._handler(ctx,{requestId:row.requestId});
 await invoke();await invoke();
 expect(ctx.runAction).toHaveBeenCalledTimes(2);
 for(const call of ctx.runAction.mock.calls as unknown as [unknown,Record<string,unknown>][])expect(call[1]).toMatchObject({requestId:"telegram-attention:request",text:ARC_SIGNED_PAUSED});
 for(const call of ctx.runMutation.mock.calls.filter(c=>getFunctionName(c[0])==="telegramDeliveries:finish")){
   expect(call[1]).toMatchObject({status:"pending"});expect(call[1]).not.toHaveProperty("text");
 }
 result={status:"confirmed",finalMessage:"Bought 1,000 ARGOS for 10 USDC."};await invoke();
 expect(ctx.runAction).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({requestId:"telegram-result:request",text:result.finalMessage}));
 expect(ctx.runMutation).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({status:"delivered"}));
});
