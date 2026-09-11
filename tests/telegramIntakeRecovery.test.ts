import {it,expect,vi} from "vitest";
import {reserveUpdate,recoverUpdates} from "../convex/telegram";
import {getFunctionName} from "convex/server";

const handler=(value:unknown)=>(value as {_handler:(ctx:unknown,args:unknown)=>Promise<unknown>})._handler;
it("persists the payload and schedules processing in the same mutation",async()=>{
 const insert=vi.fn(async()=>"row"),schedule=vi.fn(async(_delay:number,_ref:Parameters<typeof getFunctionName>[0],_args:unknown)=>"job");
 const ctx={db:{query:()=>({withIndex:()=>({unique:async()=>null,collect:async()=>[]})}),insert},scheduler:{runAfter:schedule}};
 const input={updateId:"8280311402_10",telegramUserId:"123",telegramChatId:"123",updateJson:JSON.stringify({update_id:10,message:{text:"/buy 10 USDC ARGUS"}})};
 expect(await handler(reserveUpdate)(ctx,input)).toBe(true);
 expect(insert).toHaveBeenCalledWith("telegramUpdates",expect.objectContaining({...input,status:"received",linkBindingVersion:1}));
 expect(schedule).toHaveBeenCalledWith(0,expect.anything(),{updateId:input.updateId,updateJson:input.updateJson});
 expect(getFunctionName(schedule.mock.calls[0][1])).toBe("telegram:processUpdate");
});
it("propagates scheduling failure so Convex rolls back reservation",async()=>{
 const ctx={db:{query:()=>({withIndex:()=>({unique:async()=>null,collect:async()=>[]})}),insert:vi.fn()},scheduler:{runAfter:vi.fn(async()=>{throw Error("scheduler unavailable");})}};
 await expect(handler(reserveUpdate)(ctx,{updateId:"bot_1",updateJson:"{}"})).rejects.toThrow("scheduler unavailable");
});
it("does not schedule duplicate intake",async()=>{
 const schedule=vi.fn();const ctx={db:{query:()=>({withIndex:()=>({unique:async()=>({_id:"old"})})})},scheduler:{runAfter:schedule}};
 expect(await handler(reserveUpdate)(ctx,{updateId:"bot_1",updateJson:"{}"})).toBe(false);expect(schedule).not.toHaveBeenCalled();
});
it("recovers the saved payload without rewriting wallet binding",async()=>{
 const row={_id:"row",updateId:"bot_1",updateJson:"original",boundOwnerXUserId:"original-owner"};
 const schedule=vi.fn(),patch=vi.fn();let reads=0;
 const ctx={db:{query:()=>({withIndex:()=>({take:async()=>reads++===0?[row]:[]})}),patch},scheduler:{runAfter:schedule}};
 await handler(recoverUpdates)(ctx,{});
 expect(patch).toHaveBeenCalledWith("row",{updatedAt:expect.any(Number)});
 expect(schedule).toHaveBeenCalledWith(0,expect.anything(),{updateId:"bot_1",updateJson:"original"});
});
