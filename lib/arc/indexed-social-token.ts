import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { resolveSocialToken, SocialTokenResolutionError } from "./social-token-resolution";
/** Static curated tickers win; new receipt-verified launches are available without a redeploy. */
export async function indexedSocialToken(value:string){
  try{return resolveSocialToken(value);}catch(error){
    if(!(error instanceof SocialTokenResolutionError)||!process.env.NEXT_PUBLIC_CONVEX_URL)throw error;
    const tokens=await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL).query(makeFunctionReference<"query">("arcTokenCatalog:searchCatalog"),{});
    return resolveSocialToken(value,tokens);
  }
}
