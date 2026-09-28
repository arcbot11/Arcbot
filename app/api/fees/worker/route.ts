import { sameSecret,json } from "@/lib/otc/http";
import { boundedJson } from "@/lib/bounded-json";
import { z } from "zod";
import { runFeeJob } from "@/lib/fee-report/execution";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request) {
  const secret=process.env.OTC_SERVICE_SECRET;
  if(!secret||!sameSecret(request.headers.get("authorization")??"",`Bearer ${secret}`))return json({error:"Unauthorized"},401);
  try{const {id}=z.object({id:z.string().regex(/^fee:[a-zA-Z0-9:_-]{1,176}$/)}).strict().parse(await boundedJson(request,1024));return json(await runFeeJob(id));}
  catch{return json({pending:true,error:"Fee workflow needs retry or operator attention. No new request is necessary."},503);}
}
