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
