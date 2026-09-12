import { exactAmount, USDC_SCALE } from "../arc/amounts";

export const MIN_USDC = 10_000_000n;
export const MAX_PREMIUM_BPS = 1_000_000;
export const QUOTE_MS = 30_000;
export const SERVICE_FEE_BPS = 150;
export type PaymentAsset = "ETH" | "USDC";
export const paymentAsset = (order: {paymentAsset?: PaymentAsset}): PaymentAsset => order.paymentAsset ?? "ETH";
export type Chain = 5042 | 8453;
export const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
export function usdc(value: string) {
  const units = exactAmount(value, 6);
  if (units < MIN_USDC) throw new Error("Minimum amount is 10 Arc USDC.");
  if (units > 1_000_000_000_000_000n) throw new Error("Amount exceeds the listing limit.");
  return units;
}
export function premium(value: string) {
  if (!/^(0|[1-9][0-9]{0,4})(\.[0-9]{1,2})?$/.test(value)) throw new Error("Enter a premium from 0% to 10,000%, with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (bps > MAX_PREMIUM_BPS) throw new Error("Maximum premium is 10,000%.");
  return bps;
}
export function price(amount: bigint, premiumBps: number, ethUsdMicros: bigint, feeBps=100) {
  if (amount < MIN_USDC || !Number.isSafeInteger(premiumBps) || premiumBps < 0 || premiumBps > MAX_PREMIUM_BPS || ethUsdMicros <= 0n) throw new Error("Invalid OTC price inputs.");
  const sellerWei = ceil(amount * BigInt(10_000 + premiumBps) * 10n ** 18n, 10_000n * ethUsdMicros);
  const feeWei = ceil(sellerWei*BigInt(feeBps), 10_000n);
  return { sellerWei: sellerWei.toString(), feeWei: feeWei.toString(), totalWei: (sellerWei + feeWei).toString() };
}
export function usdcPrice(amount: bigint, premiumBps: number, feeBps=100) {
  if (amount < MIN_USDC || !Number.isSafeInteger(premiumBps) || premiumBps < 0 || premiumBps > MAX_PREMIUM_BPS) throw new Error("Invalid OTC price inputs.");
  const sellerWei = ceil(amount * BigInt(10_000 + premiumBps), 10_000n);
  const feeWei = ceil(sellerWei*BigInt(feeBps), 10_000n);
  return {sellerWei: sellerWei.toString(), feeWei: feeWei.toString(), totalWei: (sellerWei + feeWei).toString()};
}
export type EscrowPosition = {settlementOrderId?:string;fundingExtraWei?:string;version:1;accountName:string;address?:string;fundingWei:string;feeRecipient:string;fundingGasWei:string;closeGasWei:string;closeReason?:"cancelled"|"filled";returnedWei?:string;gasRemainderWei?:string;attempts?:Record<string,number>;note?:string};
export type EscrowOrder = {sellerFirst?:boolean;refundSkipped?:boolean;topupWei?:string;arcTopupWei?:string;topupSpentWei?:string;arcTopupSpentWei?:string;baseRecoveryLimitWei?:string;arcRecoveryLimitWei?:string;version:1|2;address:string;gasBudgetWei:string;gasRemainderWei?:string;attempts?:Record<string,number>};
export type Listing = {
  kind: "listing"; id: string; owner: string; seller: string; premiumBps: number;
  originalAmount?: string; originalBudget?: string; available: string; held: string; pendingFills: number; gasPerFillWei: string;
  escrow?: EscrowPosition; status: "funding" | "closing" | "active" | "cancelled" | "filled"; createdAt: number; updatedAt: number;
};
export type OrderStatus = "quoted" | "payment_pending" | "payment_submitted" | "payment_finalized" | "payout_submitted" | "payout_failed" | "completed" | "expired" | "payment_failed";
export type Order = {
  /** Missing on legacy orders, whose inventory was reserved at quote time. */
  listingReserved?: boolean;
  kind: "order"; id: string; owner: string; buyer: string; seller: string; sellerOwner: string; listingId: string;
  escrow?: EscrowOrder; paymentAsset?: PaymentAsset; approvalGasWei?: string; approvalHash?: string; approvalFinalized?: boolean;
  amount: string; premiumBps: number; ethUsdMicros: string; priceAt: number;
  // Legacy names: atomic payment units (18 decimals for ETH, 6 for Base USDC).
  sellerWei: string; feeWei: string; totalWei: string; baseGasWei: string; arcGasWei: string;
  router: string; feeRecipient: string; serviceFeeBps?:number; expiresAt: number; status: OrderStatus;
  sellerPaymentHash?: string; serviceFeeHash?: string; gasRefundHash?:string; paymentHash?: string; payoutHash?: string; payoutAttempt?: number; note?: string; createdAt: number; updatedAt: number;
};
export type Wallet = { kind: "wallet"; id: string; owner: string; address: string; chainId: Chain;
  holds: Record<string, string>; usdcHolds?: Record<string, string>; activeTx?: string; lastSettledBlock?: string; updatedAt: number };
export type Transaction = { kind: "transaction"; id: string; owner: string; wallet: string; chainId: Chain;
  firstBroadcastAt?:number;lastBroadcastAt?:number;broadcastAttempts?:number;broadcastAcknowledgedAt?:number;
  initialGasReserveWei?:string;
  escrowRef?: {listingId:string;orderId?:string;step:string;sourceHold?:string;reserveWei?:string}; sourceRequestId?: string;
  swapOutput?: {token:string;minimum:string;recipient?:string};
  settlement?: {gasWei:string;output?:{raw:string;decimals?:number}};
  /** Read-only observation; not a settled transaction or permission to release holds. */
  confirmation?: {status:"success"|"reverted";blockNumber:string};
  orderId?: string; leg: "approval" | "payment" | "payout" | "send" | "swap" | "allowance"; holdId: string; status: "prepared" | "signed" | "submitted" | "completed" | "reverted" | "cancelled";
  recoveryVersion?:1; signingStartedAt?:number;signingRevision?:number;previousSigned?:import("./signed-recovery").SignedAttempt[];nonceConflict?:{hash:string;block:string};
  unsigned: string; raw?: string; hash?: string; blockNumber?: string; note?: string; createdAt: number; updatedAt: number };
export type RecordValue = Listing | Order | Wallet | Transaction;
export interface Store {
  get<T extends RecordValue>(id: string): Promise<T | null>;
  put(record: RecordValue): Promise<void>;
}
export const walletId = (chain: Chain, address: string) => `wallet:${chain}:${address.toLowerCase()}`;
export const locked = (wallet: Wallet) => Object.values(wallet.holds).reduce((sum, value) => sum + BigInt(value), 0n);
export const lockedBaseUsdc = (w: Wallet) => Object.values(w.usdcHolds ?? {}).reduce((sum, value) => sum + BigInt(value), 0n);
export const paymentNativeReserve = (o: Order) => (o.escrow?(o.escrow.version===2?1n:2n)*BigInt(o.baseGasWei)+BigInt(o.escrow.gasBudgetWei):BigInt(o.baseGasWei)) + (paymentAsset(o) === "ETH" ? BigInt(o.totalWei) : 0n);
export async function wallet(store: Store, chain: Chain, address: string, owner: string, now: number) {
  const id = walletId(chain, address);
  const existing = await store.get<Wallet>(id);
  if (existing && existing.owner !== owner) throw new Error("Wallet owner mismatch.");
  return existing ?? { kind: "wallet" as const, id, owner, address, chainId: chain, holds: {}, updatedAt: now };
}
export function checkSnapshot(w: Wallet, block: string) {
  if (w.activeTx) throw new Error("A wallet transaction is pending. Wait for confirmation.");
  if (w.lastSettledBlock && BigInt(block) < BigInt(w.lastSettledBlock)) throw new Error("Balance snapshot is behind the last wallet transaction.");
}
export function reserve(w: Wallet, id: string, amount: bigint, balance: bigint) {
  if (amount < 0n) throw new Error("Invalid reservation.");
  const other = locked(w) - BigInt(w.holds[id] ?? "0");
  if (other + amount > balance) throw new Error("Not enough available funds, including gas and existing reservations.");
  w.holds[id] = amount.toString();
}
export async function updateListingHold(store: Store, listing: Listing, now: number) {
  // Dust below the minimum cannot be sold. Release it, never subtract it from a buyer's quote.
  if (listing.pendingFills === 0 && BigInt(listing.available) < MIN_USDC) { if(listing.escrow&&listing.status==="active"){listing.status="closing";listing.escrow.closeReason="filled";}else if(!listing.escrow)listing.available = "0"; }
  const w = await wallet(store, 5042, listing.escrow?.address??listing.seller, listing.owner, now);
  const amount = (BigInt(listing.available) + BigInt(listing.held)) * USDC_SCALE;
  const gas = ((BigInt(listing.available) + BigInt(listing.held)) / MIN_USDC) * BigInt(listing.gasPerFillWei)+(listing.escrow&&!listing.escrow.returnedWei?BigInt(listing.escrow.closeGasWei):0n);
  if (amount + gas === 0n) delete w.holds[listing.id]; else w.holds[listing.id] = (amount + gas).toString();
  if (listing.status === "active" && amount === 0n) listing.status = "filled";
  listing.updatedAt = w.updatedAt = now;
  await store.put(w); await store.put(listing);
}
/** Maximum sellable six-decimal USDC within a total budget, including all possible minimum-size fills. */
export function listingBudget(budget: bigint, gasPerFill: bigint, fixedGas=0n) {
  if(gasPerFill<=0n)throw new Error("Gas estimate is unavailable.");
  let low=0n,high=budget;
  const cost=(amount:bigint)=>amount*USDC_SCALE+(amount/MIN_USDC)*gasPerFill+fixedGas;
  while(low<high){const middle=(low+high+1n)/2n;if(cost(middle)<=budget*USDC_SCALE)low=middle;else high=middle-1n;}
  if(low<MIN_USDC)throw new Error("Minimum listing is 10 USDC after gas. Increase the total amount.");
  return {amount:low,gasReserve:low/MIN_USDC*gasPerFill+fixedGas,requiredWei:cost(low)};
}
export async function createListing(store: Store, input: { id: string; owner: string; seller: string; amount: string; amountIncludesGas?: boolean; escrow?: Pick<EscrowPosition,"accountName"|"feeRecipient">; premium: string; gasPerFillWei: string; balanceWei: string; block: string }, now: number) {
  const entered = usdc(input.amount), premiumBps = premium(input.premium), gas = BigInt(input.gasPerFillWei);
  if (gas <= 0n) throw new Error("Gas estimate is unavailable.");
  const previous = await store.get<Listing>(input.id);
  if (previous) {
    // Reusing an ID must never create a second listing or change the seller.
    if (previous.owner !== input.owner || previous.seller !== input.seller || (input.amountIncludesGas ? previous.originalBudget : previous.originalAmount) !== entered.toString() || previous.premiumBps !== premiumBps) throw new Error("Listing identity or terms mismatch.");
    return previous;
  }
  const w = await wallet(store, 5042, input.seller, input.owner, now);
  checkSnapshot(w, input.block);
  const amount=input.amountIncludesGas?listingBudget(entered,gas,input.escrow?gas*2n:0n).amount:entered;
  const required = amount * USDC_SCALE + amount / MIN_USDC * gas + (input.escrow?gas*2n:0n);
  if (BigInt(input.balanceWei) - locked(w) < required) throw new Error(input.amountIncludesGas?"Not enough available USDC for this listing budget.":`You don't have enough for gas on top of ${input.amount} USDC.`);
  const listing: Listing = { kind: "listing", id: input.id, owner: input.owner, seller: input.seller, premiumBps, ...(input.amountIncludesGas?{originalBudget:entered.toString()}:{}), originalAmount: amount.toString(), available: amount.toString(), held: "0", pendingFills: 0, gasPerFillWei: gas.toString(), status: input.escrow?"funding":"active", ...(input.escrow?{escrow:{...input.escrow,version:1 as const,fundingWei:(required-gas).toString(),fundingGasWei:gas.toString(),closeGasWei:gas.toString()}}:{}), createdAt: now, updatedAt: now };
  reserve(w, listing.id, required, BigInt(input.balanceWei));
  await store.put(w); await store.put(listing);
  return listing;
}
export async function createQuote(store: Store, input: { id: string; owner: string; buyer: string; listingId: string; amount: string; ethUsdMicros: string; priceAt: number; baseGasWei: string; baseBalanceWei:string; baseUsdcBalance?:string; paymentAsset?:PaymentAsset; approvalGasWei?:string; baseBlock:string; escrowGasBudgetWei?:string; router: string; feeRecipient: string }, now: number) {
  const existing = await store.get<Order>(input.id);
  if (existing) { if (existing.owner !== input.owner) throw new Error("Quote owner mismatch."); return existing; }
  const listing = await store.get<Listing>(input.listingId);
  if (!listing || listing.kind !== "listing" || listing.status !== "active") throw new Error("Listing is not available.");
  if(listing.pendingFills>0||BigInt(listing.held)>0n||listing.escrow&&(!listing.escrow.address||listing.escrow.settlementOrderId))throw new Error("Listing is settling another order. Try again shortly.");
  // Escrow keeps payment and delivery separate even when both parties share a
  // wallet. Legacy direct-payment listings do not support that verification.
  if (!listing.escrow && (listing.owner === input.owner || listing.seller.toLowerCase() === input.buyer.toLowerCase())) throw new Error("You cannot buy your own legacy listing.");
  const amount = usdc(input.amount);
  if (amount > BigInt(listing.available)) throw new Error("Listing amount changed. Request a new quote.");
  if (now - input.priceAt > QUOTE_MS || input.priceAt > now || BigInt(input.baseGasWei) <= 0n) throw new Error("Price or gas estimate expired.");
  if (input.paymentAsset && input.paymentAsset !== "ETH") throw new Error("Unsupported Base payment asset.");
  const asset = paymentAsset(input);
  const serviceFeeBps=listing.escrow?SERVICE_FEE_BPS:100;
  const quote = asset === "USDC" ? usdcPrice(amount, listing.premiumBps,serviceFeeBps) : price(amount, listing.premiumBps, BigInt(input.ethUsdMicros),serviceFeeBps);
  const funding = await wallet(store,8453,input.buyer,input.owner,now);
  checkSnapshot(funding,input.baseBlock);
  if (asset === "USDC" && ((!listing.escrow&&BigInt(input.approvalGasWei ?? "0") <= 0n) || BigInt(input.baseUsdcBalance ?? "0") - lockedBaseUsdc(funding) < BigInt(quote.totalWei))) throw new Error("Not enough available Base USDC or approval gas allowance.");
  if(listing.escrow&&(!input.escrowGasBudgetWei||BigInt(input.escrowGasBudgetWei)<=0n||input.router.toLowerCase()!==listing.escrow.address!.toLowerCase()||input.feeRecipient.toLowerCase()!==listing.escrow.feeRecipient.toLowerCase()))throw new Error("Invalid escrow payment terms.");
  if(BigInt(input.baseBalanceWei)-locked(funding)<(listing.escrow?BigInt(input.escrowGasBudgetWei!):0n)+(asset === "ETH" ? BigInt(quote.totalWei) : BigInt(input.approvalGasWei??"0"))+BigInt(input.baseGasWei))throw new Error("Not enough available Base ETH for this quote and gas.");
  const order: Order = { kind: "order", id: input.id, owner: input.owner, buyer: input.buyer, seller: listing.seller, sellerOwner: listing.owner, listingId: listing.id,
    ...(listing.escrow?{escrow:{version:2 as const,address:listing.escrow.address!,gasBudgetWei:input.escrowGasBudgetWei!}}:{}),
    paymentAsset: asset, ...(asset === "USDC" ? {approvalGasWei: input.approvalGasWei} : {}),
    amount: amount.toString(), premiumBps: listing.premiumBps, ethUsdMicros: input.ethUsdMicros, priceAt: input.priceAt, ...quote,
    baseGasWei: input.baseGasWei, arcGasWei: listing.gasPerFillWei, router: input.router, feeRecipient: input.feeRecipient,serviceFeeBps,
    expiresAt: now + QUOTE_MS, status: "quoted", listingReserved:false, createdAt: now, updatedAt: now };
  await store.put(order); return order;
}
export async function acceptQuote(store: Store, id: string, owner: string, snapshot: { baseBalanceWei: string; baseBlock: string; baseUsdcBalance?: string; arcBalanceWei: string; arcBlock: string }, now: number, sellerFirst=false) {
  const order = await store.get<Order>(id);
  if (!order || order.kind !== "order" || order.owner !== owner) throw new Error("Order not found.");
  if (order.status !== "quoted") return order;
  if(paymentAsset(order)!=="ETH"||order.escrow&&order.escrow.version!==2)throw new Error("Payment options changed. Request a new ETH quote.");
  if (now >= order.expiresAt) throw new Error("Quote expired. Request a new quote.");
  const listing = await store.get<Listing>(order.listingId);
  if (!listing || listing.status !== "active") throw new Error("Listing is not available.");
  const reserveListing = order.listingReserved === false;
  if (reserveListing && (listing.pendingFills > 0 || BigInt(listing.held) > 0n || listing.escrow?.settlementOrderId))
    throw new Error("Listing is settling another order. Try again shortly.");
  if (reserveListing && BigInt(order.amount) > BigInt(listing.available)) throw new Error("Listing amount changed. Request a new quote.");
  if (listing.premiumBps !== order.premiumBps || listing.seller.toLowerCase() !== order.seller.toLowerCase()
    || listing.owner !== order.sellerOwner || (listing.escrow && (listing.escrow.address?.toLowerCase() !== order.escrow?.address.toLowerCase()
      || listing.escrow.feeRecipient.toLowerCase() !== order.feeRecipient.toLowerCase()))) throw new Error("Listing terms changed. Request a new quote.");
  const seller = await wallet(store, 5042, order.escrow?.address??order.seller, order.sellerOwner, now);
  checkSnapshot(seller, snapshot.arcBlock);
  if (BigInt(snapshot.arcBalanceWei) < locked(seller)) throw new Error("Seller balance or gas reserve is insufficient. No Base payment was sent.");
  const buyer = await wallet(store, 8453, order.buyer, order.owner, now);
  checkSnapshot(buyer, snapshot.baseBlock);
  reserve(buyer, order.id, paymentNativeReserve(order) + BigInt(order.approvalGasWei ?? "0"), BigInt(snapshot.baseBalanceWei));
  if (paymentAsset(order) === "USDC") {
    if (lockedBaseUsdc(buyer) > 0n) throw new Error("A Base USDC purchase is pending. Wait for payment verification.");
    if (BigInt(snapshot.baseUsdcBalance ?? "0") - lockedBaseUsdc(buyer) < BigInt(order.totalWei)) throw new Error("Not enough available Base USDC.");
    buyer.usdcHolds = {...buyer.usdcHolds, [order.id]: order.totalWei};
  }
  if (reserveListing) {
    listing.available = (BigInt(listing.available) - BigInt(order.amount)).toString();
    listing.held = (BigInt(listing.held) + BigInt(order.amount)).toString();
    listing.pendingFills++;
    if (listing.escrow) listing.escrow.settlementOrderId = order.id;
    await updateListingHold(store, listing, now);
  }
  if(order.escrow&&sellerFirst)order.escrow.sellerFirst=true;
  order.listingReserved = true;
  order.status = "payment_pending"; order.updatedAt = now;
  await store.put(buyer); await store.put(order); return order;
}
export async function cancelListing(store: Store, id: string, owner: string, now: number) {
  const listing = await store.get<Listing>(id);
  if (!listing || listing.kind !== "listing" || listing.owner !== owner) throw new Error("Listing not found.");
  if(listing.escrow&&listing.status==="funding"){
    const seller=await wallet(store,5042,listing.seller,listing.owner,now);
    const funding=await store.get<Transaction>(`escrow:${listing.id}:fund:${listing.escrow.attempts?.fund??0}`);
    if(seller.activeTx||(funding&&!(funding.status==="reverted"&&funding.hash&&funding.blockNumber)))throw new Error("Position is locked by its funding transaction. Wait for verification.");
    delete seller.holds[listing.id];await store.put(seller);
    listing.status="cancelled";listing.available="0";listing.escrow.returnedWei="0";delete listing.escrow.note;listing.updatedAt=now;await store.put(listing);return listing;
  }
  if (listing.status !== "active") return listing;
  const seller = await wallet(store, 5042, listing.escrow?.address??listing.seller, listing.owner, now);
  // pendingFills spans the Base payment AND Arc payout, including failed payouts.
  // Confirmation and cancellation mutate the same listing atomically.
  if (listing.pendingFills !== 0 || BigInt(listing.held) !== 0n || seller.activeTx)
    throw new Error("Position is locked by a pending quote or transaction. Wait for settlement.");
  if(listing.escrow){listing.status="closing";listing.escrow.closeReason="cancelled";}else{listing.status = "cancelled"; listing.available = "0";}
  await updateListingHold(store, listing, now); return listing;
}
export async function finishOrder(store: Store, order: Order, outcome: "completed" | "expired" | "payment_failed", now: number) {
  if (["completed", "expired", "payment_failed"].includes(order.status)) return order;
  if (outcome === "expired" && (order.status !== "quoted" || now < order.expiresAt)) throw new Error("Only unsigned expired quotes can be released.");
  if (order.listingReserved === false) {
    if (outcome !== "expired" || order.status !== "quoted") throw new Error("Unconfirmed quote cannot settle.");
    order.status = "expired"; order.updatedAt = now; delete order.note;
    await store.put(order); return order;
  }
  const listing = await store.get<Listing>(order.listingId);
  if (!listing) throw new Error("Listing record missing.");
  if(listing.escrow?.settlementOrderId===order.id)delete listing.escrow.settlementOrderId;
  listing.held = (BigInt(listing.held) - BigInt(order.amount)).toString(); listing.pendingFills--;
  if (outcome !== "completed" && listing.status === "active") listing.available = (BigInt(listing.available) + BigInt(order.amount)).toString();
  if (listing.pendingFills < 0 || BigInt(listing.held) < 0n) throw new Error("Reservation mismatch.");
  const buyer = await wallet(store, 8453, order.buyer, order.owner, now);
  delete buyer.holds[order.id]; if (buyer.usdcHolds) delete buyer.usdcHolds[order.id]; await store.put(buyer);
  order.status = outcome; order.updatedAt = now;
  delete order.note;
  await updateListingHold(store, listing, now); await store.put(order); return order;
}
export function marketStats(listings: Listing[]) {
  const open = listings.filter(l => l.status === "active" && l.pendingFills === 0 && BigInt(l.held) === 0n && BigInt(l.available) >= MIN_USDC);
  const units = open.reduce((sum,l) => sum + BigInt(l.available), 0n);
  return { count: open.length, available: units.toString(), lowestBps: open.length ? Math.min(...open.map(l=>l.premiumBps)) : null,
    averageBps: units ? Number(open.reduce((sum,l) => sum + BigInt(l.available) * BigInt(l.premiumBps), 0n) / units) : null };
}
