import {it,expect,vi} from 'vitest';
vi.mock('../lib/otc/repository',()=>({repository:()=>({})}));
import {selectSettlementWork} from '../lib/otc/runtime';
import type {Order} from '../lib/otc/model';
it('reaches jobs beyond the first 50 even if every earlier attempt is interrupted',()=>{
 const rows=Array.from({length:125},(_,i)=>({kind:'order',id:`order:${i}`,status:'payment_pending',createdAt:i,updatedAt:i} as Order));
 const visited=new Set<string>();let now=10000;
 for(let run=0;run<125;run++){
  const page=[...rows].sort((a,b)=>a.updatedAt-b.updatedAt).slice(0,50);
  const [job]=selectSettlementWork(page,now);
  // The worker durably touches before any network call that can time out.
  job.updatedAt=now++;visited.add(job.id);
 }
 expect(visited.size).toBe(125);
});
