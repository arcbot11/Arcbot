import {expect,it} from 'vitest';
import {abortChangedRequest} from '../lib/otc/external-spending';
import {settled} from '../lib/otc/transactions';
import {type RecordValue,type Store,type Transaction,type Wallet,walletId} from '../lib/otc/model';

it.each(['unsigned','signing','signed','settled'] as const)('releases only safely resolved claim leases: %s',async mode=>{
 const address='0x1111111111111111111111111111111111111111';
 const tx:Transaction={kind:'transaction',id:'claim:test',owner:'user',wallet:address,chainId:5042,leg:'claim',holdId:'claim:test',status:'prepared',recoveryVersion:1,unsigned:'0x',createdAt:1,updatedAt:1};
 if(mode==='signing')tx.signingStartedAt=2;
 if(mode==='signed'||mode==='settled')Object.assign(tx,{status:'submitted',raw:'0x01',hash:'hash',signingStartedAt:2});
 const w:Wallet={kind:'wallet',id:walletId(5042,address),owner:'user',address,chainId:5042,activeTx:tx.id,holds:{[tx.holdId]:'100',other:'77'},updatedAt:1};
 const rows=new Map<string,RecordValue>([[tx.id,tx],[w.id,w]]);
 const store:Store={get:async<T extends RecordValue>(id:string)=>structuredClone(rows.get(id)??null) as T|null,put:async row=>{rows.set(row.id,structuredClone(row));}};
 if(mode==='signing'||mode==='signed'){
  await expect(abortChangedRequest(store,tx.id,'claim_entitlement_changed',3)).rejects.toThrow('reconciliation');
  expect(await store.get(w.id)).toMatchObject({activeTx:tx.id,holds:{[tx.holdId]:'100',other:'77'}});
 }else{
  if(mode==='unsigned')await abortChangedRequest(store,tx.id,'claim_entitlement_changed',3);
  else await settled(store,tx.id,'100',true,3,{gasWei:'10',claims:[]},'hash');
  expect((await store.get<Wallet>(w.id))!.activeTx).toBeUndefined();
  expect((await store.get<Wallet>(w.id))!.holds).toEqual({other:'77'});
  expect((await store.get<Transaction>(tx.id))!.status).toBe(mode==='unsigned'?'cancelled':'completed');
 }
});
