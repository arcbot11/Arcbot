import {expect,it} from "vitest";
import {explicitReplyRequest} from "../lib/x-passive-chain-policy";
it.each(["@ArcChainBot buy 10 ARGUS","help @arcchainbot","(@ARCCHAINBOT) balance"])("accepts a current explicit tag: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(true);
});
it.each(["buy 10 ARGUS","@someone help","@ArcChainBotExtra buy","hello@ArcChainBot","https://example.com/@ArcChainBot","@someone @ArcChainBot buy 10 ARGUS"])("rejects missing, misleading or inherited tags: %s",text=>{
  expect(explicitReplyRequest(text,"bot-parent")).toBe(false);
});
