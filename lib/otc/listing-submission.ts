import { usdc, premium, type Listing } from "./model";
export type ListingSubmission={action:"list";requestId:string;amount:string;premium:string;maxGasReserveWei:string};
export function assertListingRetry(listing:Listing,amount:string,premiumText:string,seller:string){
  if(listing.seller.toLowerCase()!==seller.toLowerCase() || (listing.originalBudget??listing.originalAmount)!==usdc(amount).toString() || listing.premiumBps!==premium(premiumText))
    throw new Error("Listing request ID belongs to different or unverifiable terms. Check your listings.");
}
export function listingSubmission(requestId:string,amount:string,premiumText:string,maxGasReserveWei:string):ListingSubmission{
  if(typeof requestId!=="string"||!/^[A-Za-z0-9:_-]{8,120}$/.test(requestId)||typeof maxGasReserveWei!=="string"||!/^[1-9][0-9]{0,77}$/.test(maxGasReserveWei))throw new Error("Invalid saved listing request.");
  usdc(amount);premium(premiumText);
  return {action:"list",requestId,amount,premium:premiumText,maxGasReserveWei};
}
