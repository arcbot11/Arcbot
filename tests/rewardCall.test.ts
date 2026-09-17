import { expect, it } from "vitest";
import { assertRewardCall, rewardCall, type RewardTerms } from "../lib/launches/reward-call";
const splitter="0x1111111111111111111111111111111111111111";
const tracker="0x2222222222222222222222222222222222222222";
const recipient="0x3333333333333333333333333333333333333333";
it.each<RewardTerms>([{action:"distribute",tracker},{action:"holders",tracker,recipients:[recipient]}])("rejects changed destination, value and calldata for $action",terms=>{
  const call=rewardCall(splitter,terms);
  expect(()=>assertRewardCall(splitter,terms,call)).not.toThrow();
  expect(()=>assertRewardCall(splitter,terms,{...call,to:recipient})).toThrow();
  expect(()=>assertRewardCall(splitter,terms,{...call,value:1n})).toThrow();
  expect(()=>assertRewardCall(splitter,terms,{...call,data:"0x"})).toThrow();
});
it("rejects duplicate, empty and oversized holder batches",()=>{
  for(const recipients of [[],[recipient,recipient],Array(51).fill(recipient)])
    expect(()=>rewardCall(splitter,{action:"holders",tracker,recipients})).toThrow();
});
it("does not allow recipients to be attached to splitter distribution",()=>{
  expect(()=>rewardCall(splitter,{action:"distribute",tracker,recipients:[recipient]})).toThrow();
});
