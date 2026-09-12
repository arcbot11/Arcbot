import { MIN_USDC, paymentAsset, type Listing, type Order, type Wallet, type Transaction } from "./model";
import { arcOrderReceived } from "./order-display";
import {cannotExecute} from './external-spending';

/** Derive history from durable settlement records; quoted payments are not receipts. */
export function positionHistory(listing: Listing, orders: Order[], wallet?: Wallet, transactions:Transaction[]=[] ) {
  const fills = orders.filter(o => o.listingId === listing.id);
  const delivered=fills.filter(o=>arcOrderReceived(o,transactions));
  const sold = delivered.reduce((n,o) => n + BigInt(o.amount), 0n);
  const deliveredHeld=delivered.filter(o=>o.status!=="completed").reduce((n,o)=>n+BigInt(o.amount),0n);
  const pendingDelivery=BigInt(listing.held)>deliveredHeld?BigInt(listing.held)-deliveredHeld:0n;
  const received = {ETH: 0n, USDC: 0n};
  for (const order of fills) {
    if ((order.escrow?order.sellerPaymentHash:order.paymentHash) && ["payment_finalized","payout_submitted","payout_failed","completed"].includes(order.status))
      received[paymentAsset(order)] += BigInt(order.sellerWei);
  }
  const settlementLocked = listing.pendingFills > 0 || BigInt(listing.held) > 0n;
  const funding=transactions.filter(t=>t.escrowRef?.listingId===listing.id&&t.escrowRef.step==='fund');
  const canAbortFunding=listing.status==='funding'&&funding.every(cannotExecute)&&(!wallet?.activeTx||funding.some(t=>t.id===wallet.activeTx));
  const closed = ["cancelled","filled"].includes(listing.status) && !settlementLocked;
  // Unknown original amounts in legacy records must not be reported as zero returns.
  const returned = closed && listing.originalAmount !== undefined ? BigInt(listing.originalAmount) - sold : null;
  return {...listing, sold: sold.toString(), pendingDelivery:pendingDelivery.toString(),closingAfterSettlement:listing.status==="active"&&sold>0n&&BigInt(listing.available)<MIN_USDC, receivedEthWei: received.ETH.toString(), receivedUsdcUnits: received.USDC.toString(),
    returnedUsdc: listing.escrow?.returnedWei ? (BigInt(listing.escrow.returnedWei)/10n**12n).toString() : returned !== null && returned >= 0n ? returned.toString() : null,
    settlementLocked, canCancel: !settlementLocked&&(canAbortFunding||listing.status==='active'&&!wallet?.activeTx)};
}
