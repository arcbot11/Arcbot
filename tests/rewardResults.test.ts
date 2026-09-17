import {expect,it} from "vitest";
import {encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiParameters,type Log} from "viem";
import {rewardEvents,rewardResultLines} from "../lib/launches/reward-results";
const splitter="0x1111111111111111111111111111111111111111",tracker="0x2222222222222222222222222222222222222222",creator="0x3333333333333333333333333333333333333333",token="0x4444444444444444444444444444444444444444",quote="0x3600000000000000000000000000000000000000";
const context={splitter,tracker,creator,token,quote,payout:quote,assets:{[quote]:{symbol:"USDC",decimals:6},[token]:{symbol:"TEST",decimals:18}}};
const logFields={blockHash:null,blockNumber:null,logIndex:null,transactionHash:null,transactionIndex:null,removed:false};
const accrued={...logFields,address:splitter,topics:encodeEventTopics({abi:rewardEvents,eventName:"Accrued",args:{to:creator,currency:quote}}),data:encodeAbiParameters(parseAbiParameters("uint256"),[12000000n])} as Log;
it("reports creator credits rather than claiming a payment occurred",()=>{expect(rewardResultLines([accrued],context)).toEqual(["Added to claimable creator fees: 12 USDC"]);});
it("ignores matching events from unrelated contracts",()=>{expect(rewardResultLines([{...accrued,address:token}],context)[0]).toContain("No creator allocations");});
it("separates holder payment events from splitter payment events",()=>{
 const abi=parseAbi(["event Paid(address indexed user,address indexed destination,uint256 amount)"]);
 const log={...logFields,address:tracker,topics:encodeEventTopics({abi,eventName:"Paid",args:{user:creator,destination:creator}}),data:encodeAbiParameters(parseAbiParameters("uint256"),[2500000n])} as Log;
 expect(rewardResultLines([log,log],context)).toEqual(["Paid to holders: 5 USDC","Holders paid: 1"]);
});
it("does not report a failed burn as burned",()=>{
 const log={...logFields,address:splitter,topics:encodeEventTopics({abi:rewardEvents,eventName:"BurnFailed"}),data:encodeAbiParameters(parseAbiParameters("uint256"),[1000000000000000000n])} as Log;
 expect(rewardResultLines([log],context)).toEqual(["Burn deferred: 1 TEST"]);
});

it("omits treasury payments while retaining the burn",()=>{
 const treasury="0x5555555555555555555555555555555555555555";
 const paid={...logFields,address:splitter,topics:encodeEventTopics({abi:rewardEvents,eventName:"Paid",args:{to:treasury,currency:quote}}),data:encodeAbiParameters(parseAbiParameters("uint256"),[1000000n])} as Log;
 const burn={...logFields,address:splitter,topics:encodeEventTopics({abi:rewardEvents,eventName:"Burned"}),data:encodeAbiParameters(parseAbiParameters("uint256"),[1000000000000000000n])} as Log;
 expect(rewardResultLines([paid,burn],{...context,treasury})).toEqual(["Burned: 1 TEST"]);
});
