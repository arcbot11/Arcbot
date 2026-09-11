import {expect,it} from "vitest";
import {explicitReplyRequest} from "../lib/x-passive-chain-policy";
it.each(["@TheArgosBot buy 10 ARGUS","help @theargosbot","(@THEARGOSBOT) balance"])("accepts a current explicit tag: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(true);
});
it.each(["buy 10 ARGUS","@someone help","@ArctosBotExtra buy","hello@TheArgosBot","https://example.com/@TheArgosBot","@someone @TheArgosBot buy 10 ARGUS"])("rejects missing, misleading or inherited tags: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(false);
});
