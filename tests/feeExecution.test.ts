import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {emptyReport,feeReportInput} from "../lib/fee-report/model";
import {FEE_EXECUTOR_OWNER,FEE_EXECUTOR} from "../lib/fee-report/policy";
import {feeTxId,type FeeJob} from "../lib/fee-report/jobs";
import {serializeTransaction} from "viem";
import {sponsoredCall} from "../lib/fee-report/calls";
import type {SponsoredFeeTerms} from "../lib/fee-report/jobs";
import type {Transaction} from "../lib/otc/model";
const m=vi.hoisted(()=>({report:vi.fn(),read:vi.fn(),command:vi.fn(),prepare:vi.fn(),advance:vi.fn(),guard:vi.fn(),owed:vi.fn()}));
vi.mock("../lib/fee-report/read",()=>({readFeeReport:m.report}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command})}));
vi.mock("../lib/otc/runtime",()=>({chainClient:()=>({readContract:m.owed}),prepareCall:m.prepare,advanceTransaction:m.advance}));
vi.mock("../lib/fee-report/personal-crank-guard.mjs",()=>({assertCrankAllowed:m.guard}));
import {runFeeJob,verifySponsoredFee} from "../lib/fee-report/execution";
const token="0x1111111111111111111111111111111111111111",splitter="0x2222222222222222222222222222222222222222",holder="0x3333333333333333333333333333333333333333";
let job:FeeJob;let rows:Map<string,any>;
beforeEach(()=>{
 vi.clearAllMocks();
 job={kind:"fee_job",id:"fee:test",owner:FEE_EXECUTOR_OWNER,channel:"x",principal:"social:123",token,createdAt:Date.now(),updatedAt:Date.now(),active:true,status:"running",phase:0,steps:[]};
 rows=new Map<string,any>([[job.id,job],["fee:control",{enabled:true,wallets:[holder],excludedTokens:[]}]]);
 m.read.mockImplementation(async({id})=>rows.get(id)??null);
 const r=emptyReport(feeReportInput.parse({token}));
 m.report.mockResolvedValue({...r,status:"partial",family:"legacy-splitter",contracts:{portal:splitter,splitter,tracker:holder},assets:{token:{address:token,decimals:18},quote:{address:splitter,decimals:6},payout:{address:splitter,decimals:6}},beneficiaries:[{address:holder,shareBps:10000}],signals:{unprocessedFees:true,creatorFeesOwed:true}});
 m.guard.mockResolvedValue(undefined);m.owed.mockResolvedValue(1n);
 m.prepare.mockResolvedValue({unsigned:"0x",reserveWei:"1",snapshot:{balanceWei:"100",block:"1"}});
 m.advance.mockImplementation(async id=>{const tx=rows.get(id);tx.status="completed";return tx;});
 m.command.mockImplementation(async(command,input)=>{
   if(command==="holder_cursor")return {offset:0,revision:4};
   if(command==="prepare"||command==="holder_prepare") {const t=command==="prepare"?input:input.transaction;const tx={...t,status:"prepared"};rows.set(t.id,tx);return tx;}
   if(command==="cancel_unsigned_trade"){const tx=rows.get(input.id);tx.status="cancelled";return tx;}
   if(command==="fee_advance"){const tx=rows.get(feeTxId(job.id,job.phase));job.steps.push({phase:["crank","creator","holders"][job.phase],...(input.skipped?{skipped:input.skipped}:{txId:feeTxId(job.id,job.phase)})} as never);if(tx&&tx.status!=="completed")job.status="failed";job.phase++;if(job.phase===3&&job.status==="running"){job.status="completed";job.active=false;}return job;}
   throw Error("Unexpected command "+command);
 });
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({items:[{address:holder}],nextOffset:50})})));
});
afterEach(()=>vi.unstubAllGlobals());
it("uses only the service wallet and prepares holder payout atomically with its cursor",async()=>{
 expect(await runFeeJob(job.id)).toMatchObject({status:"completed"});
 const prepared=m.command.mock.calls.filter(([c])=>["prepare","holder_prepare"].includes(c));
 expect(prepared).toHaveLength(3);
 for(const [c,v] of prepared)expect(c==="prepare"?v:v.transaction).toMatchObject({wallet:FEE_EXECUTOR,owner:FEE_EXECUTOR_OWNER});
 expect(prepared[2]).toMatchObject(["holder_prepare",{revision:4,nextOffset:50}]);
 expect(m.command.mock.calls.filter(([c])=>c==="holder_cursor")).toHaveLength(2);
});
it("skips a policy-blocked crank but still claims already-owed creator fees",async()=>{
 m.guard.mockRejectedValue(Error("Crank blocked: a personal wallet currently holds this token."));
 const result=await runFeeJob(job.id);expect(result.status).toBe("completed");
 expect(job.steps[0].skipped).toMatch(/operator holdings/);expect(job.steps[1].txId).toBe(feeTxId(job.id,1));
 expect(m.prepare).toHaveBeenCalledTimes(2);expect(result.message).toMatch(/Crank skipped/);
});
it("does not treat an unknown holdings read failure as a policy exclusion",async()=>{
 m.guard.mockRejectedValue(Error("RPC unavailable"));await expect(runFeeJob(job.id)).rejects.toThrow("RPC unavailable");expect(m.prepare).not.toHaveBeenCalled();
});
it("resumes a pending transaction without preparing another one or advancing the cursor",async()=>{
 rows.set(feeTxId(job.id,0),{id:feeTxId(job.id,0),status:"submitted"});m.advance.mockImplementation(async id=>rows.get(id));
 expect(await runFeeJob(job.id)).toMatchObject({pending:true});expect(m.prepare).not.toHaveBeenCalled();expect(job.phase).toBe(0);
});
it("skips Portal 8 crank and resumes after the one paid holder instead of skipping its page",async()=>{
 m.report.mockResolvedValue({...await m.report(),family:"portal8-escrow"});
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({items:[{address:holder},{address:token}],nextOffset:50})})));
 await runFeeJob(job.id);expect(m.guard).not.toHaveBeenCalled();
 expect(m.command.mock.calls.find(([c])=>c==="holder_prepare")?.[1]).toMatchObject({revision:4,nextOffset:1});
});
it("never reports an unavailable snapshot as a no-op success",async()=>{
 m.report.mockResolvedValue(emptyReport(feeReportInput.parse({token})));await expect(runFeeJob(job.id)).rejects.toThrow(/cannot be verified/);expect(m.prepare).not.toHaveBeenCalled();
});
it.each(["beneficiary","shares","quote","creator debt","holder debt"])("rechecks %s before signing a prepared transaction",async kind=>{
 const report=await m.report();
 const terms:SponsoredFeeTerms={jobId:job.id,phase:kind==="holder debt"?"holders":"creator",family:"legacy-splitter",beneficiaries:[holder],beneficiaryShares:[10000],tracker:holder,quote:splitter,payout:splitter,recipients:kind==="holder debt"?[holder]:[]};
 const tx={owner:FEE_EXECUTOR_OWNER,wallet:FEE_EXECUTOR,chainId:5042,leg:"claim",creatorClaim:{token,splitter,sponsored:terms},unsigned:serializeTransaction({chainId:5042,type:"eip1559",nonce:0,gas:100000n,maxFeePerGas:1n,maxPriorityFeePerGas:1n,...sponsoredCall(splitter,terms)})} as Transaction;
 if(kind==="beneficiary")report.beneficiaries=[{address:token,shareBps:10000}];
 if(kind==="shares")report.beneficiaries=[{address:holder,shareBps:9999}];
 if(kind==="quote")report.assets.quote.address=token;
 if(kind==="creator debt")report.signals.creatorFeesOwed=false;
 if(kind==="holder debt")m.owed.mockResolvedValue(0n);
 await expect(verifySponsoredFee(tx)).rejects.toThrow(/changed before signing/);
 expect(m.advance).not.toHaveBeenCalled();
});
it.each([false,true])("releases changed entitlements only before the signing fence (signing started: %s)",async signing=>{
 const id=feeTxId(job.id,0);rows.set(id,{id,status:"prepared",recoveryVersion:1,...(signing?{signingStartedAt:Date.now()}:{})});
 m.advance.mockRejectedValue(Error("Fee entitlement or contract changed before signing."));
 const result=await runFeeJob(job.id);
 if(signing){expect(result.pending).toBe(true);expect(m.command).not.toHaveBeenCalledWith("cancel_unsigned_trade",expect.anything());}
 else{expect(result.status).toBe("failed");expect(m.command).toHaveBeenCalledWith("cancel_unsigned_trade",{id,owner:FEE_EXECUTOR_OWNER});}
});
it("does not cancel an unsigned transaction on an unavailable fresh report",async()=>{
 const id=feeTxId(job.id,0);rows.set(id,{id,status:"prepared",recoveryVersion:1});m.advance.mockRejectedValue(Error("Fee report cannot be verified."));
 expect(await runFeeJob(job.id)).toMatchObject({pending:true});expect(m.command).not.toHaveBeenCalledWith("cancel_unsigned_trade",expect.anything());
});
