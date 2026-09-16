import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../convex/launchDrafts",()=>({authorize:async(_ctx:unknown,a:{owner:string;address:string})=>{if(a.owner!=="1")throw Error("Wrong owner");return {owner:a.owner,address:a.address};}}));
vi.mock("../lib/launches/policy",async original=>({...await original<typeof import("../lib/launches/policy")>(),LAUNCH_EXECUTION_ENABLED:true}));
import * as execution from "../convex/launchExecution";
import { LAUNCH_PORTAL, PORTAL6 } from "../lib/launches/contracts";
type Row=Record<string,unknown>;
const owner="1",address="0x1111111111111111111111111111111111111111",requestId="00000000-0000-4000-8000-000000000001";
function fixture(){
  const imageURI="https://pbs.twimg.com/media/example.jpg";
  const input={symbol:"EX",name:"Example",imageURI,pairToken:"USDC"};
  const tables:Record<string,Row[]>={launchRuns:[],launchDrafts:[{_id:"draft",owner,address,requestId,status:"prepared",revision:2,expiresAt:Date.now()+60000,fingerprint:"f",inputJson:JSON.stringify(input),
    previewJson:JSON.stringify({portal:LAUNCH_PORTAL,expiresAt:Date.now()+30000,fingerprint:"f",predictedToken:address,image:{imageURI,sha256:"a".repeat(64)},quote:{symbol:"USDC"}})}],otcRecords:[],verifiedBotLaunches:[],tokenRegistry:[]};
  const ctx={scheduler:{runAfter:vi.fn()},db:{query:(table:string)=>{let rows=tables[table];const q={withIndex:(_i:string,fn:(b:unknown)=>unknown)=>{const b={eq:(k:string,v:unknown)=>{rows=rows.filter(r=>r[k]===v);return b;}};fn(b);return q;},first:async()=>rows[0]??null,unique:async()=>rows[0]??null};return q;},insert:async(table:string,row:Row)=>{tables[table].push({_id:table+tables[table].length,...row});},patch:async(id:string,patch:Row)=>Object.assign(Object.values(tables).flat().find(r=>r._id===id)!,patch)}};
  const call=(fn:unknown,extra:Row={})=>(fn as {_handler:(ctx:unknown,a:unknown)=>Promise<Row>})._handler(ctx,{secret:"secret",owner,address,requestId,revision:2,...extra});
  return {tables,ctx,call};
}
beforeEach(()=>vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED","true"));afterEach(()=>vi.unstubAllEnvs());
it.each([undefined, null, PORTAL6, 7])("rejects stale or missing Portal evidence before reserving a launch: %s",async portal=>{
  const f=fixture(),draft=f.tables.launchDrafts[0],preview=JSON.parse(String(draft.previewJson));
  preview.portal=portal;draft.previewJson=JSON.stringify(preview);
  await expect(f.call(execution.accept)).rejects.toThrow("Launch settings have changed");
  expect(f.tables.launchRuns).toHaveLength(0);
  expect(f.ctx.scheduler.runAfter).not.toHaveBeenCalled();
  expect(draft.status).toBe("prepared");
});
it("accepts one immutable run and schedules recovery exactly once",async()=>{
  const f=fixture();await f.call(execution.accept);await f.call(execution.accept);
  expect(f.tables.launchRuns).toHaveLength(1);expect(f.ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);expect(f.tables.launchDrafts[0]).toMatchObject({status:"executing",revision:3});
});
it("marks a definitively rejected confirmation without creating a run",async()=>{
  const f=fixture();f.tables.launchDrafts[0].expiresAt=0;
  try{await f.call(execution.accept);throw Error("should reject");}catch(e){expect((e as {data:unknown}).data).toMatchObject({acceptance:"rejected"});}
  expect(f.tables.launchRuns).toHaveLength(0);
});
it("leases recovery and refuses an old worker's release",async()=>{
  const f=fixture();await f.call(execution.accept);
  const first=await f.call(execution.claimRecovery);expect(typeof first).toBe("string");
  expect(await f.call(execution.claimRecovery)).toBe(false);
  f.tables.launchRuns[0].recoveryUntil=0;
  const next=await f.call(execution.claimRecovery);expect(next).not.toBe(first);
  await f.call(execution.releaseRecovery,{lease:first});expect(f.tables.launchRuns[0].recoveryLease).toBe(next);
  await f.call(execution.releaseRecovery,{lease:next});expect(f.tables.launchRuns[0].recoveryUntil).toBe(0);
});
it("freezes X authorization expiry at the original command time",async()=>{
  const f=fixture(),createdAt=Date.now()-600000;
  f.tables.walletRequests=[{requestId:"x-launch",source:"x",ownerXUserId:owner,kind:"launch",_creationTime:createdAt}];
  const run=await f.call(execution.accept,{sourceRequestId:"x-launch"});
  expect(run.authorizationExpiresAt).toBe(createdAt+1800000);
});
it("rejects an already expired X command before accepting a run",async()=>{
  const f=fixture();f.tables.walletRequests=[{requestId:"x-launch",source:"x",ownerXUserId:owner,kind:"launch",_creationTime:Date.now()-1800001}];
  await expect(f.call(execution.accept,{sourceRequestId:"x-launch"})).rejects.toThrow("authorization expired");
  expect(f.tables.launchRuns).toHaveLength(0);
});
it.each(["expiry","revision","image","preparing","owner"])("rejects invalid acceptance: %s",async reason=>{
  const f=fixture(),d=f.tables.launchDrafts[0],extra:Row={};
  if(reason==="expiry")d.expiresAt=0;if(reason==="revision")extra.revision=1;if(reason==="owner")extra.owner="2";
  if(reason==="preparing")d.preparingUntil=Date.now()+10000;
  if(reason==="image"){const p=JSON.parse(String(d.previewJson));delete p.image;d.previewJson=JSON.stringify(p);}
  await expect(f.call(execution.accept,extra)).rejects.toThrow();expect(f.tables.launchRuns).toHaveLength(0);
});
it("prevents a second accepted launch for the same wallet",async()=>{
  const f=fixture();await f.call(execution.accept);f.tables.launchDrafts.push({...f.tables.launchDrafts[0],_id:"other",requestId:"00000000-0000-4000-8000-000000000002",status:"prepared",revision:2});
  await expect(f.call(execution.accept,{requestId:"00000000-0000-4000-8000-000000000002"})).rejects.toThrow("already processing");
});
it("does not advance setup until the prior transaction is verified",async()=>{
  const f=fixture();await f.call(execution.accept);await f.call(execution.step,{index:0,id:`launch:1:${requestId}:0`});
  await expect(f.call(execution.step,{index:1,id:`launch:1:${requestId}:1`})).rejects.toThrow("not verified");
});
it("does not release an accepted run while a signing attempt is unresolved",async()=>{
  const f=fixture();await f.call(execution.accept);const id=`launch:1:${requestId}:0`;await f.call(execution.step,{index:0,id});
  f.tables.otcRecords.push({key:id,json:JSON.stringify({status:"prepared",signingStartedAt:Date.now()})});
  const run=await f.call(execution.stopUnstarted,{note:"Cannot continue"});expect(run.status).toBe("running");
});
it("does not index a successful-looking transaction without verified launch evidence",async()=>{
  const f=fixture();await f.call(execution.accept);const id=`launch:1:${requestId}:0`;await f.call(execution.step,{index:0,id});
  f.tables.otcRecords.push({key:id,status:"completed",json:JSON.stringify({owner,wallet:address,status:"completed",launchStep:{requestId,kind:"launch"},hash:"0x123"})});
  await expect(f.call(execution.reconcile)).rejects.toThrow("outcome missing");expect(f.tables.verifiedBotLaunches).toHaveLength(0);
});
it("publishes a verified launch once and marks its draft completed",async()=>{
  const f=fixture();await f.call(execution.accept);const id=`launch:1:${requestId}:0`;await f.call(execution.step,{index:0,id});
  f.tables.otcRecords.push({key:id,status:"completed",json:JSON.stringify({owner,wallet:address,status:"completed",launchStep:{requestId,kind:"launch"},hash:"0x123",
    settlement:{launch:{hash:"0x123",token:address,creator:address}}})});
  expect((await f.call(execution.reconcile)).status).toBe("completed");await f.call(execution.reconcile);
  expect(f.tables.verifiedBotLaunches).toHaveLength(1);expect(f.tables.tokenRegistry).toHaveLength(1);expect(f.tables.launchDrafts[0].status).toBe("completed");
});
it("adds a verified token to the directory without replacing an existing ticker",async()=>{
  const f=fixture();f.tables.tokenRegistry.push({symbol:"EX",address:"existing",normalizedAddress:"existing"});
  await f.call(execution.accept);const id=`launch:1:${requestId}:0`;await f.call(execution.step,{index:0,id});
  f.tables.otcRecords.push({key:id,status:"completed",json:JSON.stringify({owner,wallet:address,status:"completed",launchStep:{requestId,kind:"launch"},hash:"0x123",
    settlement:{launch:{hash:"0x123",token:address,creator:address}}})});
  await f.call(execution.reconcile);expect(f.tables.verifiedBotLaunches).toHaveLength(1);expect(f.tables.tokenRegistry).toEqual([{symbol:"EX",address:"existing",normalizedAddress:"existing"}]);
});

it("stopping an unsigned run terminates its draft in the same mutation",async()=>{
 const f=fixture();await f.call(execution.accept);const run=await f.call(execution.stopUnstarted,{note:"Authorization expired"});
 expect(run.status).toBe("blocked");expect(f.tables.launchDrafts[0].status).toBe("cancelled");
});
it.each(["reverted","cancelled"])("reconciling a %s step terminates its draft",async status=>{
 const f=fixture();await f.call(execution.accept);const id=`launch:1:${requestId}:0`;await f.call(execution.step,{index:0,id});
 f.tables.otcRecords.push({key:id,status,json:JSON.stringify({owner,wallet:address,status,launchStep:{requestId,kind:"approval"}})});
 expect((await f.call(execution.reconcile)).status).toBe("blocked");expect(f.tables.launchDrafts[0].status).toBe("cancelled");
});
