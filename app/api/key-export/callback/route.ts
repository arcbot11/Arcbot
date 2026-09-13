import {NextRequest,NextResponse} from "next/server";
import {brokerConfiguration,exportCommand,xExportIdentity,xExportToken} from "@/lib/key-export/broker";
import {digest,unseal,seal} from "@/lib/key-export/crypto";
import {randomUUID} from "node:crypto";
import {exportBrowserLinks} from "@/lib/key-export/browser-return";
import {ARC_BOT_SITE_URL} from "@/lib/project-config";
import {safeExportError,exportErrors,type ExportErrorCode} from "@/lib/key-export/errors";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function handoff(request:NextRequest,recovery:"browser"|ExportErrorCode="browser"){
  const needsBrowser=recovery==="browser";
  // The callback code is still PKCE-bound. This handoff never carries the export
  // ticket or browser verifier, and cannot authorize without the original cookie.
  const target=new URL("/api/key-export/callback",request.nextUrl.origin);
  for(const name of ["state","code"])target.searchParams.set(name,request.nextUrl.searchParams.get(name)!);
  const escaped=target.href.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;");
  const title=needsBrowser?"Finish verification in browser":"Verification not finished";
  const explanation=needsBrowser?"Open this link in the browser and normal or private mode where you started export.":exportErrors[recovery as ExportErrorCode].message;
  const canRetry=needsBrowser||recovery==="PROVIDER_RETRY"||recovery==="BUSY";
  const actionUrl=canRetry?escaped:recovery==="OAUTH_RESTART"?"/api/key-export/view":ARC_BOT_SITE_URL+"/wallet";
  const actionLabel=needsBrowser?"Finish verification in browser":recovery==="BUSY"?"Retry after 30 seconds":recovery==="PROVIDER_RETRY"?"Retry verification":recovery==="OAUTH_RESTART"?"Verify with X again":"Return to your wallet";
  return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Argos Bot · Finish verification</title></head><body><h1>${title}</h1><p>${explanation}</p>${needsBrowser?exportBrowserLinks(target.origin,request.headers.get("user-agent")??"",target):""}<p><a href="${actionUrl}" rel="noreferrer">${actionLabel}</a></p><p><a href="/api/key-export/view" rel="noreferrer">Return to export</a></p></body></html>`,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
}
export async function GET(request:NextRequest){
  let browserChecked=false,validCallback=false;
  let config:ReturnType<typeof brokerConfiguration>|undefined,args:{ticketHash:string;browserHash:string}|undefined;
  try{
    config=brokerConfiguration(request);const state=request.nextUrl.searchParams.get("state"),code=request.nextUrl.searchParams.get("code");
    if(!state||! /^[a-f0-9]{64}$/.test(state)||!code||code.length>2048||request.nextUrl.searchParams.getAll("state").length!==1||request.nextUrl.searchParams.getAll("code").length!==1)throw Error();
    validCallback=true;
    const pair=request.cookies.get("__Host-argos_export")?.value;
    if(!pair||! /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(pair))return handoff(request);
    const [ticket,verifier]=pair.split(".");args={ticketHash:digest(ticket),browserHash:digest(verifier)};
    const stateHash=digest(state),attempt=randomUUID();
    const grant=await exportCommand<{done:true}|{done:false;ticketHash:string;browserHash:string;encryptedVerifier:string;encryptedToken?:string}>("oauthTake",{...args,stateHash,attempt,codeHash:digest(code)},config);
    browserChecked=true;
    if(!grant.done){
      if(grant.ticketHash!==args.ticketHash||grant.browserHash!==args.browserHash)throw Error("Export browser mismatch.");
      const attemptArgs={...args,stateHash,attempt};
      const token=grant.encryptedToken?unseal(grant.encryptedToken,config.secret,`x-token:${stateHash}:${grant.ticketHash}:${grant.browserHash}`):await xExportToken(code,unseal(grant.encryptedVerifier,config.secret,`x-pkce:${stateHash}`),config.origin);
      if(!grant.encryptedToken)await exportCommand("oauthSaveToken",{...attemptArgs,encryptedToken:seal(token,config.secret,`x-token:${stateHash}:${grant.ticketHash}:${grant.browserHash}`)},config);
      const userId=await xExportIdentity(token);
      await exportCommand("authenticated",{...attemptArgs,provider:"x",userId},config);
    }
    return NextResponse.redirect(`${config.origin}/api/key-export/view`,{headers:{"cache-control":"no-store","referrer-policy":"no-referrer"}});
  }catch(error){
    if(config&&args)try{await exportCommand("failure",{...args,stage:"oauth",code:safeExportError(error,"PROVIDER_RETRY").code},config);}catch{/* Never log the raw provider error. */}
    if(config&&args&&!browserChecked&&safeExportError(error).code==="BROWSER_MISMATCH")return handoff(request);
    if(config&&validCallback)return handoff(request,safeExportError(error,"PROVIDER_RETRY").code);
    // Malformed callback: return without echoing its query parameters.
    return NextResponse.redirect(new URL("/api/key-export/view",request.url),{headers:{"cache-control":"no-store","referrer-policy":"no-referrer"}});
  }
}
