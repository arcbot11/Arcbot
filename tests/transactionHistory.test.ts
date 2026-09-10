import {expect,it} from "vitest";
import {encodeFunctionData,parseAbi,serializeTransaction,zeroAddress,type Hex} from "viem";
import {transactionHistory} from "../lib/otc/transaction-history";
import {encodeArcSwap,type Route} from "../lib/arc/routing";
import type {Transaction} from "../lib/otc/model";
const recipient="0x1111111111111111111111111111111111111111";
const usdc="0x3600000000000000000000000000000000000000";
const argus="0xece5ca8bf9220718e5727754026757512212cb3c";
function record(call:{to:Hex;value:bigint;data:Hex},leg:Transaction["leg"]="send"):Transaction{
  return {kind:"transaction",id:"test",owner:"owner",wallet:recipient,chainId:5042,leg,holdId:"test",status:"completed",createdAt:1,updatedAt:1,unsigned:serializeTransaction({type:"eip1559",chainId:5042,nonce:0,gas:100000n,maxFeePerGas:1n,maxPriorityFeePerGas:0n,...call}),raw:"private signed bytes"};
}
it("shows ERC20 sends with the correct decimals and recipient without exposing signed bytes",()=>{
  const tx=record({to:usdc,value:0n,data:encodeFunctionData({abi:parseAbi(["function transfer(address,uint256)"]),functionName:"transfer",args:[recipient,2000000n]})});
  const result=transactionHistory(tx);
  expect(result.details).toEqual([{label:"Amount",value:"2 USDC"},{label:"To",value:recipient}]);
  expect(result).not.toHaveProperty("raw");expect(result).not.toHaveProperty("unsigned");
});
it("shows native Arc USDC in 18 decimals",()=>{
  expect(transactionHistory(record({to:recipient,value:10n**18n,data:"0x"})).details[0].value).toBe("1 USDC");
});
it.each(["v3","v4"] as const)("shows %s swap input and minimum, not an invented receipt amount",protocol=>{
  const route:Route={tokenIn:usdc,tokenOut:argus,pools:[protocol==="v3"?{protocol,address:recipient,currency0:usdc,currency1:argus,fee:10000}:{protocol,currency0:usdc,currency1:argus,fee:10000,tickSpacing:200,hooks:zeroAddress}]};
  const result=transactionHistory(record(encodeArcSwap(route,10000000n,9000n*10n**18n,9999999999n),"swap"));
  expect(result.details).toContainEqual({label:"Input",value:"10 USDC"});
  expect(result.details).toContainEqual({label:"Minimum output",value:"9000 ARGUS"});
});
it("keeps older malformed records visible",()=>{
  const tx=record({to:recipient,value:0n,data:"0x"});tx.unsigned="invalid";
  expect(transactionHistory(tx)).toMatchObject({status:"completed",details:[]});
});
