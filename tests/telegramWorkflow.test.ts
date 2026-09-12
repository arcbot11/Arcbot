import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {validateStructuredWalletCommand} from "../convex/walletCommands";
import { getFunctionName } from "convex/server";
import { isTelegramUnlinkCommand, processUpdate, acceptUpdate } from "../convex/telegram";
import { TELEGRAM_MENU, TELEGRAM_FORMATS, telegramInput, telegramWalletCommand, telegramResponse } from "../lib/telegram-commands";

const address = "0x1111111111111111111111111111111111111111";
describe("Telegram command-only interface", () => {
  it.each(["hello", "buy 10 ARGOS", "resume", "10 USDC ARGOS", "guide:buy", "/fees", "/positions", "/launch", "/cancel", "/buyandsend", "/buyandburn"])("rejects chat and retired actions: %s", text => expect(telegramInput(text)).toBeNull());
  it("checks command addressing and callback payloads", () => {
    expect(telegramInput("/wallet@TheArgosBot", false, "TheArgosBot")?.name).toBe("wallet");
    expect(telegramInput("/wallet@other", false, "TheArgosBot")).toBeNull();
    expect(telegramInput("/buy 10 USDC ARGOS", true)).toBeNull();
    expect(telegramInput("/buy", true)?.name).toBe("buy");
  });
  it.each([
    ["buy", "10 USDC ARGOS", {kind:"buy", amount:"10",unit:"usd",token:"ARGOS"}],
    ["buy", "$10 ARGOS", {kind:"buy", amount:"10",unit:"usd",token:"ARGOS"}],
    ["sell", "100 ARGOS", {kind:"sell",amount:"100",unit:"token"}],
    ["sell", "$10 ARGOS", {kind:"sell",amount:"10",unit:"usd"}],
    ["sell", "50% ARGOS", {kind:"sell",amount:"50",unit:"percent"}],
    ["sell", "all ARGOS", {kind:"sell",amount:"100",unit:"percent"}],
    ["swap", "50% ARGOS for TOKEN", {kind:"swap_token_for_token",fromToken:"ARGOS",toToken:"TOKEN",amount:"50"}],
    ["send", `10 USDC to ${address}`, {kind:"send",token:"USDC",recipient:address}],
    ["burn", "100 ARGOS", {kind:"burn",token:"ARGOS",amount:"100"}],
    ["swap", "$10 ARGOS for TOKEN", {kind:"swap_token_for_token",unit:"usd",amount:"10"}],
    ["swap", "100 ARGOS for TOKEN", {kind:"swap_token_for_token",unit:"token",amount:"100"}],
    ["burn", "50% ARGOS", {kind:"burn",unit:"percent",amount:"50"}],
    ["send", `$10 ARGOS to ${address}`, {kind:"send",unit:"usd",amount:"10"}],
    ["wallet", "", {kind:"show_wallet"}],
    ["balance", "USDC", {kind:"show_balance",token:"USDC"}],
  ] as const)("parses /%s %s without AI", (name,args,expected) => {const command=telegramWalletCommand(name,args);expect(command).toMatchObject(expected);expect(validateStructuredWalletCommand(command)).toMatchObject(expected);});
  it.each([
    ["buyandsend", `10 USDC ARGOS to ${address}`], ["buyandburn", "10 USDC ARGOS"],
    ["buy", "10 ETH ARGOS"], ["buy", "10 USDC ARGOS then sell all"], ["buy", "-1 USDC ARGOS"],
    ["sell", "101% ARGOS"], ["sell", "$all ARGOS"], ["send", "10 USDC to @alice"],
    ["swap", "101% ARGOS for TOKEN"], ["burn", "101% ARGOS"],
    ["fees", "ARGOS"], ["wallet", "another person's wallet"],
  ])("rejects unsupported or incomplete /%s %s", (name,args) => expect(telegramWalletCommand(name,args)).toBeNull());
  it("has no retired feature buttons and every action button has a format", () => {
    for (const button of TELEGRAM_MENU.inline_keyboard.flat()) expect(telegramInput(button.callback_data,true)).not.toBeNull();
    expect(JSON.stringify(TELEGRAM_MENU)).not.toMatch(/fees|launch|otc|guide:|buyandsend|buyandburn/i);
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
  async function run(text:string,callback=false,result: {ok:boolean;message:string;pending?:boolean;deferred?:boolean}={ok:true,message:"Arc transaction confirmed."}) {
    const ctx={
      runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>getFunctionName(ref)==="telegram:consumeRateLimit"?true:getFunctionName(ref)==="telegram:consumeLinkNonce"?{status:"linked"}:null),
      runQuery:vi.fn(async()=>({valid:true,link:{_id:"link1",ownerXUserId:"99"}})),
      runAction:vi.fn(async(_ref:Parameters<typeof getFunctionName>[0],_args:Record<string,unknown>)=>result),
    };
    const update=callback?{callback_query:{id:"cb",data:text,from:{id:1},message:{message_id:2,chat:{id:1,type:"private"}}}}:{message:{message_id:2,text,from:{id:1},chat:{id:1,type:"private"}}};
    await (processUpdate as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<void>})._handler(ctx,{updateId:"42",updateJson:JSON.stringify(update)});
    return ctx;
  }
  it.each(["buy 10 USDC ARGOS","resume","guide:buy","0x1111111111111111111111111111111111111111"])("never executes free text %s",async text=>{
    const ctx=await run(text);expect(ctx.runAction).not.toHaveBeenCalled();expect(ctx.runQuery).not.toHaveBeenCalled();
  });
  it("finishes an OAuth return in Telegram without running a wallet command",async()=>{
    const ctx=await run("/start link_"+"a".repeat(32));
    expect(ctx.runMutation.mock.calls.map(c=>getFunctionName(c[0]))).toContain("telegram:consumeLinkNonce");
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.some(c=>String(c[1]?.body).includes("Your wallet is ready"))).toBe(true);
  });
  it.each(["/buyandsend", "/buyandburn"])("rejects old combined-action buttons and commands: %s",async command=>{
    for(const callback of [false,true]){const ctx=await run(command,callback);expect(ctx.runAction).not.toHaveBeenCalled();expect(ctx.runQuery).not.toHaveBeenCalled();}
  });
  it.each(["/help","/buy","/sell","/swap","/send","/burn","/withdraw","/buy invalid","/unknown"])("does not repeat buttons for %s",async command=>{
    await run(command);
    for(const call of vi.mocked(fetch).mock.calls) expect(JSON.parse(String(call[1]?.body))).not.toHaveProperty("reply_markup");
  });
  it("shows buttons after start",async()=>{
    await run("/start");
    expect(vi.mocked(fetch).mock.calls.some(call=>JSON.parse(String(call[1]?.body)).reply_markup?.inline_keyboard)).toBe(true);
  });
  it.each([false,true])("shows the current start menu after unlink (TG wallet=%s)",async hasTg=>{
    let revoked=false;
    const ctx={
      runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>{
        const name=getFunctionName(ref);
        if(name==="telegram:consumeRateLimit")return true;
        if(name==="telegram:unlinkUpdate"){revoked=true;return true;}
        return null;
      }),
      runQuery:vi.fn(async()=>({native:hasTg?{_id:"tg"}:null,link:revoked?null:{_id:"x"},selected:revoked?(hasTg?"tg":null):"x"})),
    };
    await (processUpdate as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<void>})._handler(ctx,{updateId:"unlink",updateJson:JSON.stringify({callback_query:{id:"cb",data:"/unlink",from:{id:1},message:{chat:{id:1,type:"private"}}}})});
    const messages=vi.mocked(fetch).mock.calls.map(c=>JSON.parse(String(c[1]?.body)));
    const reply=messages.find(m=>m.text?.includes("X unlinked"));
    const buttons=reply.reply_markup.inline_keyboard.flat().map((b:{text:string})=>b.text);
    expect(buttons).toContain("Link X");expect(buttons).not.toContain("Unlink X");
    if(hasTg){expect(buttons).toContain("Balances");expect(reply.text).toContain("Your Arc Chain wallet.");}
    else expect(buttons).toEqual(["Create TG Linked Wallet","Link X"]);
  });
  it("buttons show formats without executing or creating conversation state",async()=>{
    const ctx=await run("/buy",true);expect(ctx.runAction).not.toHaveBeenCalled();
    expect(ctx.runMutation.mock.calls.map(c=>getFunctionName(c[0]))).not.toContain("telegram:setConversation");
    expect(vi.mocked(fetch).mock.calls.some(c=>String(c[1]?.body).includes("/buy 10 USDC ARGOS"))).toBe(true);
  });
  it("executes a persisted switch even when Telegram rejects its callback acknowledgement",async()=>{
    vi.mocked(fetch).mockImplementation(async url=>new Response(JSON.stringify(String(url).endsWith("answerCallbackQuery")?{ok:false,description:"query is too old"}:{ok:true})));
    const ctx=await run("/usetg",true);
    expect(ctx.runMutation.mock.calls.map(c=>getFunctionName(c[0]))).toContain("telegramWallets:select");
  });
  it.each(["buy", "sell"])("keeps pending %s replies out of the final delivery queue",async kind=>{
    const ctx=await run(kind==="buy"?"/buy 10 USDC ARGOS":"/sell 100 ARGOS",false,{ok:false,pending:true,message:"Arc request recorded. Check wallet history."});
    expect(ctx.runMutation.mock.calls.map(c=>getFunctionName(c[0]))).not.toContain("telegramDeliveries:setText");
    expect(ctx.runAction.mock.calls.map(c=>getFunctionName(c[0]))).not.toContain("telegramDeliveries:deliver");
    const bodies=vi.mocked(fetch).mock.calls.map(c=>String(c[1]?.body)).join("\n");
    expect(bodies).toContain(kind==="buy"?"Buy processing.":"Sell processing.");
    expect(bodies).not.toContain("request recorded");
  });
  it("sends only a parsed Arc command through the authorized wallet path",async()=>{
    const ctx=await run("/buy 10 USDC ARGOS");
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
 expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({updateJson:JSON.stringify({update_id:42})}));
 expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
 }finally{vi.unstubAllEnvs();}
});

it.each(["0.001 ETH to ","$10 to "])("parses Base withdrawal %s",prefix=>{
 const command=telegramWalletCommand("withdraw",prefix+"0x1111111111111111111111111111111111111111");
 expect(command).toMatchObject({kind:"send",chainId:8453,unit:prefix.startsWith("$")?"usd":"eth"});
});
it.each(["all ETH to 0x1111111111111111111111111111111111111111","0 ETH to 0x1111111111111111111111111111111111111111","1 USDC to 0x1111111111111111111111111111111111111111","0.1 ETH to @alice"])("rejects unsafe withdrawal %s",args=>expect(telegramWalletCommand("withdraw",args)).toBeNull());

it("retains the Base chain at the structured command boundary",()=>{
 const command=telegramWalletCommand("withdraw","$10 to 0x1111111111111111111111111111111111111111");
 expect(validateStructuredWalletCommand(command)).toEqual(command);
 expect(validateStructuredWalletCommand({...command,token:"USDC"})).toBeNull();
 expect(validateStructuredWalletCommand({...command,chainId:1})).toBeNull();
});
