import {it,expect,vi,afterEach} from 'vitest';
import {command,rescheduleTransaction} from '../convex/otc';
import {roleEndpoints,rpcRole} from '../lib/arc/rpc-role';
import {arcConfig} from '../lib/arc/config';
import {transactionStatus} from '../lib/otc/transaction-history';
import type {Transaction} from '../lib/otc/model';
type Row=Record<string,unknown>;
function fixture(){
  vi.stubEnv('OTC_SERVICE_SECRET','s'.repeat(32));
  const tx:Transaction={kind:'transaction',id:'tx:test',owner:'alice',wallet:'0x1111111111111111111111111111111111111111',chainId:5042,leg:'send',holdId:'tx:test',unsigned:'0x02',raw:'0x02',hash:'0x123',status:'signed',createdAt:1,updatedAt:1};
  const tables:Record<string,Row[]>={otcRecords:[{_id:'tx',key:tx.id,kind:'transaction',status:tx.status,json:JSON.stringify(tx)}],otcMarketStats:[{_id:'stats',key:'total',soldUsdc:'0',ready:true}],transactionRecovery:[]};
  const all=()=>Object.values(tables).flat();
  const ctx={scheduler:{runAfter:vi.fn()},db:{query:(table:string)=>{let rows=tables[table]??[];const builder={eq:(k:string,v:unknown)=>{rows=rows.filter(r=>r[k]===v);return builder;}};const q={withIndex:(_s:string,cb:(b:typeof builder)=>unknown)=>{cb(builder);return q;},unique:async()=>rows[0]??null};return q;},insert:async(table:string,row:Row)=>{const id=table+Math.random();(tables[table]??=[]).push({_id:id,...row});return id;},patch:async(id:string,patch:Row)=>Object.assign(all().find(r=>r._id===id)!,patch),replace:async(id:string,row:Row)=>{const old=all().find(r=>r._id===id)!;Object.keys(old).forEach(k=>{if(k!=='_id')delete old[k];});Object.assign(old,row);},delete:async(id:string)=>{for(const [table,rows]of Object.entries(tables))tables[table]=rows.filter(r=>r._id!==id);}}};
  const invoke=(fn:unknown,args:unknown)=>(fn as {_handler:(c:unknown,a:unknown)=>Promise<unknown>})._handler(ctx,args);
  const call=(name:string,input:unknown)=>invoke(command,{secret:'s'.repeat(32),command:name,json:JSON.stringify(input)});
  return {tx,tables,ctx,call,invoke};
}
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it('allows one recovery lease, ignores a stale release, and rejects a stale broadcast',async()=>{
  const f=fixture();expect(await f.call('recovery_acquire',{id:f.tx.id,lease:'first'})).toBe(true);
  expect(await f.call('recovery_acquire',{id:f.tx.id,lease:'second'})).toBe(false);
  await f.call('recovery_release',{id:f.tx.id,lease:'second'});
  expect(f.tables.transactionRecovery[0].lease).toBe('first');
  await expect(f.call('submitted',{id:f.tx.id,lease:'second'})).rejects.toThrow('changed');
  await f.call('submitted',{id:f.tx.id,lease:'first'});
  await expect(f.call('submitted',{id:f.tx.id,lease:'first'})).rejects.toThrow('scheduled');
  expect(JSON.parse(f.tables.otcRecords[0].json as string).broadcastAttempts).toBe(1);
});
it('recovers an interrupted lease without changing the signed bytes',async()=>{
  vi.useFakeTimers();const f=fixture();await f.call('recovery_acquire',{id:f.tx.id,lease:'dead'});vi.advanceTimersByTime(90_001);
  expect(await f.call('recovery_acquire',{id:f.tx.id,lease:'next'})).toBe(true);
  await f.call('submitted',{id:f.tx.id,lease:'next'});expect(JSON.parse(f.tables.otcRecords[0].json as string)).toMatchObject({raw:f.tx.raw,hash:f.tx.hash,unsigned:f.tx.unsigned});
});
it('reschedules unfinished work durably and removes completed jobs',async()=>{
  const f=fixture();await f.call('recovery_acquire',{id:f.tx.id,lease:'first'});
  await f.invoke(rescheduleTransaction,{id:f.tx.id});expect(f.ctx.scheduler.runAfter).toHaveBeenCalledTimes(2);
  f.tables.otcRecords[0].status='completed';await f.invoke(rescheduleTransaction,{id:f.tx.id});expect(f.tables.transactionRecovery).toEqual([]);
});
it('does not make unchanged worker touches look like progress',async()=>{
  const f=fixture();await f.call('touch',{id:f.tx.id});const tx=JSON.parse(f.tables.otcRecords[0].json as string);
  expect(tx.progressAt).toBe(1);expect(transactionStatus(tx)).toMatchObject({stage:'submitting',progressAt:1});
  expect(transactionStatus({...tx,broadcastPausedAt:2})).toMatchObject({stage:'paused'});
});
it('keeps quote preferences out of execution and never broadcasts on the read-only gateway',()=>{
  const c=arcConfig({rpcUrl:'https://write.example',rpcFallbackUrls:['https://backup.example'],readOnlyRpcUrls:['https://read.example'],quoteRpcUrls:['https://backup.example','https://read.example'],checkpointNumber:'1',checkpointHash:'0x'+'a'.repeat(64)});
  expect(roleEndpoints(c,'quote','eth_call')[0]).toBe('https://backup.example');
  expect(roleEndpoints(c,'execution','eth_call')[0]).toBe('https://write.example');
  expect(roleEndpoints(c,'broadcast','eth_sendRawTransaction')).not.toContain('https://read.example');
  expect(rpcRole('eth_getTransactionReceipt',true)).toBe('receipt');
});
