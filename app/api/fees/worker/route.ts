import { sameSecret,json } from "@/lib/otc/http";
import { boundedJson } from "@/lib/bounded-json";
import { z } from "zod";
import { runFeeJob } from "@/lib/fee-report/execution";
import {runFeeHistory} from "@/lib/fee-report/history-service";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request) {
  const secret=process.env.OTC_SERVICE_SECRET;
  if(!secret||!sameSecret(request.headers.get("authorization")??"",`Bearer ${secret}`))return json({error:"Unauthorized"},401);
  try{const {id}=z.object({id:z.string().regex(/^(fee:[a-zA-Z0-9:_-]{1,176}|fee-history:0x[0-9a-f]{40})$/)}).strict().parse(await boundedJson(request,1024));return json(await (id.startsWith("fee-history:")?runFeeHistory:runFeeJob)(id));}
  catch{return json({pending:true,error:"Fee workflow needs retry or operator attention. No new request is necessary."},503);}
}
