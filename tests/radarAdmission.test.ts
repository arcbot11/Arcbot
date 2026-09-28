import {afterEach,expect,it,vi} from 'vitest';
import {admitRadarScan,finishRadarScan,radarClarification,savedRadarResult} from '../convex/xFloodProtection';
afterEach(()=>vi.useRealTimers());
it('reads saved results only for their owner without reserving another attempt',async()=>{
 const d=database();
 const read=(owner='one')=>(savedRadarResult as any)._handler(d.ctx,{postId:'a',owner});
 expect(await read()).toBeNull();
 await d.begin('a');expect(await read()).toBeNull();
 await d.finish('a',1,'saved reply');expect(await read()).toBe('saved reply');
 await expect(read('other')).rejects.toThrow('owner mismatch');
 expect(d.rows.find(r=>r.key==='radar:global').slots).toHaveLength(1);
});
function database() {
 const rows: any[] = [];
 const ctx = { db: {
  query: (table:string) => { let field:string,key:string; const q = { withIndex: (_:string, f:any) => { f({eq:(a:string,b:string)=>{field=a;key=b;}}); return q; }, unique: async()=>rows.find(r=>r.table===table&&r[field]===key) };return q; },
  insert: async (table:string,row:any)=>{rows.push({...row,table,_id:rows.length});},
  patch: async(id:number,changes:any)=>{Object.assign(rows[id],changes);},
 } };
 return {ctx,rows,begin:(postId:string,authorXUserId='one')=>(admitRadarScan as any)._handler(ctx,{postId,authorXUserId}),finish:(postId:string,attempt:number,message?:string)=>(finishRadarScan as any)._handler(ctx,{postId,attempt,message})};
}
it('serializes calls, caches replies and fences stale completions',async()=>{
 vi.useFakeTimers();const d=database();
 expect(await d.begin('a')).toEqual({kind:'attempt',attempt:1});
 expect((await d.begin('a')).kind).toBe('busy');
 vi.advanceTimersByTime(60000);
 expect(await d.begin('a')).toEqual({kind:'attempt',attempt:2});
 expect(await d.finish('a',1,'stale')).toBe(false);
 expect(await d.finish('a',2,'report')).toBe(true);
 expect(await d.begin('a')).toEqual({kind:'cached',message:'report'});
 expect(d.rows.find(r=>r.key==='radar:global').slots).toHaveLength(2);
});
it('allows three retries with backoff and caps a post at four attempts',async()=>{
 vi.useFakeTimers();const d=database();
 for(let n=1;n<=4;n++){
  expect(await d.begin('a')).toEqual({kind:'attempt',attempt:n});
  await d.finish('a',n);
  expect((await d.begin('a')).kind).toBe('busy');
  vi.advanceTimersByTime(15000);
 }
 expect((await d.begin('a')).kind).toBe('exhausted');
 expect(d.rows.find(r=>r.key==='radar:global').slots).toHaveLength(4);
});
it('enforces one new scan per user per minute and 200 attempts per rolling hour',async()=>{
 vi.useFakeTimers();const d=database();
 expect((await d.begin('a')).kind).toBe('attempt');
 expect((await d.begin('b')).kind).toBe('limited');
 vi.advanceTimersByTime(60000);
 expect((await d.begin('b')).kind).toBe('attempt');
 for(let n=2;n<200;n++)expect((await d.begin(String(n),'user'+n)).kind).toBe('attempt');
 expect((await d.begin('overflow','other')).kind).toBe('limited');
 vi.advanceTimersByTime(3539999);
 expect((await d.begin('overflow','other')).kind).toBe('limited');
 vi.advanceTimersByTime(1);
 expect((await d.begin('overflow','other')).kind).toBe('attempt');
 expect((await d.begin('overflow2','other2')).kind).toBe('limited');
});
it('only accepts a recent clarification belonging to the requesting user',async()=>{
 const d=database();d.rows.push({table:'xReplyInteractions',responsePostId:'parent',authorXUserId:'one',commandKind:'token_scan_ca',updatedAt:Date.now()});
 const ask=(owner:string)=>(radarClarification as any)._handler(d.ctx,{parentPostId:'parent',owner});
 expect(await ask('one')).toBe(true);expect(await ask('other')).toBe(false);
 d.rows[0].updatedAt-=600001;expect(await ask('one')).toBe(false);
});
