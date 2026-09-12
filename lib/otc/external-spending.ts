import {type Store,type Transaction,type Listing,type Order,wallet,finishOrder} from './model';
import {neverSigned,cancelUnsignedTrade} from './unsigned-recovery';

export type WalletChangeReason='balance_changed'|'nonce_changed'|'allowance_changed'|'simulation_changed';
export class WalletChangeError extends Error {
  constructor(readonly reason:WalletChangeReason){super(reason==='nonce_changed'?'Another transaction changed the wallet nonce.':reason==='allowance_changed'?'Token approval or input balance changed.':reason==='simulation_changed'?'The trade no longer simulates successfully. Check the amount, approval and price.':'Wallet balance changed. The amount and gas are no longer covered.');}
}
export async function recheckUnsignedCall<T>(call:()=>Promise<T>):Promise<T>{
  try{return await call();}catch(error){
    let cause:unknown=error;
    for(let i=0;i<8&&cause&&typeof cause==='object';i++){
      const e=cause as {code?:number;name?:string;cause?:unknown};
      if(e.code===3||/Revert/i.test(e.name??''))throw new WalletChangeError('simulation_changed');
      cause=e.cause;
    }
    throw error;
  }
}
/** A low balance or missing receipt is never evidence that signed bytes are cancelled. */
export function cannotExecute(tx:Transaction){
  return neverSigned(tx)||(tx.status==='cancelled'&&(!!tx.nonceConflict||tx.recoveryVersion===1&&tx.signingStartedAt===undefined&&!tx.raw&&!tx.hash&&!tx.previousSigned?.length))||(tx.status==='reverted'&&!!tx.hash&&!!tx.blockNumber);
}
async function releaseAttempt(store:Store,tx:Transaction,now:number,note:string){
  if(!cannotExecute(tx))throw Error('Signing outcome must be reconciled before releasing funds.');
  const w=await wallet(store,tx.chainId,tx.wallet,tx.owner,now);
  if(w.activeTx&&w.activeTx!==tx.id&&(w.holds[tx.holdId]!==undefined||w.usdcHolds?.[tx.holdId]!==undefined))throw Error('Wallet transaction changed.');
  delete w.holds[tx.holdId];if(w.usdcHolds)delete w.usdcHolds[tx.holdId];
  if(w.activeTx===tx.id)delete w.activeTx;
  w.updatedAt=now;await store.put(w);
  if(neverSigned(tx)){tx.status='cancelled';tx.note=note;tx.updatedAt=now;await store.put(tx);}
}
export async function abortUnfundedListing(store:Store,id:string,owner:string,now:number){
  const listing=await store.get<Listing>(id);
  if(!listing?.escrow||listing.owner!==owner)throw Error('Listing owner mismatch.');
  if(listing.status==='cancelled')return listing;
  if(listing.status!=='funding'||listing.pendingFills||BigInt(listing.held)!==0n||listing.escrow.settlementOrderId)throw Error('Listing funding must be reconciled.');
  const last=listing.escrow.attempts?.fund??0;
  if(!Number.isSafeInteger(last)||last<0||last>32)throw Error('Funding history requires reconciliation.');
  const attempts:Transaction[]=[];
  for(let i=0;i<=last;i++){
    const tx=await store.get<Transaction>(`escrow:${id}:fund:${i}`);
    if(!tx){if(i<last)throw Error('Funding history is incomplete.');continue;}
    if(!cannotExecute(tx))throw Error('Funding signing has started. Wait for verification.');
    attempts.push(tx);
  }
  for(const tx of attempts)await releaseAttempt(store,tx,now,'Listing cancelled before funding.');
  const w=await wallet(store,5042,listing.seller,owner,now);
  delete w.holds[id];w.updatedAt=now;await store.put(w);
  listing.status='cancelled';listing.available='0';listing.escrow.returnedWei='0';listing.updatedAt=now;
  listing.escrow.note='Listing cancelled. Funding did not complete.';await store.put(listing);return listing;
}
/** Atomic with signing; also handles a signed deposit proven replaced on chain. */
export async function abortUnfundedPurchase(store:Store,id:string,owner:string,now:number){
  const order=await store.get<Order>(id);
  if(!order?.escrow||order.escrow.version!==2||order.owner!==owner)throw Error('Purchase owner mismatch.');
  if(order.status==='payment_failed')return order;
  if(!['payment_pending','payment_submitted'].includes(order.status)||order.payoutHash||order.sellerPaymentHash||order.serviceFeeHash)throw Error('Funded purchase must settle.');
  const attempts=order.escrow.attempts??{},last=attempts.deposit??0;
  if(!Number.isSafeInteger(last)||last<0||last>32)throw Error('Payment history requires reconciliation.');
  for(const step of ['gas','topup','arc_topup','arc','seller','fee','return_gas']){
    if((attempts[step]??0)>0||await store.get(`escrow:${id}:${step}:0`))throw Error('Settlement has started.');
  }
  const txs:Transaction[]=[];
  for(let i=0;i<=last;i++){
    const tx=await store.get<Transaction>(`escrow:${id}:deposit:${i}`);
    if(!tx){if(i<last)throw Error('Payment history is incomplete.');continue;}
    if(!cannotExecute(tx))throw Error('Payment signing must be reconciled.');txs.push(tx);
  }
  if(order.paymentHash&&!txs.some(tx=>tx.hash===order.paymentHash||tx.previousSigned?.some(a=>a.hash===order.paymentHash)))throw Error('Payment hash is not reconciled.');
  const listing=await store.get<Listing>(order.listingId);
  if(listing?.escrow?.settlementOrderId!==id)throw Error('Purchase reservation changed.');
  for(const tx of txs)await releaseAttempt(store,tx,now,'Purchase cancelled before payment.');
  await finishOrder(store,order,'payment_failed',now);
  order.note='Purchase cancelled. The escrow payment did not complete. Request a new quote.';await store.put(order);return order;
}
export async function abortChangedRequest(store:Store,id:string,reason:WalletChangeReason,now:number){
  const tx=await store.get<Transaction>(id);if(!tx)throw Error('Transaction missing.');
  if(tx.status==='cancelled')return tx;
  if(!neverSigned(tx))throw Error('Signed transaction needs reconciliation.');
  if(tx.escrowRef?.step==='fund')await abortUnfundedListing(store,tx.escrowRef.listingId,tx.owner,now);
  else if(tx.escrowRef?.step==='deposit'&&tx.escrowRef.orderId)await abortUnfundedPurchase(store,tx.escrowRef.orderId,tx.owner,now);
  else if(!tx.escrowRef&&!tx.orderId)await cancelUnsignedTrade(store,id,now,tx.owner);
  else throw Error('Settlement step cannot be cancelled before delivery.');
  const next=(await store.get<Transaction>(id))!;
  next.failureReason=reason;next.note=new WalletChangeError(reason).message+' Request cancelled before signing.';await store.put(next);return next;
}
