import { marketStats, MIN_USDC, type Listing } from "./model";

/** Public order book only: never expose escrow accounts, owner IDs or transaction records. */
export function publicMarket(records:Listing[],soldUsdc="0"){
  const listings=records.filter(l=>l.status==="active"&&l.pendingFills===0&&BigInt(l.held)===0n&&BigInt(l.available)>=MIN_USDC)
    .sort((a,b)=>a.premiumBps-b.premiumBps||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  return {listings:listings.map(({id,seller,premiumBps,available,createdAt})=>({id,seller,premiumBps,available,createdAt})),stats:{...marketStats(listings),soldUsdc}};
}
