import { expect, it, vi } from "vitest";
import { serializeTransaction } from "viem";
import { assertLaunchGasBudget } from "../lib/launches/gas-budget";
import { launchTransactionId, type LaunchRun } from "../lib/launches/execution-types";
import type { Transaction } from "../lib/otc/model";
const address="0x1111111111111111111111111111111111111111";
const run={owner:"1",address,requestId:"draft",steps:[0,1,2].map(i=>launchTransactionId("1","draft",i))} as LaunchRun;
const unit=10n**18n;
const unsigned=serializeTransaction({type:"eip1559",chainId:5042,to:address,gas:100000n,maxFeePerGas:10n**12n,maxPriorityFeePerGas:1n,nonce:0});
function tx(i:number,cost=unit/10n){return {id:run.steps[i],owner:run.owner,wallet:address,status:"completed",unsigned,
  launchStep:{requestId:run.requestId,index:i,kind:"approval"},settlement:{gasWei:String(cost)}} as Transaction;}
it("charges every verified setup step against the total, not just the last step",async()=>{
  const read=vi.fn(async(id:string)=>tx(run.steps.indexOf(id),unit/5n));
  await expect(assertLaunchGasBudget(run,2,unit/10n,read)).resolves.toBeUndefined();
  await expect(assertLaunchGasBudget(run,2,unit/10n+1n,read)).rejects.toMatchObject({code:"GAS_LIMIT"});
});
it("uses actual gas when verified and the full allowance for older records",async()=>{
  const record=tx(0,1n);
  await expect(assertLaunchGasBudget(run,1,unit/2n-1n,async()=>record)).resolves.toBeUndefined();
  delete record.settlement;
  await expect(assertLaunchGasBudget(run,1,unit/2n-1n,async()=>record)).rejects.toMatchObject({code:"GAS_LIMIT"});
});
it.each(["missing","unconfirmed","foreign","wrong-index","already-launched","negative-cost"])("rejects invalid setup history: %s",async reason=>{
  const record=tx(0);
  if(reason==="unconfirmed")record.status="submitted";
  if(reason==="foreign")record.owner="2";
  if(reason==="wrong-index")record.launchStep!.index=1;
  if(reason==="already-launched")record.launchStep!.kind="launch";
  if(reason==="negative-cost")record.settlement!.gasWei="-1";
  await expect(assertLaunchGasBudget(run,1,1n,async()=>reason==="missing"?null:record)).rejects.toMatchObject({code:"LAUNCH_JOURNAL"});
});
it("rejects an old run missing the completed step rather than ignoring its cost",async()=>{
  const read=vi.fn(async()=>tx(0));
  await expect(assertLaunchGasBudget({...run,steps:[]},1,1n,read)).rejects.toMatchObject({code:"LAUNCH_JOURNAL"});
  expect(read).not.toHaveBeenCalled();
});
