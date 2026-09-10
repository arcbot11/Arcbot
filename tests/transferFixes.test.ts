import { describe,it,expect } from "vitest";
import { encodeFunctionData,encodeFunctionResult,encodeEventTopics,encodeAbiParameters,type Hex } from "viem";
import { transferAbi,tokenTransfer,verifyTransferReturn,verifyTransferDelivery } from "../lib/otc/token-delivery";
import { assertListingRetry,listingSubmission } from "../lib/otc/listing-submission";
import type { Listing } from "../lib/otc/model";
const token="0x1111111111111111111111111111111111111111",sender="0x2222222222222222222222222222222222222222",recipient="0x3333333333333333333333333333333333333333";
const log=(value=10n)=>({address:token,topics:encodeEventTopics({abi:transferAbi,eventName:"Transfer",args:{from:sender,to:recipient}}) as Hex[],data:encodeAbiParameters([{type:"uint256"}],[value])});
describe("token delivery evidence",()=>{
  it("rejects false and malformed return values; supports true and legacy empty returns",()=>{
    expect(()=>verifyTransferReturn(encodeFunctionResult({abi:transferAbi,functionName:"transfer",result:false}))).toThrow();
    expect(()=>verifyTransferReturn("0x01")).toThrow();
    expect(()=>verifyTransferReturn(encodeFunctionResult({abi:transferAbi,functionName:"transfer",result:true}))).not.toThrow();
    expect(()=>verifyTransferReturn("0x")).not.toThrow();
  });
  it("requires both exact events and recipient balance evidence",()=>{
    const proof={token,sender,recipient,amount:10n,before:5n,after:15n,logs:[log()]};
    expect(()=>verifyTransferDelivery(proof)).not.toThrow();
    expect(()=>verifyTransferDelivery({...proof,logs:[]})).toThrow();
    expect(()=>verifyTransferDelivery({...proof,after:5n})).toThrow();
    expect(()=>verifyTransferDelivery({...proof,logs:[log(9n)],after:14n})).toThrow();
    expect(()=>verifyTransferDelivery({...proof,logs:[{...log(),address:sender}]})).toThrow();
  });
  it("decodes only the authorized ERC20 transfer",()=>{
    expect(tokenTransfer(encodeFunctionData({abi:transferAbi,functionName:"transfer",args:[recipient,10n]}))).toEqual({recipient,amount:10n});
    expect(tokenTransfer("0x")).toBeNull();
    expect(()=>tokenTransfer("0x12345678")).toThrow();
  });
});
describe("immutable listing retries",()=>{
  const listing={seller:sender,originalAmount:"100000000",available:"40000000",held:"0",premiumBps:250} as unknown as Listing;
  it("matches original terms even after partial fills",()=>{expect(()=>assertListingRetry(listing,"100","2.5",sender)).not.toThrow();});
  it("rejects changed amount, premium, wallet and unverifiable older entries",()=>{
    expect(()=>assertListingRetry(listing,"10","2.5",sender)).toThrow();
    expect(()=>assertListingRetry(listing,"100","0",sender)).toThrow();
    expect(()=>assertListingRetry(listing,"100","2.5",recipient)).toThrow();
    expect(()=>assertListingRetry({...listing,originalAmount:undefined},"100","2.5",sender)).toThrow();
  });
  it("serializes complete original submission for retry",()=>{
    const original=listingSubmission("unique-request","100","2.5","100000");
    expect(JSON.parse(JSON.stringify(original))).toEqual({action:"list",requestId:"unique-request",amount:"100",premium:"2.5",maxGasReserveWei:"100000"});
  });
});
