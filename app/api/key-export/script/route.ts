import {brokerConfiguration} from "@/lib/key-export/broker";
import {browserBundle} from "@/lib/key-export/browser-bundle";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{brokerConfiguration(request);return new Response(browserBundle,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
  catch{return new Response("Unavailable",{status:404});}
}
