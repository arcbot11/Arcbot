import {expect,it} from 'vitest';
import {reserveRpcSlot,RPC_SLOT_LATE_MS} from '../lib/arc/rpc-capacity';
it('shares one staggered budget between concurrent estimates and transaction stages',()=>{
 let next=0;const starts:number[]=[];
 for(let index=0;index<40;index++){
   const slot=reserveRpcSlot(next,10000);next=slot.nextAt;starts.push(slot.at);
   expect(slot.retryAfterMs).toBe(0);expect(slot.expiresAt-slot.at).toBe(RPC_SLOT_LATE_MS);
 }
 expect(new Set(starts).size).toBe(40);expect(starts.at(-1)).toBe(10975);
});
it('bounds queueing and does not reserve slots on rejected admission',()=>{
 const slot=reserveRpcSlot(12000,10000);
 expect(slot).toEqual({at:0,expiresAt:0,retryAfterMs:100,nextAt:12000});
});
it('does not accumulate a burst allowance while idle',()=>{
 expect(reserveRpcSlot(10000,60000)).toEqual({at:60000,expiresAt:60150,retryAfterMs:0,nextAt:60025});
});
