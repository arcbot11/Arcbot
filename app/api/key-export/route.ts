import {randomBytes} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {boundedJson} from "@/lib/bounded-json";
import {brokerConfiguration,exportCommand,encryptedCdpExport,exportXCredentials} from "@/lib/key-export/broker";
import {digest,seal,validateExportKey,verifyTelegramExport} from "@/lib/key-export/crypto";
import {safeExportError,type ExportErrorCode} from "@/lib/key-export/errors";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const cookie="__Host-argos_export";
const schema=z.object({action:z.enum(["claim","status","x","telegram","approve","export","close"]),ticket:z.string().regex(/^[a-f0-9]{64}$/).optional(),verifier:z.string().regex(/^[a-f0-9]{64}$/).optional(),initData:z.string().max(12000).optional(),publicKey:z.string().max(1200).optional(),keyHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),confirmed:z.literal(true).optional(),acknowledged:z.boolean().optional()}).strict();
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"}});
export async function POST(request:NextRequest){
  let fallback:ExportErrorCode="UNAVAILABLE",stage="configuration",auditArgs:{ticketHash:string;browserHash:string}|undefined,config:ReturnType<typeof brokerConfiguration>|undefined;
  try{
    config=brokerConfiguration(request);fallback="AUTHORIZATION";
    if(request.headers.get("origin")!==config.origin)throw Error("Invalid origin.");
    const a=schema.parse(await boundedJson(request,15000));
    const existing=request.cookies.get(cookie)?.value?.split(".");
    let ticket=existing?.[0],verifier=existing?.[1];
    // TG Web may block third-party cookies: its ephemeral verifier stays in this Mini App only.
    const reuseCookie=a.action==="claim"&&a.ticket===ticket&&!!verifier&&/^[a-f0-9]{64}$/.test(verifier);
    if(!reuseCookie&&(a.ticket||a.verifier)){if(!a.ticket||!a.verifier)throw Error();ticket=a.ticket;verifier=a.verifier;}
    if(!ticket||!verifier||! /^[a-f0-9]{64}$/.test(ticket)||! /^[a-f0-9]{64}$/.test(verifier))throw Error("Open a new export request.");
    const args={ticketHash:digest(ticket),browserHash:digest(verifier)};
    auditArgs=args;stage=a.action;
    if(a.action==="claim"){
      const data=await exportCommand<{provider:"x"|"telegram";state:string;address:string;expiresAt:number}>("claim",args,config);
      const response=json({...data,...(reuseCookie?{cookieBound:true}:{})});response.cookies.set(cookie,`${ticket}.${verifier}`,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:300});return response;
    }
    if(a.action==="status")return json(await exportCommand("status",args,config));
    if(a.action==="x"){
      const state=randomBytes(32).toString("hex"),pkce=randomBytes(48).toString("base64url");
      const {clientId}=exportXCredentials();
      await exportCommand("oauthStart",{...args,stateHash:digest(state),encryptedVerifier:seal(pkce,config.secret,`x-pkce:${digest(state)}`)},config);
      const params=new URLSearchParams({response_type:"code",client_id:clientId,redirect_uri:`${config.origin}/api/key-export/callback`,scope:"users.read tweet.read",state,code_challenge:Buffer.from(digest(pkce),"hex").toString("base64url"),code_challenge_method:"S256"});
      return json({url:`https://x.com/i/oauth2/authorize?${params}`});
    }
    if(a.action==="telegram"){
      const proof=verifyTelegramExport(a.initData??"");
      await exportCommand("authenticated",{...args,provider:"telegram",userId:proof.userId,proofHash:proof.proofHash},config);return json({ok:true});
    }
    if(a.action==="approve"){
      if(!a.confirmed||!a.publicKey)throw Error();
      const keyHash=validateExportKey(a.publicKey);
      await exportCommand("approve",{...args,publicKey:a.publicKey,keyHash},config);return json({keyHash});
    }
    if(a.action==="export"){
      if(!a.keyHash)throw Error();
      const input=await exportCommand<{address:string;projectId:string;cdpAccountName:string;publicKey:string;exportId:string}>("begin",{...args,keyHash:a.keyHash},config);
      stage="cdp";fallback="PROVIDER_RETRY";
      const result=await encryptedCdpExport(input);
      stage="relayed";fallback="AUTHORIZATION";
      await exportCommand("relayed",{...args,keyHash:a.keyHash},config);
      return json(result);
    }
    await exportCommand("close",{...args,acknowledged:a.acknowledged===true},config);
    const response=json({ok:true});response.cookies.set(cookie,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});return response;
  }catch(error){
    // Never log provider errors, bodies, OAuth codes or ciphertext.
    const safe=safeExportError(error,fallback);
    if(config&&auditArgs)try{await exportCommand("failure",{...auditArgs,stage,code:safe.code},config);}catch{/* Audit outage must not expose the underlying error. */}
    return json({code:safe.code,error:safe.message},safe.status);
  }
}
