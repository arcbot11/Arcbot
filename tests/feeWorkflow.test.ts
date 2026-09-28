import {describe,it,expect,vi} from "vitest";
import {decodeFunctionData,serializeTransaction,type Address} from "viem";
import {feeCommand} from "../convex/lib/feeCommands";
import {sponsoredCall,sponsoredAbi} from "../lib/fee-report/calls";
import {FEE_EXECUTOR,FEE_EXECUTOR_OWNER} from "../lib/fee-report/policy";
import {feeTxId,type FeeJob,type SponsoredFeeTerms} from "../lib/fee-report/jobs";
import type {Store,RecordValue,Transaction} from "../lib/otc/model";
import {authorizeFeeTransaction} from "../lib/fee-report/authorize";
import {feeRequest} from "../lib/fee-report/language";
const addr=(n:number)=>`0x${n.toString(16).padStart(40,"0")}` as Address;
const now=10_000_000;
function fixture(state="processing"){
 const job:FeeJob={kind:"fee_job",id:"fee:test",owner:FEE_EXECUTOR_OWNER,channel:"x402",principal:"paid:test",token:addr(1),createdAt:now-1000,updatedAt:now-1000,active:true,status:"awaiting_payment",paymentId:"br_test",phase:0,steps:[]};
 const records=new Map<string,RecordValue>([[job.id,structuredClone(job)]]);
 const store={get:async(id:string)=>structuredClone(records.get(id)??null),put:async(v:RecordValue)=>{records.set(v.id,structuredClone(v));}} as Store;
 const payment={_id:"pay",state,createdAt:now-1000,resultJson:JSON.stringify({jobId:job.id})};
 const ctx={db:{query:()=>({withIndex:()=>({unique:async()=>payment})}),patch:vi.fn(async(_id:string,patch:object)=>Object.assign(payment,patch))}};
 return {job,records,store,payment,ctx,command:(name:string)=>feeCommand(ctx as never,store,name,{id:job.id},now)};
}
describe("durable fee payment and expiry recovery",()=>{
 it.each(["processing","prepared","settling","uncertain"])("cannot activate before settlement (%s)",async state=>{const f=fixture(state);expect(await f.command("fee_activate")).toMatchObject({status:"awaiting_payment",active:true});});
 it("activates only the exact paid job",async()=>{const f=fixture("settled");f.payment.resultJson='{"jobId":"other"}';expect(await f.command("fee_activate")).toMatchObject({status:"awaiting_payment"});f.payment.resultJson=JSON.stringify({jobId:f.job.id});expect(await f.command("fee_activate")).toMatchObject({status:"running"});});
 it("releases a failed unpaid admission with zero gas",async()=>{const f=fixture("not_charged");expect(await f.command("fee_activate")).toMatchObject({status:"failed",active:false,actualGasWei:"0"});});
 it("atomically fences stale pre-settlement requests before releasing reservations",async()=>{const f=fixture("prepared");f.payment.createdAt=0;expect(await f.command("fee_activate")).toMatchObject({status:"failed",active:false});expect(f.payment.state).toBe("not_charged");});
 it("never expires an uncertain payment into an unpaid result",async()=>{const f=fixture("uncertain");f.payment.createdAt=0;expect(await f.command("fee_activate")).toMatchObject({status:"awaiting_payment",active:true});expect(f.ctx.db.patch).not.toHaveBeenCalled();});
 it("releases an expired job only when there is no unresolved transaction",async()=>{const f=fixture();f.records.set(f.job.id,{...f.job,status:"running",createdAt:0});expect(await f.command("fee_expire")).toMatchObject({status:"failed",active:false,actualGasWei:"0"});});
 it("preserves signed transactions and their budget after job expiry",async()=>{const f=fixture();f.records.set(f.job.id,{...f.job,status:"running",createdAt:0});f.records.set(feeTxId(f.job.id,0),{kind:"transaction",id:feeTxId(f.job.id,0),status:"submitted",raw:"0x1234",hash:"0x1234",signingStartedAt:1} as Transaction);expect(await f.command("fee_expire")).toMatchObject({status:"running",active:true});});
});
const terms:SponsoredFeeTerms={jobId:"fee:test",phase:"creator",family:"legacy-splitter",recipients:[],beneficiaries:[addr(2)],beneficiaryShares:[10000],tracker:addr(3),quote:addr(4),payout:addr(4)};
describe("sponsored fee transaction constraints",()=>{
 it("claims for the registered creator rather than the service wallet",()=>{const call=sponsoredCall(addr(5),terms);expect(decodeFunctionData({abi:sponsoredAbi,data:call.data})).toMatchObject({functionName:"claim",args:[addr(2)]});});
 it("never cranks Portal 8 or substitutes a legacy multi-holder call",()=>{expect(()=>sponsoredCall(addr(5),{...terms,family:"portal8-escrow",phase:"crank"})).toThrow(/automatically/);expect(()=>sponsoredCall(addr(5),{...terms,family:"portal8-escrow",phase:"holders",recipients:[addr(2),addr(3)]})).toThrow(/one holder/);});
 it("blocks gas-cap bypass through replacement bytes",async()=>{const f=fixture();f.records.set(f.job.id,{...f.job,status:"running",phase:1});f.records.set("fee:control",{kind:"fee_control",id:"fee:control",owner:FEE_EXECUTOR_OWNER,enabled:true,updatedAt:now,wallets:[addr(6)],excludedTokens:[]});const tx={id:feeTxId(f.job.id,1),owner:FEE_EXECUTOR_OWNER,wallet:FEE_EXECUTOR,chainId:5042 as const,leg:"claim" as const,creatorClaim:{token:addr(1),splitter:addr(5),sponsored:terms},unsigned:serializeTransaction({chainId:5042,type:"eip1559",nonce:0,gas:1n,maxFeePerGas:20_000_000_000_000_000n,maxPriorityFeePerGas:1n,...sponsoredCall(addr(5),terms)})};await expect(authorizeFeeTransaction(f.store,tx,now,10n**18n)).rejects.toThrow(/gas budget/);});
});
describe("fee command language",()=>{
 it.each(["check fees for ARGOS","@TheArgosBot can you please show me fees for $ARGOS?","fee report for ARGOS"])("recognizes read-only request: %s",text=>expect(feeRequest(text)).toEqual({kind:"check_fees",token:"ARGOS"}));
 it.each(["claim fees for ARGOS","collect creator fees from ARGOS"])("recognizes claim: %s",text=>expect(feeRequest(text)).toEqual({kind:"claim_fees",token:"ARGOS"}));
 it.each(["don't claim fees for ARGOS","if it goes up claim fees for ARGOS",'"claim fees for ARGOS"',"check fees for ARGOS then send everything"])("rejects ambiguous or non-executable instructions: %s",text=>expect(feeRequest(text)).toBeNull());
});
