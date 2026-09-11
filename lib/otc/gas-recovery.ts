import { type Store, type Transaction, wallet, locked, MIN_USDC, cancelListing } from "./model";
import { completedStep, escrowRecords, escrowTxId } from "./escrow-model";

export const BASE_DUST_WEI=1_000_000_000_000n; // 0.000001 ETH; ownership remains recorded.
export const BASE_UNECONOMIC_REFUND_WEI=10n*BASE_DUST_WEI; // At most 0.00001 ETH stays credited.
export const BASE_RECOVERY_WEI=BASE_DUST_WEI;

export async function retainArcDust(store:Store,listingId:string,balanceWei:string,block:string,now:number){
  const {listing}=await escrowRecords(store,listingId);
  if(listing.status!=="closing"||listing.pendingFills||BigInt(listing.held)!==0n||BigInt(listing.available)>10_000n)throw Error("Listing principal is not dust.");
  if(await store.get<Transaction>(escrowTxId(listing,"return_arc")))throw Error("Return already has a transaction.");
  if(!await completedStep(store,listing,"fund"))throw Error("Funding is not verified.");
  const w=await wallet(store,5042,listing.escrow!.address!,listing.owner,now);
  if(w.activeTx||(w.lastSettledBlock&&BigInt(block)<BigInt(w.lastSettledBlock)))throw Error("Dust balance is not current.");
  const remainder=BigInt(balanceWei)-locked(w)+BigInt(w.holds[listing.id]??"0");
  if(remainder<0n||remainder>10n**16n)throw Error("Remainder exceeds the dust limit.");
  delete w.holds[listing.id];w.holds[`gas-credit:${listing.id}`]=remainder.toString();w.updatedAt=now;
  listing.escrow!.gasRemainderWei=remainder.toString();listing.escrow!.returnedWei="0";
  listing.available="0";listing.status=listing.escrow!.closeReason??"filled";listing.updatedAt=now;delete listing.escrow!.note;
  await store.put(w);await store.put(listing);return listing;
}

/** Funding has not been signed: keep the seller's total budget unchanged. */
export async function repriceFunding(store:Store,listingId:string,gasWei:string,now:number){
  const {listing}=await escrowRecords(store,listingId);
  if(listing.status!=="funding"||await store.get<Transaction>(escrowTxId(listing,"fund")))throw Error("Funding amount is already fixed.");
  const e=listing.escrow!,extra=BigInt(gasWei)-BigInt(e.fundingGasWei);
  if(extra<=0n)return listing;
  if(extra+BigInt(e.fundingExtraWei??"0")>10n**16n)throw Error("Funding gas exceeds the recovery allowance.");
  const units=(extra+10n**12n-1n)/10n**12n;
  if(BigInt(listing.available)-units<MIN_USDC)return cancelListing(store,listing.id,listing.owner,now);
  e.fundingWei=(BigInt(e.fundingWei)-extra).toString();e.fundingGasWei=gasWei;e.fundingExtraWei=(BigInt(e.fundingExtraWei??"0")+extra).toString();
  listing.available=(BigInt(listing.available)-units).toString();listing.updatedAt=now;
  await store.put(listing);return listing;
}

export async function retainGasDust(store:Store,listingId:string,orderId:string,balanceWei:string,block:string,now:number,refundGasWei?:string){
  const {listing,order}=await escrowRecords(store,listingId,orderId);
  if(order!.status==="completed"||order!.escrow!.refundSkipped)return order;
  for(const step of ["deposit","arc","seller","fee"] as const)if(!await completedStep(store,listing,step,order))throw Error("Payouts must be verified before retaining dust.");
  if(await store.get<Transaction>(escrowTxId(listing,"return_gas",order)))throw Error("Refund already has a transaction.");
  const w=await wallet(store,8453,order!.escrow!.address,listing.owner,now);
  if(w.activeTx||(w.lastSettledBlock&&BigInt(block)<BigInt(w.lastSettledBlock)))throw Error("Dust balance is not current.");
  const remainder=BigInt(balanceWei)-locked(w);
  const gas=refundGasWei===undefined?0n:BigInt(refundGasWei);
  const uneconomic=gas>0n&&remainder<=2n*gas&&remainder<=BASE_UNECONOMIC_REFUND_WEI;
  if(remainder<0n||(remainder>BASE_DUST_WEI&&!uneconomic))throw Error("Remainder exceeds the dust limit.");
  w.holds[`gas-credit:${order!.id}`]=remainder.toString();w.updatedAt=now;
  order!.escrow!.gasRemainderWei=remainder.toString();order!.escrow!.refundSkipped=true;order!.updatedAt=now;
  await store.put(w);await store.put(order!);return order;
}

/** One bounded recovery deposit, paid by this buyer, never another order. */
export async function requestGasTopup(store:Store,listingId:string,orderId:string,amount:string,now:number,arc=false){
  const {listing,order}=await escrowRecords(store,listingId,orderId);
  if(!order||order.status==="completed"||order.escrow?.version!==2||!await completedStep(store,listing,"deposit",order))throw Error("Payment must be verified before gas recovery.");
  if(arc?order.escrow.arcTopupWei:order.escrow.topupWei)return order;
  if(BigInt(amount)<=0n||BigInt(amount)>(arc?10n**16n:BASE_RECOVERY_WEI))throw Error("Gas recovery exceeds the small network allowance.");
  if(arc)order.escrow.arcTopupWei=amount;else order.escrow.topupWei=amount;order.updatedAt=now;await store.put(order);return order;
}

export async function claimSettlement(store:Store,listingId:string,orderId:string,now:number){
  const {listing,order}=await escrowRecords(store,listingId,orderId);
  if(!order||["quoted","completed","expired","payment_failed"].includes(order.status))return false;
  if(listing.escrow!.settlementOrderId&&listing.escrow!.settlementOrderId!==orderId)return false;
  listing.escrow!.settlementOrderId=orderId;listing.updatedAt=now;await store.put(listing);return true;
}
