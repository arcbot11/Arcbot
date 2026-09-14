import {describe,it,expect} from "vitest";
import {parseWalletCommand} from "../convex/walletCommands";
import {completeXCommand} from "../lib/x-command-language";
import {xCommandReply} from "../lib/x-command-workflows";
import {telegramWalletCommand} from "../lib/telegram-commands";
describe("paired commands preserve denominations",()=>{
 it.each(["buy 100 ARGUS of BABYARGUS","buy 100 $ARGUS of $BABYARGUS"])("parses an explicit quote amount: %s",text=>{expect(completeXCommand(text)).toBe(true);expect(parseWalletCommand(text)).toMatchObject({kind:"buy",amount:"100",unit:"pair",pairAsset:"ARGUS",token:"BABYARGUS"});});
 it("keeps dollars as an automatic funding budget",()=>expect(parseWalletCommand("buy $20 of BABYARGUS")).toMatchObject({kind:"buy",unit:"usd",amount:"20",token:"BABYARGUS"}));
 it("preserves an explicit USDC input",()=>expect(parseWalletCommand("buy 20 USDC of BABYARGUS")).toMatchObject({kind:"buy",unit:"pair",pairAsset:"USDC",amount:"20"}));
 it("does not treat a bare token quantity as a complete quote-funded buy",()=>expect(completeXCommand("buy 100 ARGUS")).toBe(false));
 it("uses the same explicit denominations on Telegram",()=>{expect(telegramWalletCommand("buy","100 ARGUS of BABYARGUS")).toMatchObject({unit:"pair",pairAsset:"ARGUS",token:"BABYARGUS",amount:"100"});expect(telegramWalletCommand("buy","10 USDC ARGOS")).toMatchObject({unit:"pair",pairAsset:"USDC",token:"ARGOS"});expect(telegramWalletCommand("buy","$10 BABYARGUS")).toMatchObject({unit:"usd",amount:"10"});});
 it("prints actual ARGUS spending in an X confirmation",()=>{const url=`https://www.arcexplorer.org/tx/0x${'1'.repeat(64)}`;expect(xCommandReply(`Buy confirmed. Input: 100 ARGUS. Received: 14,500 BABYARGUS. Route: V4. Transaction: ${url}`)).toBe(`Bought 14,500 BABYARGUS for 100 ARGUS.\n\nTransaction: ${url}`);});
});
