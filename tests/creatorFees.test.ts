import {expect,it,vi} from "vitest";
import {encodeAbiParameters,encodeFunctionData,encodeFunctionResult,encodeEventTopics,parseAbiParameters,zeroAddress,type Address,type Hex} from "viem";
import {assertClaimCall,claimedAmounts,feeAbi,verifyCreatorToken} from "../lib/launches/fees";
import {quotedLaunchAbi} from "../lib/arc/argus-discovery";
import {PORTAL6,PORTAL7} from "../lib/launches/contracts";
import type {ArcRpc} from "../lib/arc/rpc";
import {telegramMenu,telegramWalletCommand} from "../lib/telegram-commands";
import {parseXWalletIntent} from "../convex/xWalletIntent";
import {prepareTransaction,settled} from "../lib/otc/transactions";
import {type Store,type RecordValue,type Transaction,type Wallet,walletId} from "../lib/otc/model";
const wallet="0x1111111111111111111111111111111111111111",token="0x2222222222222222222222222222222222222222",splitter="0x3333333333333333333333333333333333333333",quote="0x3600000000000000000000000000000000000000";
function fixture(portal:Address=PORTAL6,creator:Address=wallet){
  const implementation=portal===PORTAL6?"6c8f50b8895d5a22c97e611b8f9678a09d045b16":"d9578dd861b2fe59675c2c4b09b026fcb0df37fc";
  const code=vi.fn(async()=>`0x363d3d373d3d3d363d73${implementation}5af43d82803e903d91602b57fd5bf3`);
  const rpc={code,call:vi.fn(async(call:{to:Address;data:Hex})=>{
    if(call.to===PORTAL6||call.to===PORTAL7)return encodeFunctionResult({abi:quotedLaunchAbi,functionName:"launches",result:[call.to===portal?creator:zeroAddress,0,true,wallet,token,splitter,100,100,1n,0,quote]});
    for(const [functionName,result] of [["creator",creator],["token",token],["quoteAsset",quote]] as const)if(call.data===encodeFunctionData({abi:feeAbi,functionName}))return encodeFunctionResult({abi:feeAbi,functionName,result});
    throw Error("Unexpected call");
  })} as unknown as ArcRpc;
  return {rpc,code};
}
it.each([PORTAL6,PORTAL7])("verifies the creator and recorded splitter for %s",async portal=>{const f=fixture(portal);await expect(verifyCreatorToken(wallet,token,f.rpc,1n)).resolves.toMatchObject({portal,splitter,quote,token});});
it("rejects another creator",async()=>{await expect(verifyCreatorToken(wallet,token,fixture(PORTAL6,token).rpc,1n)).rejects.toThrow("not the token creator");});
it("rejects unreviewed clone code",async()=>{const f=fixture();f.code.mockResolvedValue("0x00");await expect(verifyCreatorToken(wallet,token,f.rpc,1n)).rejects.toThrow("reviewed adapter");});
it("pins the recipient and prohibits native value",()=>{
  const data=encodeFunctionData({abi:feeAbi,functionName:"claim",args:[wallet]});
  expect(()=>assertClaimCall(wallet,splitter,{to:splitter,data,value:0n})).not.toThrow();
  expect(()=>assertClaimCall(wallet,splitter,{to:splitter,data,value:1n})).toThrow();
  expect(()=>assertClaimCall(token,splitter,{to:splitter,data})).toThrow();
  expect(()=>assertClaimCall(wallet,splitter,{to:token,data})).toThrow();
});
it("uses only the recorded splitter's claim events and correct recipient",()=>{
  const log={address:splitter as Address,blockHash:null,blockNumber:null,logIndex:null,transactionHash:null,transactionIndex:null,removed:false,topics:encodeEventTopics({abi:feeAbi,eventName:"Claimed",args:{to:wallet,currency:quote}}) as [Hex,...Hex[]],data:encodeAbiParameters(parseAbiParameters("uint256"),[123n])};
  expect(claimedAmounts(wallet,splitter,[log])).toEqual([{token:quote,raw:"123"}]);
  expect(claimedAmounts(wallet,splitter,[{...log,address:token}])).toEqual([]);
  expect(()=>claimedAmounts(token,splitter,[log])).toThrow("recipient mismatch");
});
it("hides the Telegram claim control until creator eligibility is verified",()=>{
  const state={native:{},link:null,selected:"tg"};
  expect(JSON.stringify(telegramMenu(state,true,false))).not.toContain("/claim");
  expect(JSON.stringify(telegramMenu(state,false,true))).toContain("/claim");
  expect(telegramWalletCommand("claim","ARGOS")).toEqual({kind:"claim_fees",token:"ARGOS"});
  expect(telegramWalletCommand("claim",`ARGOS to ${wallet}`)).toBeNull();
});
it("accepts an explicit X fee claim without activating launch workflows",async()=>{
  await expect(parseXWalletIntent("@TheArgosBot claim fees for ARGOS",false)).resolves.toMatchObject({kind:"command",command:{kind:"claim_fees",token:"ARGOS"}});
});
it("claim completion releases its own gas hold and preserves other reservations",async()=>{
  const rows=new Map<string,RecordValue>();
  const store:Store={get:async<T extends RecordValue>(id:string):Promise<T|null>=>(rows.get(id) as T|undefined)??null,put:async row=>{rows.set(row.id,row);}};
  const w:Wallet={kind:"wallet",id:walletId(5042,wallet),chainId:5042,owner:"u",address:wallet,holds:{other:"10"},lastSettledBlock:"0",updatedAt:0};rows.set(w.id,w);
  const tx=await prepareTransaction(store,{id:"claim:test",owner:"u",wallet,chainId:5042,leg:"claim",creatorClaim:{token,splitter},unsigned:"0x",reserveWei:"20",balanceWei:"100",block:"1"},1);
  tx.raw="0x";tx.hash="0x123";tx.status="submitted";rows.set(tx.id,tx);
  await settled(store,tx.id,"2",true,3,{gasWei:"5",claims:[{token:quote,raw:"123"}]});
  expect((rows.get(w.id) as Wallet).holds).toEqual({other:"10"});
  expect((rows.get(w.id) as Wallet).activeTx).toBeUndefined();
  expect((rows.get(tx.id) as Transaction).settlement?.claims).toHaveLength(1);
});
