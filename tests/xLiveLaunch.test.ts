import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({llm:vi.fn()}));
vi.mock("../convex/llm",()=>({openRouter:m.llm,isStructuredOutputAvailabilityError:()=>false}));
import {parseXWalletIntent,requestedOperations,walletHelpMessage} from "../convex/xWalletIntent";
import {walletExtractionSchema,walletIntentSchema} from "../convex/xWalletAiSchemas";
import {launchInputFromXCommand} from "../lib/launches/x-input";
import {X_INTENT_CLASSIFIER_PROMPT} from "../lib/x-intent-prompt";
beforeEach(()=>{m.llm.mockReset();});
it("recognizes ODDY when its image is in a quoted post",async()=>{
 const text="Hey @TheArgosBot launch a token called Odysseus with a ticker of $ODDY Use the image below https://twitter.com/TheArgosBot/status/2100047587453624772";
 m.llm.mockResolvedValueOnce(JSON.stringify({kind:"command",operation:"launch"})).mockResolvedValueOnce(JSON.stringify({kind:"launch",name:"Odysseus",symbol:"ODDY"}));
 expect(await parseXWalletIntent(text,false)).toMatchObject({kind:"command",command:{kind:"launch",name:"Odysseus",symbol:"ODDY"}});
});
it("handles the exact ODDY attachment instruction without an initial buy",async()=>{
 const text="Hey @TheArgosBot launch a token called Odysseus with a ticker of $ODDY Use the image below";
 m.llm.mockResolvedValueOnce(JSON.stringify({kind:"command",operation:"launch"})).mockResolvedValueOnce(JSON.stringify({kind:"launch",name:"Odysseus",symbol:"ODDY"}));
 const intent=await parseXWalletIntent(text,true);
 expect(intent).toMatchObject({kind:"command",command:{kind:"launch",name:"Odysseus",symbol:"ODDY"}});
 if(intent.kind!=="command"||intent.command.kind!=="launch")throw Error();
 expect(launchInputFromXCommand(intent.command,text,"https://pbs.twimg.com/media/example.jpg")).toMatchObject({name:"Odysseus",symbol:"ODDY",devBuyUSDC:"0",pairToken:"USDC"});
});
it.each(["$20 usdc of it","20 USDC of it","$20 of it"])("recognizes a greeting and the new token's initial buy: %s",async amount=>{
 const text=`Hey @TheArgosBot launch a token called Odysseus with a ticker of $ODDY buy ${amount}`;
 m.llm.mockResolvedValueOnce(JSON.stringify({kind:"command",operation:"launch"})).mockResolvedValueOnce(JSON.stringify({kind:"launch",name:"Odysseus",symbol:"ODDY",devBuy:{amount:"20",unit:"usd"}}));
 expect(requestedOperations(text)).toEqual(["launch"]);
 const intent=await parseXWalletIntent(text,true);
 expect(intent).toMatchObject({kind:"command",command:{kind:"launch",name:"Odysseus",symbol:"ODDY",devBuy:{amount:"20",unit:"usd"}}});
});
it.each(["USDC","ARGUS","ARCASH"])("routes a complete %s X launch through the shared input",async pair=>{
 const text=`@TheArgosBot launch Example Token ticker EXAMPLE. Dev buy 25 USDC. Allocation: half creator, half dividends.${pair==="USDC"?"":` Pair with ${pair}.`}`;
 m.llm.mockResolvedValueOnce(JSON.stringify({kind:"command",operation:"launch"})).mockResolvedValueOnce(JSON.stringify({kind:"launch",name:"Example Token",symbol:"EXAMPLE",devBuy:{amount:"25",unit:"usd"},pairToken:pair}));
 expect(requestedOperations(text)).toEqual(["launch"]);
 const intent=await parseXWalletIntent(text,true);
 expect(intent).toMatchObject({kind:"command",command:{kind:"launch",name:"Example Token",symbol:"EXAMPLE"}});
 if(intent.kind!=="command"||intent.command.kind!=="launch")throw Error("Launch was not recognized");
 expect(launchInputFromXCommand(intent.command,text,"https://pbs.twimg.com/media/example.jpg")).toMatchObject({pairToken:pair,devBuyUSDC:"25",creatorBps:5000,dividendBps:5000,buyTaxBps:100,sellTaxBps:100});
});
it("includes launching in the X schema and gives a useful guide reply",()=>{
 expect(JSON.stringify(walletIntentSchema)).toContain('"launch"');
 expect(walletExtractionSchema("launch").schema).toBeDefined();
 expect(X_INTENT_CLASSIFIER_PROMPT).toContain('"operation":"launch"');
 expect(walletHelpMessage("launch")).toContain("https://www.argosbot.io/how-to-launch");
 expect(walletHelpMessage("launch")).not.toMatch(/Portal|UTF-8/);
});
it.each(["all to burn","half creator, half burn","spread evenly between creator, burn, dividends and liquidity"])("keeps reward allocation out of trade detection: %s",async allocation=>{
 const text=`@TheArgosBot launch Example Token ticker EXAMPLE dev buy 25 USDC allocation: ${allocation}`;
 m.llm.mockResolvedValueOnce(JSON.stringify({kind:"command",operation:"launch"})).mockResolvedValueOnce(JSON.stringify({kind:"launch",name:"Example Token",symbol:"EXAMPLE",devBuy:{amount:"25",unit:"usd"}}));
 expect(requestedOperations(text)).toEqual(["launch"]);
 expect(await parseXWalletIntent(text,true)).toMatchObject({kind:"command",command:{kind:"launch"}});
});
it("does not hide a separate trade after a reward allocation",()=>{
 expect(requestedOperations("launch Example ticker EX allocation: all creator; buy $10 of ARGOS")).toContain("buy");
});
it("treats a launch question as help, never an execution request",async()=>{
 expect(await parseXWalletIntent("@TheArgosBot how do I launch a token?",false)).toEqual({kind:"help",topic:"launch"});
 expect(m.llm).not.toHaveBeenCalled();
});
