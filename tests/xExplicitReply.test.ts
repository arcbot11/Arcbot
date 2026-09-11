import {expect,it} from "vitest";
import {explicitReplyRequest} from "../lib/x-passive-chain-policy";
import {isXBotAuthor} from "../lib/x-bot-identity";
it.each(["theargosbot","TheArgosBot","THEARGOSBOT"])("accepts the developer's wallet request with casing %s",handle=>{
  expect(isXBotAuthor("2097782568934371330","@0xTheOdysseus")).toBe(false);
  expect(explicitReplyRequest(`@${handle} show me my wallet`)).toBe(true);
  expect(explicitReplyRequest(`@${handle} show me my wallet`,"parent")).toBe(true);
  expect(isXBotAuthor("2097696306135220226","TheArgosBot")).toBe(true);
});
it.each(["@TheArgosBot buy 10 ARGUS","help @theargosbot","(@THEARGOSBOT) balance"])("accepts a current explicit tag: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(true);
});
it.each(["buy 10 ARGUS","@someone help","@ArctosBotExtra buy","hello@TheArgosBot","https://example.com/@TheArgosBot","@someone @TheArgosBot buy 10 ARGUS"])("rejects missing, misleading or inherited tags: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(false);
});
