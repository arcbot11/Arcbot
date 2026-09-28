import type { MutationCtx } from "../_generated/server";
import type { Store, Transaction } from "../../lib/otc/model";
import { admitFeeWorkflow, feeAdmissionInput, type FeeAdmission } from "../../lib/fee-report/admission";
import { FEE_EXECUTOR_OWNER, FREE_CHECKS_PER_MINUTE,FEE_JOB_GAS_CAP,FEE_RESERVE } from "../../lib/fee-report/policy";
import { feeTxId, finalizedFeeGas, phases, type FeeControl, type FeeJob } from "../../lib/fee-report/jobs";
import { z } from "zod";
import { cancelUnsignedTrade, neverSigned } from "../../lib/otc/unsigned-recovery";
import { PRE_SETTLEMENT_LEASE_MS } from "../../lib/bridge-api/model";
const address=z.string().regex(/^0x[\da-f]{40}$/i).transform(x=>x.toLowerCase()).refine(x=>!/^0x0{40}$/.test(x));
export async function feeCommand(ctx:MutationCtx,store:Store,command:string,input:unknown,now:number) {
  if(command==="fee_configure") {
    const a=z.object({enabled:z.boolean(),wallets:z.array(address).min(1).max(100),excludedTokens:z.array(address).max(10000)}).strict().parse(input);
    const control:FeeControl={...a,kind:"fee_control",id:"fee:control",owner:FEE_EXECUTOR_OWNER,updatedAt:now};
    await store.put(control);return control;
  }
  if(command==="fee_report_limit") {
    const {principal}=z.object({principal:z.string().min(1).max(180)}).strict().parse(input);
    const changes=[];
    for(const [key,max] of [[`fee:report:${principal}`,FREE_CHECKS_PER_MINUTE],["fee:report:global",600]] as const) {
      const row=await ctx.db.query("bridgeApiLimits").withIndex("by_key",q=>q.eq("key",key)).unique();
      const fresh=!row||row.expiresAt<=now, count=fresh?1:row.count+1;
      if(count>max)return false;
      changes.push({row,value:{key,count,expiresAt:fresh?now+60000:row.expiresAt}});
    }
    for(const {row,value} of changes)if(row)await ctx.db.patch(row._id,value);else await ctx.db.insert("bridgeApiLimits",value);
    return true;
  }
  if(command==="fee_admit") {
    const a=z.object({id:z.string(),channel:z.enum(["x402","x","telegram"]),principal:z.string(),token:address,balanceWei:z.string().regex(/^\d+$/),paymentId:z.string().optional(),sourceRequestId:z.string().optional()}).strict().parse(input);
    const normalized=feeAdmissionInput(a.id,a.channel,a.principal,a.token);
    if(!a.id.startsWith("fee:"))throw Error("Invalid fee job ID.");
    const previous=await store.get<FeeJob>(a.id);
    if(previous){admitFeeWorkflow(normalized,[previous],now);if(previous.paymentId!==a.paymentId||previous.sourceRequestId!==a.sourceRequestId)throw Error("Fee request binding changed.");return previous;}
    const control=await store.get<FeeControl>("fee:control");
    if(!control?.enabled)throw Error("Fee execution is not enabled.");
    if((a.channel==="x402")!==!!a.paymentId)throw Error("Fee payment binding missing.");
    const groups=await Promise.all(["running","awaiting_payment","completed","failed"].map(status=>ctx.db.query("otcRecords").withIndex("by_kind_status",q=>["running","awaiting_payment"].includes(status)?q.eq("kind","fee_job").eq("status",status):q.eq("kind","fee_job").eq("status",status).gte("updatedAt",now-86400000)).take(1001)));
    const rows=groups.flat();
    // Retention is conservative: never silently omit unresolved or recently settled reservations.
    if(rows.length>1000)throw Error("Fee ledger maintenance required.");
    const records=rows.map(r=>JSON.parse(r.json) as FeeAdmission);
    const reserved=records.filter(r=>r.active).reduce(sum=>sum+FEE_JOB_GAS_CAP,0n);
    if(BigInt(a.balanceWei)<reserved+FEE_JOB_GAS_CAP+FEE_RESERVE)throw Error("Fee service needs gas funding.");
    const admitted=admitFeeWorkflow(normalized,records,now);
    const job:FeeJob={...admitted.job,kind:"fee_job",owner:FEE_EXECUTOR_OWNER,updatedAt:now,status:a.paymentId?"awaiting_payment":"running",paymentId:a.paymentId,sourceRequestId:a.sourceRequestId,phase:0,steps:[]};
    await store.put(job);return job;
  }
  const a=z.object({id:z.string(),phase:z.number().int().min(0).max(2).optional(),skipped:z.string().max(250).optional()}).strict().parse(input);
  const job=await store.get<FeeJob>(a.id);
  if(!job||job.kind!=="fee_job")throw Error("Fee job missing.");
  if(command==="fee_release_unpaid") {
    if(job.status!=="awaiting_payment")return job;
    const payment=await ctx.db.query("bridgeApiRequests").withIndex("by_request",q=>q.eq("requestId",job.paymentId!)).unique();
    if(payment?.state!=="not_charged")throw Error("Fee payment is still unresolved.");
    job.status="failed";job.active=false;job.completedAt=now;job.updatedAt=now;job.actualGasWei="0";await store.put(job);return job;
  }
  if(command==="fee_activate") {
    if(job.status!=="awaiting_payment")return job;
    const payment=await ctx.db.query("bridgeApiRequests").withIndex("by_request",q=>q.eq("requestId",job.paymentId!)).unique();
    if(payment && ["processing","prepared"].includes(payment.state) && payment.createdAt+PRE_SETTLEMENT_LEASE_MS<=now) {
      // Same atomic fence as payment recovery: a late HTTP worker can no longer settle.
      await ctx.db.patch(payment._id,{state:"not_charged",resultJson:undefined});
      payment.state="not_charged";
    }
    if(payment?.state==="not_charged") {
      job.status="failed";job.active=false;job.completedAt=now;job.updatedAt=now;job.actualGasWei="0";await store.put(job);return job;
    }
    if(payment?.state!=="settled"||!payment.resultJson||JSON.parse(payment.resultJson).jobId!==job.id)return job;
    job.status="running";job.updatedAt=now;await store.put(job);return job;
  }
  if(command==="fee_expire") {
    if(job.status!=="running"||now-job.createdAt<=3600000)return job;
    let current=await store.get<Transaction>(feeTxId(job.id,job.phase));
    if(current&&neverSigned(current))current=await cancelUnsignedTrade(store,current.id,now,job.owner);
    // Signed/uncertain attempts must finish normal finality recovery before any release.
    if(current&&!['completed','reverted','cancelled'].includes(current.status))return job;
    const txs=await Promise.all(job.steps.flatMap(s=>s.txId?[store.get<Transaction>(s.txId)]:[]));
    if(txs.some(t=>!t))throw Error("Fee receipt journal missing.");
    if(current){txs.push(current);job.steps.push({phase:phases[job.phase],txId:current.id});}
    job.actualGasWei=String(finalizedFeeGas(txs as Transaction[]));job.status="failed";job.active=false;job.completedAt=now;job.updatedAt=now;
    await store.put(job);return job;
  }
  if(command==="fee_advance") {
    if(job.status!=="running"||job.phase!==a.phase)return job;
    const tx=await store.get<Transaction>(feeTxId(job.id,job.phase));
    if(tx){finalizedFeeGas([tx]);job.steps.push({phase:phases[job.phase],txId:tx.id});if(tx.status!=="completed")job.status="failed";}
    else {if(!a.skipped)throw Error("Fee step evidence missing.");job.steps.push({phase:phases[job.phase],skipped:a.skipped});}
    job.phase++;
    if(job.phase===3&&job.status==="running")job.status="completed";
    if(job.status!=="running") {
      const txs=await Promise.all(job.steps.flatMap(s=>s.txId?[store.get<Transaction>(s.txId)]:[]));
      if(txs.some(t=>!t))throw Error("Fee receipt journal missing.");
      job.actualGasWei=String(finalizedFeeGas(txs as Transaction[]));job.completedAt=now;job.active=false;
    }
    job.updatedAt=now;await store.put(job);return job;
  }
  throw Error("Unknown fee command.");
}
