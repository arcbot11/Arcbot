import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { z } from "zod";
import { boundedJson } from "@/lib/bounded-json";
import { json, websiteSession, WebError } from "@/lib/otc/http";
import { FeeClaimError } from "@/lib/launches/fees";
import { rewardSnapshot, runRewardAction } from "@/lib/launches/reward-service";
export const runtime="nodejs";
export const maxDuration=120;
const address=z.string().regex(/^0x[\da-f]{40}$/i);
export async function GET(request:NextRequest){try{return json(await rewardSnapshot(getAddress(address.parse(request.nextUrl.searchParams.get("token")))));}catch(error){return failure(error);}}
export async function POST(request:NextRequest){try{
  const session=await websiteSession(request,true);
  const input=z.object({token:address,requestId:z.string().uuid(),action:z.enum(["distribute","holders"]),offset:z.number().int().min(0).max(100000).default(0),resume:z.boolean().default(false)}).strict().parse(await boundedJson(request,2048));
  return json(await runRewardAction(session.owner,getAddress(session.walletAddress),input.requestId,getAddress(input.token),input.action,input.offset,!input.resume));
}catch(error){return failure(error);}}
function failure(error:unknown){
  if(error instanceof WebError)return json({error:error.message},error.status);
  if(error instanceof FeeClaimError)return json({error:error.message},400);
  if(error instanceof z.ZodError)return json({error:"Enter a valid token contract address."},400);
  return json({error:"Request could not be confirmed. Retry the same request; check your wallet history before starting another."},503);
}
