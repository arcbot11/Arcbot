import {it,expect} from "vitest";
import {resolve} from "../convex/feePrompts";
function fixture(text:string,options:{id?:string;promptId?:string;expired?:boolean;callback?:boolean}={}) {
 let prompt:any={_id:"prompt",user:"123",chat:"456",name:"claim",updateId:options.promptId??"100",expiresAt:Date.now()+(options.expired?-1:60000)};
 const update:any={_id:"update",telegramUserId:"123",telegramChatId:"456",updateId:options.id??"101",updateJson:JSON.stringify(options.callback?{callback_query:{data:text}}:{message:{text}})};
 const ctx={db:{query:(table:string)=>({withIndex:()=>({unique:async()=>table==="telegramUpdates"?update:prompt})}),patch:async(_id:string,v:object)=>Object.assign(update,v),delete:async()=>{prompt=null;},replace:async(_id:string,v:object)=>{prompt={_id,...v};},insert:async(_t:string,v:object)=>{prompt={_id:"prompt",...v};}}};
 const run=()=> (resolve as unknown as {_handler:(ctx:unknown,a:{updateId:string})=>Promise<unknown>})._handler(ctx,{updateId:update.updateId});
 return {run,update,prompt:()=>prompt};
}
it("consumes a ticker and persists its command for idempotent update retries",async()=>{const f=fixture("ARGOS");expect(await f.run()).toEqual({name:"claim",args:"ARGOS"});expect(f.prompt()).toBeNull();expect(await f.run()).toEqual({name:"claim",args:"ARGOS"});});
it("allows numeric tickers",async()=>{expect(await fixture("222").run()).toEqual({name:"claim",args:"222"});});
it("cancels an old fee prompt when another slash command arrives",async()=>{const f=fixture("/wallet");expect(await f.run()).toBeNull();expect(f.prompt()).toBeNull();});
it("does not consume expired prompts or older updates",async()=>{expect(await fixture("ARGOS",{expired:true}).run()).toBeNull();const f=fixture("/fees",{id:"99"});expect(await f.run()).toBeNull();expect(f.prompt().name).toBe("claim");});
it("the Check Fees button replaces a Claim Fees prompt without executing",async()=>{const f=fixture("/fees",{callback:true});expect(await f.run()).toEqual({name:"fees",args:""});expect(f.prompt()).toMatchObject({name:"fees",updateId:"101"});});
it("never turns multiple commands or arbitrary prose into a token",async()=>{expect(await fixture("ARGOS then sell all").run()).toBeNull();});
