import {transactionStatus} from "@/lib/otc/transaction-history";
import {NextRequest} from "next/server";
import {websiteSession,json,webFailure,WebError} from "@/lib/otc/http";
import {repository} from "@/lib/otc/repository";
import {advanceTransaction} from "@/lib/otc/runtime";
import type {Transaction} from "@/lib/otc/model";
export const runtime="nodejs";
export const maxDuration=60;
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  try{
    const session=await websiteSession(request),id=request.nextUrl.searchParams.get("id");
    if(!id||id.length>160)throw new WebError("Invalid transaction ID.");
    let tx=await repository().read<Transaction|null>({id});
    if(!tx||tx.kind!=="transaction"||tx.owner!==session.xUserId||tx.wallet.toLowerCase()!==session.walletAddress.toLowerCase())throw new WebError("Transaction not found.",404);
    if(tx.status==="submitted"){try{tx=await advanceTransaction(tx.id,true);}catch{/* Keep the durable status when verification is unavailable. */}}
    return json(transactionStatus(tx));
  }catch(error){return webFailure(error);}
}
