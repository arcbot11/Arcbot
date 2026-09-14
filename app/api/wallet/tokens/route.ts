import { NextRequest } from "next/server";
import { websiteSession, json, webFailure, WebError } from "@/lib/otc/http";
import { isAddress } from "viem";
import { repository } from "@/lib/otc/repository";
import { arcTokenBalances, arcSelectedTokenBalance } from "@/lib/arc/wallet-tokens";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
export async function GET(request:NextRequest){
  try{
    const session=await websiteSession(request);
    const token=request.nextUrl.searchParams.get("token");
    if(token!==null){
      if(!isAddress(token))throw new WebError("Choose a valid token contract.");
      return json({walletAddress:session.walletAddress,token:await arcSelectedTokenBalance(session.walletAddress,token)});
    }
    const known=await repository().knownTokens(session.owner,session.walletAddress);
    return json({walletAddress:session.walletAddress,...await arcTokenBalances(session.walletAddress,[...new Set(known)],request.nextUrl.searchParams.get("refresh")==="1")});
  }catch(error){return webFailure(error);}
}
