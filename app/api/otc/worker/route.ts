import { NextRequest } from "next/server";
import { drainWork } from "@/lib/otc/runtime";
import { json, sameSecret } from "@/lib/otc/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function POST(request:NextRequest){
  const secret=process.env.OTC_SERVICE_SECRET;
  if(!secret||!sameSecret(request.headers.get("authorization")??"",`Bearer ${secret}`))return json({error:"Unauthorized."},401);
  try{const result=await drainWork();return json(result,result.failed>0?503:200);}catch{return json({error:"Settlement worker unavailable."},503);}
}
