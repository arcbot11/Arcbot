import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { z } from "zod";
import { creatorTokens,runCreatorClaim } from "@/lib/launches/fee-service";
import { FeeClaimError } from "@/lib/launches/fees";
import { websiteSession,WebError,json,sameSecret } from "@/lib/otc/http";
import { boundedJson } from "@/lib/bounded-json";
export const runtime="nodejs";
export const maxDuration=120;
export async function GET(request:NextRequest){
  try{
    // Telegram menu reads are server-to-server. This never authorizes a claim.
    const secret=process.env.WEB_AUTH_SECRET;
    const address=secret&&sameSecret(request.headers.get("authorization")??"",`Bearer ${secret}`)
      ?getAddress(z.string().regex(/^0x[\da-f]{40}$/i).parse(request.nextUrl.searchParams.get("wallet")))
      :getAddress((await websiteSession(request)).walletAddress);
    const diagnostics:{incomplete?:boolean}={};
    const tokens=await creatorTokens(address,diagnostics);
    return json({wallet:address,tokens,incomplete:!!diagnostics.incomplete});
  }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  try{
    const session=await websiteSession(request,true);
    const input=z.object({requestId:z.string().uuid(),token:z.string().regex(/^0x[\da-f]{40}$/i)}).strict().parse(await boundedJson(request,1024));
    return json(await runCreatorClaim(session.owner,getAddress(session.walletAddress),input.requestId,getAddress(input.token)));
  }catch(error){return failure(error);}
}
function failure(error:unknown){
  if(error instanceof WebError)return json({error:error.message},error.status);
  if(error instanceof FeeClaimError)return json({ok:false,message:error.message});
  if(error instanceof z.ZodError)return json({error:"Invalid fee claim request."},400);
  return json({error:"Fee request could not be confirmed. Retry the same request or check transaction history."},503);
}
