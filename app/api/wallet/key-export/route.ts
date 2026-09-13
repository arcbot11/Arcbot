import {createHmac,createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {ConvexHttpClient} from "convex/browser";
import {makeFunctionReference} from "convex/server";
import {websiteSession} from "@/lib/otc/http";
import {boundedJson} from "@/lib/bounded-json";
import {exportOrigin} from "@/lib/key-export/policy";
import {safeExportError,exportFail} from "@/lib/key-export/errors";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  const unavailable=()=>NextResponse.json({eligible:false},{headers:{"cache-control":"no-store"}});
  try{
    if(process.env.WALLET_EXPORT_ENABLED!=="true"||process.env.WALLET_EXPORT_RUNTIME==="broker")return unavailable();
    const session=await websiteSession(request,false,false);
    const result=await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).query(makeFunctionReference<"query">("walletExports:eligibility"),{secret:process.env.WEB_AUTH_SECRET!,provider:session.provider==="telegram"?"telegram":"x",userId:session.provider==="telegram"?session.telegramUserId:session.xUserId});
    return NextResponse.json(result,{headers:{"cache-control":"no-store"}});
  }catch{return unavailable();}
}
export async function POST(request:NextRequest){
  try{
    if(process.env.WALLET_EXPORT_ENABLED!=="true"||process.env.WALLET_EXPORT_RUNTIME==="broker")exportFail("UNAVAILABLE");
    const session=await websiteSession(request,true,false);
    if(session.provider==="telegram"||!session.browserFamily)throw Error();
    const body=await boundedJson(request,256) as {attemptId?:unknown};
    if(!body||typeof body.attemptId!=="string"||! /^[a-f0-9-]{36}$/.test(body.attemptId))exportFail("AUTHORIZATION");
    const hash=(s:string)=>createHash("sha256").update(s).digest("hex"),origin=exportOrigin(),secret=process.env.WEB_AUTH_SECRET;
    if(!secret||secret.length<32)exportFail("UNAVAILABLE");
    // Stable only for this authenticated browser/session and this explicit attempt.
    // No bearer ticket needs to be stored in Convex, logs, or browser storage.
    const ticket=createHmac("sha256",secret).update(JSON.stringify(["x-export-delivery-v1",body.attemptId,session.xUserId,hash(session.sessionId),session.browserFamily])).digest("hex");
    await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).mutation(makeFunctionReference<"mutation">("walletExports:startX"),{secret:process.env.WEB_AUTH_SECRET!,ticketHash:hash(ticket),userId:session.xUserId,sessionHash:hash(session.sessionId),browserFamily:session.browserFamily});
    return NextResponse.json({url:`${origin}/api/key-export/view#${ticket}`},{headers:{"cache-control":"no-store","referrer-policy":"no-referrer"}});
  }catch(error){const safe=safeExportError(error);return NextResponse.json({code:safe.code,error:safe.message},{status:safe.status,headers:{"cache-control":"no-store"}});}
}
