import {type Store,type Order,type Transaction,type Listing,wallet,finishOrder} from './model';
import {neverSigned} from './unsigned-recovery';

/** Display hint only; cancellation always repeats the full atomic proof. */
export function unpaidPurchaseCandidate(order:Order,transactions:Transaction[]){
  if(order.status!=='payment_pending'||order.escrow?.version!==2||order.paymentHash||order.payoutHash||Object.values(order.escrow.attempts??{}).some(n=>n>0))return false;
  const steps=transactions.filter(tx=>tx.escrowRef?.orderId===order.id);
  return steps.every(tx=>tx.escrowRef?.step==='deposit'&&neverSigned(tx));
}

/** Must run in the same database transaction as prepare and begin_signing. */
export async function cancelUnpaidPurchase(store:Store,id:string,owner:string,now:number){
  const order=await store.get<Order>(id);
  if(!order?.escrow||order.escrow.version!==2||![order.owner,order.sellerOwner].includes(owner))throw Error('Purchase cannot be cancelled by this account.');
  if(order.status==='payment_failed')return order;
  if(order.status!=='payment_pending'||order.paymentHash||order.payoutHash)throw Error('Payment has started. Wait for settlement.');
  // Conservative across every attempt: absence of the current hash alone is not proof.
  const attempts=order.escrow.attempts??{};
  if(Object.entries(attempts).some(([step,n])=>step!=='deposit'&&n>0)|| (attempts.deposit??0)>32)throw Error('Payment history requires reconciliation.');
  for(const step of ['gas','topup','arc_topup','arc','seller','fee','return_gas']){
    if(await store.get(`escrow:${id}:${step}:${attempts[step]??0}`))throw Error('Payment has started. Wait for settlement.');
  }
  const txs:Transaction[]=[];
  for(let attempt=0;attempt<=(attempts.deposit??0);attempt++){
    const tx=await store.get<Transaction>(`escrow:${id}:deposit:${attempt}`);
    if(!tx){if(attempt<(attempts.deposit??0))throw Error('Payment history requires reconciliation.');continue;}
    if(tx.recoveryVersion!==1)throw Error('Payment history requires reconciliation.');
    if(tx.signingStartedAt!==undefined||tx.raw||tx.hash||tx.previousSigned?.length||(!neverSigned(tx)&&tx.status!=='cancelled'))throw Error('Payment signing has started. Wait for verification.');
    if(neverSigned(tx))txs.push(tx);
  }
  const listing=await store.get<Listing>(order.listingId);
  if(!listing||listing.escrow?.settlementOrderId!==order.id)throw Error('Purchase reservation changed.');
  for(const tx of txs){
    const w=await wallet(store,8453,tx.wallet,tx.owner,now);
    if(w.activeTx!==tx.id)throw Error('Wallet transaction lease mismatch.');
    delete w.activeTx;delete w.holds[tx.holdId];if(w.usdcHolds)delete w.usdcHolds[tx.holdId];
    tx.status='cancelled';tx.note='Purchase cancelled before payment.';tx.updatedAt=w.updatedAt=now;
    await store.put(w);await store.put(tx);
  }
  await finishOrder(store,order,'payment_failed',now);
  order.note='Purchase cancelled before payment. No funds sent.';await store.put(order);return order;
}
