import {advanceLaunch} from "@/lib/launches/service";
import { NextRequest } from "next/server";
import { drainWork,advanceTransaction,advanceOrder } from "@/lib/otc/runtime";
import {advanceEscrowPosition} from '@/lib/otc/escrow-runtime';
import { json, sameSecret } from "@/lib/otc/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function POST(request:NextRequest){
  const secret=process.env.OTC_SERVICE_SECRET;
  if(!secret||!sameSecret(request.headers.get("authorization")??"",`Bearer ${secret}`))return json({error:"Unauthorized."},401);
  const launch=request.nextUrl.searchParams.get("launch");
  if(launch){
    const owner=request.nextUrl.searchParams.get("owner"),address=request.nextUrl.searchParams.get("address");
    if(!owner||!address||launch.length>100)return json({error:"Invalid launch."},400);
    try{return json(await advanceLaunch(owner,address,launch));}catch{return json({error:"Launch recovery will retry."},503);}
  }
  const id=request.nextUrl.searchParams.get('transaction');
  if(id){
    if(id.length>240)return json({error:'Invalid transaction.'},400);
    try{
      const tx=await advanceTransaction(id);
      if(tx.status==='completed'){
        const orderId=tx.escrowRef?.orderId??tx.orderId;
        if(orderId)await advanceOrder(orderId);
        else if(tx.escrowRef?.listingId)await advanceEscrowPosition(tx.escrowRef.listingId);
      }
      return json({status:tx.status});
    }
    catch{return json({error:'Transaction recovery will retry.'},503);}
  }
  try{const result=await drainWork();return json(result,result.failed>0?503:200);}catch{return json({error:"Settlement worker unavailable."},503);}
}
