import {internalMutation} from "./_generated/server";
import {v} from "convex/values";
import {telegramInput} from "../lib/telegram-commands";
export const resolve=internalMutation({args:{updateId:v.string()},handler:async(ctx,a)=>{
  const update=await ctx.db.query("telegramUpdates").withIndex("by_update_id",q=>q.eq("updateId",a.updateId)).unique();
  if(!update?.telegramUserId||!update.telegramChatId||!update.updateJson)return null;
  if(update.feeInput)return update.feeInput;
  const raw=JSON.parse(update.updateJson),callback=raw.callback_query;
  const text=String(raw.message?.text??callback?.data??"").trim();
  const direct=telegramInput(text,!!callback);
  const row=await ctx.db.query("telegramFeePrompts").withIndex("by_user_chat",q=>q.eq("user",update.telegramUserId!).eq("chat",update.telegramChatId!)).unique();
  if(row && /^\d+$/.test(a.updateId) && /^\d+$/.test(row.updateId) && BigInt(a.updateId)<=BigInt(row.updateId))return null;
  if(direct&&["fees","claim"].includes(direct.name)&&!direct.args) {
    const value={user:update.telegramUserId,chat:update.telegramChatId,name:direct.name,updateId:a.updateId,expiresAt:Date.now()+600000};
    if(row)await ctx.db.replace(row._id,value);else await ctx.db.insert("telegramFeePrompts",value);
    await ctx.db.patch(update._id,{feeInput:direct});return direct;
  }
  if(direct||text.startsWith("/")){if(row)await ctx.db.delete(row._id);return null;}
  if(callback||!row||row.expiresAt<=Date.now()||!/^\$?(0x[\da-f]{40}|[a-z\d][a-z\d_]{0,31})$/i.test(text)||!/^\d+$/.test(a.updateId)||!/^\d+$/.test(row.updateId)||BigInt(a.updateId)<=BigInt(row.updateId))return null;
  const input={name:row.name,args:text};await ctx.db.patch(update._id,{feeInput:input});await ctx.db.delete(row._id);return input;
}});
