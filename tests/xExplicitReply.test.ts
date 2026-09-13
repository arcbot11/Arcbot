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
it.each([
  "@ARCIndex10 @TheArgosBot buy $10 of $ARCX10",
  "@alice @bob @THEARGOSBOT please purchase 10 USDC of ARGOS",
  "@TheArgosBot @alice sell 50% ARGOS",
  "@alice @TheArgosBot swap $10 of ARGOS for ARCX10",
  "@alice @TheArgosBot send 10 USDC to @bob",
  "@alice @TheArgosBot burn all ARGOS",
  "@alice @TheArgosBot show me my wallet",
])("admits complete current-post commands despite other leading participants: %s",text=>{
  expect(explicitReplyRequest(text,"parent")).toBe(true);
});
it.each([
  "@alice @TheArgosBot don't buy $10 of ARGOS",
  "@alice @TheArgosBot if it drops buy $10 of ARGOS",
  '@alice @TheArgosBot example: "buy $10 of ARGOS"',
  "@alice @TheArgosBot I bought $10 of ARGOS",
  "@alice @TheArgosBot how do I buy $10 of ARGOS?",
  "@alice buy $10 of ARGOS",
])("does not treat narration, conditions, examples or missing bot tags as commands: %s",text=>{
  expect(explicitReplyRequest(text,"parent")).toBe(false);
});
