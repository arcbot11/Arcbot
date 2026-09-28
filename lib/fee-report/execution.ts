import { getAddress, parseAbi, type Address } from "viem";
import { readFeeReport } from "./read";
import { repository } from "../otc/repository";
import { chainClient, prepareCall, advanceTransaction } from "../otc/runtime";
import { feeTxId, phases, type FeeJob, type FeeControl, type SponsoredFeeTerms } from "./jobs";
import { FEE_EXECUTOR,FEE_EXECUTOR_OWNER } from "./policy";
import { sponsoredCall,assertSponsoredTransaction } from "./calls";
import { assertCrankAllowed } from "../../scripts/lib/personal-crank-exclusions.mjs";
import type { Transaction,HolderCursor } from "../otc/model";
const holderAbi=parseAbi(["function withdrawableOf(address) view returns(uint256)","function pendingOf(address) view returns(uint256)"]);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export async function verifySponsoredFee(tx:Transaction) {
  assertSponsoredTransaction(tx);
  const report=await readFeeReport({token:tx.creatorClaim!.token});
  const terms=tx.creatorClaim!.sponsored!, c=report.contracts;
  if(!c||!report.family||report.status==="unavailable"||report.status==="unsupported"||c.splitter.toLowerCase()!==tx.creatorClaim!.splitter.toLowerCase()||report.family!==terms.family||c.tracker?.toLowerCase()!==(terms.tracker?.toLowerCase()) || !same(report.beneficiaries?.map(b=>b.address.toLowerCase()),terms.beneficiaries.map(a=>a.toLowerCase())) || !same(report.beneficiaries?.map(b=>b.shareBps),terms.beneficiaryShares))throw Error("Fee entitlement or contract changed before signing.");
  if(report.assets?.quote.address.toLowerCase()!==terms.quote.toLowerCase() || report.assets?.payout.address.toLowerCase()!==terms.payout.toLowerCase())throw Error("Fee assets changed before signing.");
  if(terms.phase==="crank") {
    const control=await repository().read<FeeControl>({id:"fee:control"});
    if(!control?.enabled)throw Error("Fee execution paused.");
    await assertCrankAllowed(getAddress(c.splitter),chainClient(5042),control);
  }
  if(terms.phase==="holders") {
    const client=chainClient(5042);
    for(const recipient of terms.recipients) {
      const owed=await client.readContract({address:getAddress(report.family==="portal8-escrow"?report.token:c.tracker!),abi:holderAbi,functionName:report.family==="portal8-escrow"?"pendingOf":"withdrawableOf",args:[getAddress(recipient)]});
      if(owed<=0n)throw Error("Holder entitlement changed before signing.");
    }
  }
}
async function holders(token:Address,family:string,tracker:string|null) {
  const repo=repository(),client=chainClient(5042);
  let cursor=await repo.command<HolderCursor>("holder_cursor",{token});
  if(cursor.activeTx)throw Error("Holder distribution is already pending.");
  for(let i=0;i<10;i++) {
    const r=await fetch(`https://www.arcexplorer.org/api/v1/tokens/${token}/holders?limit=50&offset=${cursor.offset}`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error("Holder discovery unavailable.");
    const body=await r.json() as {items?:{address?:string}[];nextOffset?:number};
    if(!Array.isArray(body.items)||body.items.length>50)throw Error("Invalid holder response.");
    const users=[...new Set(body.items.flatMap(v=>typeof v.address==="string"&&/^0x[\da-f]{40}$/i.test(v.address)?[v.address.toLowerCase()]:[]))];
    const found:string[]=[];
    for(const user of users)if(await client.readContract({address:getAddress(family==="portal8-escrow"?token:tracker!),abi:holderAbi,functionName:family==="portal8-escrow"?"pendingOf":"withdrawableOf",args:[getAddress(user)]})>0n)found.push(user);
    if(found.length)return family==="portal8-escrow"?found.slice(0,1):found;
    const next=Number.isSafeInteger(body.nextOffset)&&body.nextOffset!>cursor.offset?body.nextOffset!:0;
    cursor=await repo.command<HolderCursor>("holder_skip",{token,revision:cursor.revision,nextOffset:next});
    if(next===0)break;
  }
  return [];
}
export async function feeJobResult(job:FeeJob) {
  const repo=repository();
  const transactions=await Promise.all(job.steps.flatMap(s=>s.txId?[repo.read<Transaction>({id:s.txId})]:[]));
  const confirmed=job.steps.filter(step=>step.txId && transactions.some(tx=>tx?.id===step.txId && tx.status==="completed"));
  const completedMessage=confirmed.length?`Fee workflow completed: ${confirmed.map(step=>step.phase==="crank"?"crank confirmed":step.phase==="creator"?"creator claim confirmed":"holder distribution confirmed").join("; ")}. Payouts went to the registered recipients and eligible holders.`:"No transactions were needed for the checked fee buckets and holder scan.";
  return {jobId:job.id,status:job.status,pending:job.status==="running"||job.status==="awaiting_payment",ok:job.status==="completed",message:job.status==="completed"?completedMessage:job.status==="failed"?"Fee workflow stopped before all steps finished. Check the recorded results before submitting another request.":"Fee workflow processing; the service wallet pays gas.",steps:job.steps,gasPaidWei:job.actualGasWei??null,transactions:transactions.map(t=>t?({hash:t.hash,status:t.status,gasWei:t.settlement?.gasWei??null,claims:t.settlement?.claims??[]}):({status:"journal_missing",gasWei:null,claims:[]}))};
}
export async function runFeeJob(id:string) {
  const repo=repository();let job=await repo.read<FeeJob>({id});
  if(!job||job.kind!=="fee_job")throw Error("Fee job missing.");
  if(job.status==="awaiting_payment")job=await repo.command<FeeJob>("fee_activate",{id});
  if(job.status==="running" && Date.now()-job.createdAt>3600000)job=await repo.command<FeeJob>("fee_expire",{id});
  for(let n=0;n<3&&job.status==="running";n++) {
    const txId=feeTxId(id,job.phase),phase=phases[job.phase];
    let tx=await repo.read<Transaction|null>({id:txId});
    if(!tx) {
      const control=await repo.read<FeeControl>({id:"fee:control"});
      if(!control?.enabled)throw Error("Fee execution paused.");
      const report=await readFeeReport({token:job.token});
      if(!report.contracts||!report.family||["unavailable","unsupported"].includes(report.status))throw Error("Fee report cannot be verified.");
      let skipped:string|undefined,recipients:string[]=[];
      if(phase==="crank" && report.family==="portal8-escrow")skipped="This portal allocates fees automatically.";
      else if(phase==="crank"&&!report.signals.unprocessedFees)skipped="No fees awaiting crank.";
      else if(phase==="creator"&&!report.signals.creatorFeesOwed)skipped="No creator fees currently owed.";
      else if(phase==="holders") {
        if(report.family==="legacy-splitter"&&!report.contracts.tracker)skipped="No holder reward tracker.";
        else {recipients=await holders(getAddress(job.token),report.family,report.contracts.tracker);if(!recipients.length)skipped="No payable holders in the bounded scan; cursor saved.";}
      }
      if(skipped){job=await repo.command<FeeJob>("fee_advance",{id,phase:job.phase,skipped});continue;}
      const sponsored:SponsoredFeeTerms={jobId:id,phase,family:report.family,recipients,beneficiaries:report.beneficiaries!.map(b=>b.address),beneficiaryShares:report.beneficiaries!.map(b=>b.shareBps),tracker:report.contracts.tracker,quote:report.assets!.quote.address,payout:report.assets!.payout.address};
      if(phase==="crank")await assertCrankAllowed(getAddress(report.contracts.splitter),chainClient(5042),control);
      const p=await prepareCall(5042,{from:FEE_EXECUTOR,...sponsoredCall(report.contracts.splitter,sponsored)});
      tx=await repo.command<Transaction>("prepare",{id:txId,owner:FEE_EXECUTOR_OWNER,wallet:FEE_EXECUTOR,chainId:5042,leg:"claim",creatorClaim:{token:job.token,splitter:report.contracts.splitter,sponsored},unsigned:p.unsigned,reserveWei:p.reserveWei,balanceWei:p.snapshot.balanceWei,block:p.snapshot.block});
    }
    if(!["completed","reverted","cancelled"].includes(tx.status)){try{tx=await advanceTransaction(tx.id);}catch{tx=await repo.read<Transaction>({id:txId});}}
    if(!["completed","reverted","cancelled"].includes(tx.status))return {...await feeJobResult(job),pending:true,currentTransaction:{id:tx.id,hash:tx.hash,status:tx.status}};
    job=await repo.command<FeeJob>("fee_advance",{id,phase:job.phase});
  }
  return feeJobResult(job);
}
