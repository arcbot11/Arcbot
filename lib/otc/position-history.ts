import { paymentAsset, type Listing, type Order, type Wallet } from "./model";

/** Derive history from durable settlement records; quoted payments are not receipts. */
export function positionHistory(listing: Listing, orders: Order[], wallet?: Wallet) {
  const fills = orders.filter(o => o.listingId === listing.id);
  const sold = fills.filter(o => o.status === "completed").reduce((n,o) => n + BigInt(o.amount), 0n);
  const received = {ETH: 0n, USDC: 0n};
  for (const order of fills) {
    if ((order.escrow?order.sellerPaymentHash:order.paymentHash) && ["payment_finalized","payout_submitted","payout_failed","completed"].includes(order.status))
      received[paymentAsset(order)] += BigInt(order.sellerWei);
  }
  const settlementLocked = listing.pendingFills > 0 || BigInt(listing.held) > 0n;
  const closed = ["cancelled","filled"].includes(listing.status) && !settlementLocked;
  // Unknown original amounts in legacy records must not be reported as zero returns.
  const returned = closed && listing.originalAmount !== undefined ? BigInt(listing.originalAmount) - sold : null;
  return {...listing, sold: sold.toString(), receivedEthWei: received.ETH.toString(), receivedUsdcUnits: received.USDC.toString(),
    returnedUsdc: listing.escrow?.returnedWei ? (BigInt(listing.escrow.returnedWei)/10n**12n).toString() : returned !== null && returned >= 0n ? returned.toString() : null,
    settlementLocked, canCancel: ["active","funding"].includes(listing.status) && !settlementLocked && !wallet?.activeTx};
}
