import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {validateStructuredWalletCommand} from "../convex/walletCommands";
import { getFunctionName } from "convex/server";
import { isTelegramUnlinkCommand, processUpdate, acceptUpdate } from "../convex/telegram";
import { TELEGRAM_MENU, TELEGRAM_FORMATS, telegramInput, telegramWalletCommand, telegramResponse } from "../lib/telegram-commands";

const address = "0x1111111111111111111111111111111111111111";
describe("Telegram command-only interface", () => {
  it.each(["hello", "buy 10 ARGUS", "resume", "10 USDC ARGUS", "guide:buy", "/fees", "/positions", "/launch", "/cancel"])("rejects chat and retired actions: %s", text => expect(telegramInput(text)).toBeNull());
  it("checks command addressing and callback payloads", () => {
    expect(telegramInput("/wallet@TheArgosBot", false, "TheArgosBot")?.name).toBe("wallet");
    expect(telegramInput("/wallet@other", false, "TheArgosBot")).toBeNull();
    expect(telegramInput("/buy 10 USDC ARGUS", true)).toBeNull();
    expect(telegramInput("/buy", true)?.name).toBe("buy");
  });
  it.each([
    ["buy", "10 USDC ARGUS", {kind:"buy", amount:"10",unit:"usd",token:"ARGUS"}],
    ["buy", "$10 ARGUS", {kind:"buy", amount:"10",unit:"usd",token:"ARGUS"}],
    ["sell", "100 ARGUS", {kind:"sell",amount:"100",unit:"token"}],
    ["sell", "$10 ARGUS", {kind:"sell",amount:"10",unit:"usd"}],
    ["sell", "50% ARGUS", {kind:"sell",amount:"50",unit:"percent"}],
    ["sell", "all ARGUS", {kind:"sell",amount:"100",unit:"percent"}],
    ["swap", "50% ARGUS for TOKEN", {kind:"swap_token_for_token",fromToken:"ARGUS",toToken:"TOKEN",amount:"50"}],
    ["send", `10 USDC to ${address}`, {kind:"send",token:"USDC",recipient:address}],
    ["burn", "100 ARGUS", {kind:"burn",token:"ARGUS",amount:"100"}],
    ["buyandsend", `10 USDC ARGUS to ${address}`, {kind:"buy_and_send",recipient:address}],
    ["buyandburn", "10 USDC ARGUS", {kind:"buy_and_burn",token:"ARGUS"}],
    ["swap", "$10 ARGUS for TOKEN", {kind:"swap_token_for_token",unit:"usd",amount:"10"}],
    ["swap", "100 ARGUS for TOKEN", {kind:"swap_token_for_token",unit:"token",amount:"100"}],
    ["burn", "50% ARGUS", {kind:"burn",unit:"percent",amount:"50"}],
    ["send", `$10 ARGUS to ${address}`, {kind:"send",unit:"usd",amount:"10"}],
    ["wallet", "", {kind:"show_wallet"}],
    ["balance", "USDC", {kind:"show_balance",token:"USDC"}],
  ] as const)("parses /%s %s without AI", (name,args,expected) => {const command=telegramWalletCommand(name,args);expect(command).toMatchObject(expected);expect(validateStructuredWalletCommand(command)).toMatchObject(expected);});
  it.each([
    ["buy", "10 ETH ARGUS"], ["buy", "10 USDC ARGUS then sell all"], ["buy", "-1 USDC ARGUS"],
    ["sell", "101% ARGUS"], ["sell", "$all ARGUS"], ["send", "10 USDC to @alice"],
    ["swap", "101% ARGUS for TOKEN"], ["burn", "101% ARGUS"],
    ["fees", "ARGUS"], ["wallet", "another person's wallet"],
  ])("rejects unsupported or incomplete /%s %s", (name,args) => expect(telegramWalletCommand(name,args)).toBeNull());
  it("has no retired feature buttons and every action button has a format", () => {
    for (const button of TELEGRAM_MENU.inline_keyboard.flat()) expect(telegramInput(button.callback_data,true)).not.toBeNull();
    expect(JSON.stringify(TELEGRAM_MENU)).not.toMatch(/fees|launch|base|otc|guide:/i);
    for (const key of Object.keys(TELEGRAM_FORMATS)) expect(TELEGRAM_MENU.inline_keyboard.flat().some(b=>b.callback_data===`/${key}`)).toBe(true);
  });
  it("accepts only slash unlink and removes reply prompts from results", () => {
    expect(isTelegramUnlinkCommand("/unlink")).toBe(true);
    expect(isTelegramUnlinkCommand("unlink TG")).toBe(false);
    expect(telegramResponse("Action needed: Fund it, then reply “resume”.")).toBe("Fund it, then submit the full /command again.");
    expect(telegramResponse("Enter the contract address.")).toContain("full /command");
  });
});

describe("Telegram update execution boundary", () => {
  beforeEach(()=>{vi.stubEnv("TELEGRAM_BOT_TOKEN","offline"); vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({ok:true}),{status:200})));});
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
  async function run(text:string,callback=false) {
    const ctx={
      runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>getFunctionName(ref)==="telegram:consumeRateLimit"?true:null),
      runQuery:vi.fn(async()=>({valid:true,link:{_id:"link1",ownerXUserId:"99"}})),
      runAction:vi.fn(async(_ref:Parameters<typeof getFunctionName>[0],_args:Record<string,unknown>)=>({ok:true,message:"Arc transaction confirmed."})),
    };
    const update=callback?{callback_query:{id:"cb",data:text,from:{id:1},message:{message_id:2,chat:{id:1,type:"private"}}}}:{message:{message_id:2,text,from:{id:1},chat:{id:1,type:"private"}}};
    await (processUpdate as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<void>})._handler(ctx,{updateId:"42",updateJson:JSON.stringify(update)});
    return ctx;
  }
  it.each(["buy 10 USDC ARGUS","resume","guide:buy","0x1111111111111111111111111111111111111111"])("never executes free text %s",async text=>{
    const ctx=await run(text);expect(ctx.runAction).not.toHaveBeenCalled();expect(ctx.runQuery).not.toHaveBeenCalled();
  });
  it("buttons show formats without executing or creating conversation state",async()=>{
    const ctx=await run("/buy",true);expect(ctx.runAction).not.toHaveBeenCalled();
    expect(ctx.runMutation.mock.calls.map(c=>getFunctionName(c[0]))).not.toContain("telegram:setConversation");
    expect(vi.mocked(fetch).mock.calls.some(c=>String(c[1]?.body).includes("/buy 10 USDC ARGUS"))).toBe(true);
  });
  it("sends only a parsed Arc command through the authorized wallet path",async()=>{
    const ctx=await run("/buy 10 USDC ARGUS");
    const call=ctx.runAction.mock.calls.find(c=>getFunctionName(c[0])==="wallets:executeCommand");
    expect(call?.[1]).toMatchObject({xUserId:"99",source:"telegram",telegramUpdateId:"42",parsedCommandJson:expect.stringContaining('"unit":"usd"')});
  });
});

it("namespaces incoming updates for the replacement bot",async()=>{
 vi.stubEnv("TELEGRAM_ENABLED","true");vi.stubEnv("TELEGRAM_WEBHOOK_SECRET","secret");
 try{
 const ctx={runMutation:vi.fn(async()=>true),scheduler:{runAfter:vi.fn()}};
 await (acceptUpdate as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<boolean>})._handler(ctx,{secret:"secret",updateJson:JSON.stringify({update_id:42})});
 expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({updateId:"8280311402_42"}));
 expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0,expect.anything(),expect.objectContaining({updateId:"8280311402_42"}));
 }finally{vi.unstubAllEnvs();}
});
