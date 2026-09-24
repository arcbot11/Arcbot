import {NextRequest} from "next/server";
import {websiteSession,json,webFailure} from "@/lib/otc/http";
import {baseTokenBalances} from "@/lib/base/wallet-tokens";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function GET(request:NextRequest){
  try{const session=await websiteSession(request);return json({walletAddress:session.walletAddress,...await baseTokenBalances(session.walletAddress)});}
  catch(error){return webFailure(error);}
}
