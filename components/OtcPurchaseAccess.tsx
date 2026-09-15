"use client";

export function settlingPurchaseLabel(ownPurchase:boolean,ownershipKnown:boolean){
  return ownPurchase?"Purchase Processing":ownershipKnown?"Another Purchase Is Processing":"Checking purchase status";
}

/** Reopening shows existing tracking; it never submits or accepts an order. */
export function OtcPurchaseAccess({wallet,activeWallet,open,onView}:{wallet?:string;activeWallet?:string;open:boolean;onView:()=>void}){
  if(open||!wallet||!activeWallet||wallet.toLowerCase()!==activeWallet.toLowerCase())return null;
  return <button type="button" className="arc-button" onClick={onView}>View purchase</button>;
}
