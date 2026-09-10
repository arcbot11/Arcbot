import {expect,it} from "vitest";
import {explicitReplyRequest} from "../lib/x-passive-chain-policy";
it.each(["@ArctosBot buy 10 ARGUS","help @arctosbot","(@ARCTOSBOT) balance"])("accepts a current explicit tag: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(true);
});
it.each(["buy 10 ARGUS","@someone help","@ArctosBotExtra buy","hello@ArctosBot","https://example.com/@ArctosBot","@someone @ArctosBot buy 10 ARGUS"])("rejects missing, misleading or inherited tags: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(false);
});
