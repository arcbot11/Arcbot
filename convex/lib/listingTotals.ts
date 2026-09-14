import type {MutationCtx} from '../_generated/server';
import type {Order,Transaction} from '../../lib/otc/model';
import {arcOrderReceived} from '../../lib/otc/order-display';
export const totalsFields=['sold','deliveredPending','receivedEthWei','receivedUsdcUnits'] as const;
export async function updateListingTotals(ctx:MutationCtx,order:Order){
  const row=await ctx.db.query('otcRecords').withIndex('by_key',q=>q.eq('key',`escrow:${order.id}:arc:${order.escrow?.attempts?.arc??0}`)).unique();
  const delivered=arcOrderReceived(order,row?[JSON.parse(row.json) as Transaction]:[]);
  const paid=Boolean((order.escrow?order.sellerPaymentHash:order.paymentHash)&&['payment_finalized','payout_submitted','payout_failed','completed'].includes(order.status));
  const next={sold:delivered?order.amount:'0',deliveredPending:delivered&&order.status!=='completed'?order.amount:'0',receivedEthWei:paid&&order.paymentAsset!=='USDC'?order.sellerWei:'0',receivedUsdcUnits:paid&&order.paymentAsset==='USDC'?order.sellerWei:'0'};
  const previous=await ctx.db.query('otcOrderTotals').withIndex('by_order',q=>q.eq('orderId',order.id)).unique();
  const total=await ctx.db.query('otcListingTotals').withIndex('by_listing',q=>q.eq('listingId',order.listingId)).unique();
  const value={listingId:order.listingId,...Object.fromEntries(totalsFields.map(k=>[k,(BigInt(total?.[k]??'0')+BigInt(next[k])-BigInt(previous?.[k]??'0')).toString()]))} as {listingId:string}&typeof next;
  if(total)await ctx.db.replace(total._id,value);else await ctx.db.insert('otcListingTotals',value);
  const contribution={listingId:order.listingId,orderId:order.id,...next};
  if(previous)await ctx.db.replace(previous._id,contribution);else await ctx.db.insert('otcOrderTotals',contribution);
}
