import {expect,it} from 'vitest';
import {acquireOperatorLease,releaseOperatorLease} from '../lib/otc/operator-lease';
import {walletId,checkSnapshot,type Store,type RecordValue,type Wallet} from '../lib/otc/model';
const address='0x1111111111111111111111111111111111111111';
const id='operator-launch:11111111-1111-4111-8111-111111111111';
const other='operator-launch:22222222-2222-4222-8222-222222222222';
function memory(){const rows=new Map<string,RecordValue>();return {rows,get:async<T extends RecordValue>(key:string)=>structuredClone(rows.get(key)??null) as T|null,put:async(r:RecordValue)=>{rows.set(r.id,structuredClone(r));}} satisfies Store&{rows:Map<string,RecordValue>};}
const input={id,address,owner:'owner',balanceWei:'100',block:'10'};
it('locks only available funds, blocks competing work, and preserves existing holds on release',async()=>{
 const s=memory();await s.put({kind:'wallet',id:walletId(5042,address),owner:'owner',address,chainId:5042,holds:{listing:'30'},updatedAt:1});
 const w=await acquireOperatorLease(s,input,2);
 expect(w.holds).toEqual({listing:'30',[id]:'70'});
 expect(()=>checkSnapshot(w,'11')).toThrow('pending');
 await expect(acquireOperatorLease(s,{...input,id:other},3)).rejects.toThrow('pending');
 const released=await releaseOperatorLease(s,{id,address,block:'12'},4);
 expect(released.holds).toEqual({listing:'30'});expect(released.activeTx).toBeUndefined();
 expect(released.lastSettledBlock).toBe('12');
});
it('retries its own acquisition without resetting budget or changing ownership',async()=>{
 const s=memory();await acquireOperatorLease(s,input,1);
 expect((await acquireOperatorLease(s,{...input,balanceWei:'500'},2)).holds[id]).toBe('100');
 await expect(acquireOperatorLease(s,{...input,owner:'other'},3)).rejects.toThrow('owner');
});
it('rejects wrong lease release, stale snapshots, and insufficient funds',async()=>{
 const s=memory();await acquireOperatorLease(s,input,1);
 await expect(releaseOperatorLease(s,{id:other,address,block:'10'},2)).rejects.toThrow('changed');
 await releaseOperatorLease(s,{id,address,block:'12'},3);
 await expect(acquireOperatorLease(s,{...input,id:other},4)).rejects.toThrow('behind');
 await expect(acquireOperatorLease(s,{...input,id:other,block:'13',balanceWei:'0'},4)).rejects.toThrow('No available');
});
it('cannot release a different active transaction or silently expire after elapsed time',async()=>{
 const s=memory();await acquireOperatorLease(s,input,1);
 const w=await s.get<Wallet>(walletId(5042,address));expect(w!.activeTx).toBe(id);
 expect(()=>checkSnapshot(w!,'99999')).toThrow('pending');
 w!.activeTx='ordinary-send';await s.put(w!);
 await expect(releaseOperatorLease(s,{id,address,block:'99999'},999999999)).rejects.toThrow('changed');
});
