import {expect,it} from 'vitest';
import {reserveRpcSlot,reserveRpcBatch,RPC_SLOT_LATE_MS} from '../lib/arc/rpc-capacity';
it('shares one staggered budget between concurrent estimates and transaction stages',()=>{
 let next=0;const starts:number[]=[];
 for(let index=0;index<20;index++){
   const slot=reserveRpcSlot(next,10000);next=slot.nextAt;starts.push(slot.at);
   expect(slot.retryAfterMs).toBe(0);expect(slot.expiresAt-slot.at).toBe(RPC_SLOT_LATE_MS);
 }
 expect(new Set(starts).size).toBe(20);expect(starts.at(-1)).toBe(10950);
});
it('batches never overlap across callers and share the legacy reservation bucket',()=>{
 const a=reserveRpcBatch(0,10000);
 const legacy=reserveRpcSlot(a.nextAt,10000);
 const b=reserveRpcBatch(legacy.nextAt,10000);
 expect(a.slots).toHaveLength(8);
 expect(a.slots.at(-1)!.at).toBeLessThan(legacy.at);
 expect(b.slots[0].at).toBeGreaterThan(legacy.at);
 const rejected=reserveRpcBatch(12000,10000);
 expect(rejected.slots).toEqual([]);expect(rejected.nextAt).toBe(12000);
});
it('bounds queueing and does not reserve slots on rejected admission',()=>{
 const slot=reserveRpcSlot(12000,10000);
 expect(slot).toEqual({at:0,expiresAt:0,retryAfterMs:100,nextAt:12000});
});
it('does not accumulate a burst allowance while idle',()=>{
 expect(reserveRpcSlot(10000,60000)).toEqual({at:60000,expiresAt:61000,retryAfterMs:0,nextAt:60050});
});
