import {it,expect} from "vitest";
import {telegramOperatorProfile as profile} from "../lib/telegram-operator-profile";
const message={from:{id:123,username:"alice"},chat:{id:123,type:"private"},text:"/balance"};
it("records Telegram metadata from the matching private sender",()=>{
 expect(profile(JSON.stringify({message}),"123","123",5)).toEqual({telegramUsername:"alice",telegramUsernameUpdatedAt:5});
});
it("uses callback sender rather than the bot message author",()=>{
 expect(profile(JSON.stringify({callback_query:{from:message.from,message:{...message,from:{id:9,username:"bot",is_bot:true}}}}),"123","123",6)?.telegramUsername).toBe("alice");
});
it("does not infer usernames from command text or another identity",()=>{
 expect(profile(JSON.stringify({message}),"456","456",5)).toBeNull();
 expect(profile(JSON.stringify({message:{...message,chat:{id:123,type:"group"}}}),"123","123",5)).toBeNull();
 expect(profile(JSON.stringify({message:{...message,from:{id:123},text:"@someone"}}),"123","123",5)?.telegramUsername).toBeUndefined();
});
it("clears removed usernames and ignores malformed updates",()=>{
 expect(profile(JSON.stringify({message:{...message,from:{id:123}}}),"123","123",7)).toEqual({telegramUsername:undefined,telegramUsernameUpdatedAt:7});
 expect(profile("invalid","123","123",7)).toBeNull();
});
