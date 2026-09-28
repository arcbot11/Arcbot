import {describe, expect, it, vi} from "vitest";
import {encodeAbiParameters, encodeEventTopics, type Address, type Hex} from "viem";
import {applyFeeHistory, feeTopics, historyAbi, historyId, sumFeeLogs, type FeeHistory, type FeeLog, type HistoryBinding} from "../lib/fee-report/history";
import {feeHistoryCommand} from "../convex/lib/feeHistoryCommands";
import {emptyReport, feeReportInput} from "../lib/fee-report/model";
import type {RecordValue, Store} from "../lib/otc/model";
const addr=(n:number)=>`0x${n.toString(16).padStart(40,"0")}` as Address;
const hash=`0x${"12".repeat(32)}` as Hex;
const binding:HistoryBinding={token:addr(1),quote:addr(2),hook:addr(3),locker:addr(4),family:"legacy-splitter"};
function tax(amount:bigint,currency=addr(1)):FeeLog {return {address:binding.hook,topics:encodeEventTopics({abi:historyAbi,eventName:"TaxTaken",args:{currency}}) as Hex[],data:encodeAbiParameters([{type:"uint256"},{type:"bool"},{type:"bool"}],[amount,true,false]),blockNumber:5n,blockHash:hash,transactionHash:hash,logIndex:0};}
function row():FeeHistory {return {kind:"fee_history",id:historyId(binding.token),owner:"service:fee-history",binding,revision:0,nextBlock:"0",targetBlock:"10",throughHash:null,tokenTotal:"0",quoteTotal:"0",updatedAt:0,scheduledAt:0};}
describe("fee event accounting",()=>{
 it("adds hook accrual and collected LP fees once, using sorted pool currencies",()=>{
  const lp:FeeLog={...tax(0n),address:binding.locker,logIndex:1,topics:encodeEventTopics({abi:historyAbi,eventName:"FeesCollected",args:{caller:addr(7)}}) as Hex[],data:encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[3n,4n])};
  expect(sumFeeLogs(binding,[tax(2n),lp],0n,10n)).toEqual({token:5n,quote:4n});
 });
 it("counts only Portal 8 bucket fees, excluding the protocol surcharge",()=>{
  const log:FeeLog={...tax(0n),topics:[feeTopics.quote],data:encodeAbiParameters([{type:"uint256"},{type:"uint256"},{type:"bool"},{type:"bool"}],[100n,9n,true,true])};
  expect(sumFeeLogs({...binding,family:"portal8-escrow"},[log],0n,10n)).toEqual({token:0n,quote:100n});
 });
 it.each(["duplicate","foreign","range","removed","currency","transfer"])("rejects %s events instead of fabricating a lifetime total",kind=>{
  const log=tax(2n);let logs=[log];
  if(kind==="duplicate")logs=[log,log];
  if(kind==="foreign")log.address=addr(99);
  if(kind==="range")log.blockNumber=11n;
  if(kind==="removed")log.removed=true;
  if(kind==="currency")logs=[tax(2n,addr(99))];
  if(kind==="transfer")log.topics=[hash];
  expect(()=>sumFeeLogs(binding,logs,0n,10n)).toThrow();
 });
 it("publishes totals only for complete, canonically checked history with matching contracts",()=>{
  const r=emptyReport(feeReportInput.parse({token:binding.token}));
  Object.assign(r,{status:"partial",family:binding.family,contracts:{portal:addr(8),splitter:addr(9),tracker:null,hook:binding.hook,locker:binding.locker},assets:{token:{address:binding.token,decimals:2,symbol:"T"},quote:{address:binding.quote,decimals:6,symbol:"Q"}},evidence:{blockNumber:"12"}});
  const h={...row(),nextBlock:"11",throughHash:hash,tokenTotal:"200",quoteTotal:"3000000"};
  expect(applyFeeHistory(structuredClone(r),{...h,nextBlock:"5"},hash).lifetimeFeesEarned).toBeNull();
  expect(applyFeeHistory(structuredClone(r),h,"reorg").lifetimeFeesEarned).toBeNull();
  expect(applyFeeHistory(structuredClone(r),{...h,binding:{...binding,hook:addr(55)}},hash).lifetimeFeesEarned).toBeNull();
  expect(applyFeeHistory(r,h,hash).lifetimeFeesEarned).toMatchObject({throughBlock:"10",amounts:[{formatted:"3"},{formatted:"2"}]});
  expect(r.status).toBe("partial"); // Uncollected legacy LP fees are not indexed events.
 });
});
describe("durable historical checkpoints",()=>{
 function fixture(){const records=new Map<string,RecordValue>();const store:Store={get:async<T extends RecordValue>(id:string)=>structuredClone(records.get(id)??null) as T|null,put:async r=>{records.set(r.id,structuredClone(r));}};const ctx={scheduler:{runAfter:vi.fn()}};return {records,store,ctx,command:(name:string,input:unknown,now=1000000)=>feeHistoryCommand(ctx as never,store,name,input,now)};}
 it("deduplicates scheduled requests and preserves a growing target",async()=>{
  const f=fixture();await f.command("fee_history_request",{binding,targetBlock:"10"});await f.command("fee_history_request",{binding,targetBlock:"20"});
  expect(f.ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);expect(f.records.get(historyId(binding.token))).toMatchObject({targetBlock:"20",nextBlock:"0"});
 });
 it("atomically rejects stale commits and can reset a reorg without adding twice",async()=>{
  const f=fixture(),h=row();f.records.set(h.id,h);
  const update={id:h.id,revision:0,nextBlock:"6",throughHash:hash,tokenTotal:"2",quoteTotal:"3"};
  await f.command("fee_history_commit",update);await f.command("fee_history_commit",update);
  expect(f.records.get(h.id)).toMatchObject({revision:1,tokenTotal:"2"});
  await f.command("fee_history_commit",{id:h.id,revision:1,reset:true,nextBlock:"0",throughHash:null,tokenTotal:"0",quoteTotal:"0"});
  expect(f.records.get(h.id)).toMatchObject({revision:2,nextBlock:"0",tokenTotal:"0"});
 });
 it("rejects out-of-target or decreasing totals",async()=>{
  const f=fixture(),h={...row(),nextBlock:"6",quoteTotal:"4"};f.records.set(h.id,h);
  for(const update of [{nextBlock:"12",quoteTotal:"5"},{nextBlock:"7",quoteTotal:"3"}])await expect(f.command("fee_history_commit",{id:h.id,revision:0,throughHash:hash,tokenTotal:"0",...update})).rejects.toThrow(/checkpoint/);
 });
});
