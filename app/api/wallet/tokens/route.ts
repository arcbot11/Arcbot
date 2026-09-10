import { NextRequest } from "next/server";
import { websiteSession, json, webFailure } from "@/lib/otc/http";
import { repository } from "@/lib/otc/repository";
import type { RecordValue } from "@/lib/otc/model";
import { arcTokenBalances } from "@/lib/arc/wallet-tokens";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:NextRequest){
  try{
    const session=await websiteSession(request);
    const records=await repository().read<RecordValue[]>({owner:session.xUserId});
    const known=records.flatMap(r=>r.kind==="transaction"&&r.chainId===5042&&r.swapOutput?[r.swapOutput.token]:[]);
    return json({walletAddress:session.walletAddress,...await arcTokenBalances(session.walletAddress,[...new Set(known)])});
  }catch(error){return webFailure(error);}
}
