import {expect,it,vi,beforeEach} from "vitest";
vi.mock("../convex/llm",()=>({openRouter:vi.fn(async()=>'{"kind":"irrelevant"}'),isStructuredOutputAvailabilityError:()=>false}));
import {parseXWalletIntent} from "../convex/xWalletIntent";
import {openRouter} from "../convex/llm";
beforeEach(()=>vi.clearAllMocks());
it.each([
 ["could you please buy ARGOS with 25 USDC?",{kind:"buy",amount:"25",unit:"usd",token:"ARGOS"}],
 ["hey, buy ARGOS for $25",{kind:"buy",amount:"25",unit:"usd",token:"ARGOS"}],
 ["please purchase $25 of ARGOS",{kind:"buy",amount:"25",unit:"usd",token:"ARGOS"}],
 ["sell a quarter of my ARGOS",{kind:"sell",amount:"25",unit:"percent",token:"ARGOS"}],
 ["could you sell half my ARGOS",{kind:"sell",amount:"50",unit:"percent",token:"ARGOS"}],
 ["sell three quarters of my ARGOS",{kind:"sell",amount:"75",unit:"percent",token:"ARGOS"}],
 ["convert 50 ARGOS into USDC",{kind:"swap_token_for_token",amount:"50",unit:"token",fromToken:"ARGOS",toToken:"USDC"}],
 ["exchange $25 of ARGOS for OTHER",{kind:"swap_token_for_token",amount:"25",unit:"usd",fromToken:"ARGOS",toToken:"OTHER"}],
 ["please transfer 10 USDC to @alice",{kind:"send",amount:"10",unit:"usd",recipient:"@alice"}],
 ["burn half my ARGOS",{kind:"burn",amount:"50",unit:"percent",token:"ARGOS"}],
 ["buy $10 of ARGOS and send it to @alice",{kind:"buy_and_send",amount:"10",unit:"usd",token:"ARGOS",recipient:"@alice"}],
 ["buy $10 of ARGOS and burn it",{kind:"buy_and_burn",amount:"10",unit:"usd",token:"ARGOS"}],
])("accepts explicit natural wording: %s",async(text,command)=>{
 expect(await parseXWalletIntent(`@TheArgosBot ${text}`,false)).toMatchObject({kind:"command",command});
 expect(openRouter).not.toHaveBeenCalled();
});
it.each([
 "don't buy ARGOS for $25","don't swap 10 ARGOS into USDC","for example buy $10 of ARGOS",
 "if ARGOS drops, buy $10 of ARGOS","how to buy $10 of ARGOS","can you translate this: buy $10 of ARGOS",
 "buy $10 of ARGOS and sell 20 OTHER","launch ARGOS and buy $10","claim my fees",
 "why did you buy $10 of ARGOS?","buy $10 of ARGOS if it drops","buy $10 of ARGOS or OTHER",
 "I already told someone to buy $10 of ARGOS","buy $10 of ARGOS, not $20",
])("does not execute non-authority or unsupported wording: %s",async text=>{
 expect((await parseXWalletIntent(`@TheArgosBot ${text}`,false)).kind).not.toBe("command");
});
