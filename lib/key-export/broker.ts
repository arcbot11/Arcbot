import {ConvexHttpClient} from "convex/browser";
import {makeFunctionReference} from "convex/server";
import {generateJwt,generateWalletJwt} from "@coinbase/cdp-sdk/auth";
import {exportOrigin,exportAddress} from "./policy";
import {validateExportKey} from "./crypto";
import {exportFail} from "./errors";

export function brokerConfiguration(request:Request){
  const origin=exportOrigin();
  const mode=process.env.WALLET_EXPORT_RUNTIME;
  if(!["broker","shared"].includes(mode??"")||process.env.WALLET_EXPORT_ENABLED!=="true"||new URL(request.url).origin!==origin)throw Error("Key export is unavailable.");
  // This deployment must not also be able to execute ordinary wallet commands.
  if(mode==="broker"&&["WEB_AUTH_SECRET","OTC_SERVICE_SECRET","WALLET_SIGNER_TOKEN","CDP_API_KEY_ID","CDP_API_KEY_SECRET","CDP_WALLET_SECRET","TELEGRAM_BOT_TOKEN"].some(name=>Boolean(process.env[name])))throw Error("Export deployment credentials must be isolated.");
  const secret=process.env.WALLET_EXPORT_SERVICE_SECRET,url=process.env.NEXT_PUBLIC_CONVEX_URL;
  if(!secret||secret.length<32||!url||[process.env.WEB_AUTH_SECRET,process.env.OTC_SERVICE_SECRET,process.env.WALLET_SIGNER_TOKEN].includes(secret))throw Error("Export service is not configured.");
  return {origin,secret,url};
}
// Shared hosting explicitly reuses one complete credential set. Never combine
// a partially configured export credential with ordinary signing credentials.
export function exportCredentials(){
  const dedicated=[process.env.WALLET_EXPORT_CDP_API_KEY_ID,process.env.WALLET_EXPORT_CDP_API_KEY_SECRET,process.env.WALLET_EXPORT_CDP_WALLET_SECRET];
  const values=dedicated.some(Boolean)||process.env.WALLET_EXPORT_RUNTIME!=="shared"?dedicated:[process.env.CDP_API_KEY_ID,process.env.CDP_API_KEY_SECRET,process.env.CDP_WALLET_SECRET];
  if(values.some(value=>!value))exportFail("UNAVAILABLE");
  return {apiKeyId:values[0]!,apiKeySecret:values[1]!,walletSecret:values[2]!};
}
export function exportXCredentials(){
  const dedicated=[process.env.WALLET_EXPORT_X_CLIENT_ID,process.env.WALLET_EXPORT_X_CLIENT_SECRET];
  const values=dedicated.some(Boolean)||process.env.WALLET_EXPORT_RUNTIME!=="shared"?dedicated:[process.env.X_OAUTH_CLIENT_ID,process.env.X_OAUTH_CLIENT_SECRET];
  if(values.some(value=>!value))exportFail("UNAVAILABLE");
  return {clientId:values[0]!,secret:values[1]!};
}
export async function exportCommand<T>(name:string,args:Record<string,unknown>,config:{url:string;secret:string}):Promise<T>{
  return new ConvexHttpClient(config.url).mutation(makeFunctionReference<"mutation">(`walletExports:${name}`),{secret:config.secret,...args}) as Promise<T>;
}
async function jsonResponse(response:Response){
  if(!response.ok)exportFail("PROVIDER_RETRY");
  const reader=response.body?.getReader();if(!reader)throw Error("Provider returned no response.");
  const pieces:Uint8Array[]=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384){await reader.cancel();throw Error("Provider response was invalid.");}pieces.push(value);}
  return JSON.parse(Buffer.concat(pieces).toString("utf8")) as Record<string,unknown>;
}
export async function encryptedCdpExport(input:{address:string;projectId:string;cdpAccountName:string;publicKey:string;exportId:string},fetcher:typeof fetch=fetch){
  validateExportKey(input.publicKey);
  if(input.projectId!==process.env.WALLET_EXPORT_CDP_PROJECT_ID||! /^(?:arcbot-rh|argos-tg)-[a-f0-9]{25}$/.test(input.cdpAccountName)||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.exportId))exportFail("ELIGIBILITY");
  const address=exportAddress(input.address),{apiKeyId,apiKeySecret,walletSecret}=exportCredentials();
  const host="api.cdp.coinbase.com",accountPath=`/platform/v2/evm/accounts/by-name/${encodeURIComponent(input.cdpAccountName)}`;
  const bearer=await generateJwt({apiKeyId,apiKeySecret,requestMethod:"GET",requestHost:host,requestPath:accountPath});
  const lookup=await fetcher(`https://${host}${accountPath}`,{headers:{authorization:`Bearer ${bearer}`},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(lookup.status===401||lookup.status===403)exportFail("CDP_LOOKUP_AUTH");if(lookup.status===404)exportFail("ELIGIBILITY");
  const account=await jsonResponse(lookup);
  if(typeof account.address!=="string"||exportAddress(account.address)!==address||account.name!==input.cdpAccountName)exportFail("ELIGIBILITY");
  // CDP routes are case-sensitive. Only normalize comparisons, never its returned address.
  const path=`/platform/v2/evm/accounts/${account.address}/export`,body={exportEncryptionKey:input.publicKey};
  const [jwt,walletJwt]=await Promise.all([generateJwt({apiKeyId,apiKeySecret,requestMethod:"POST",requestHost:host,requestPath:path}),generateWalletJwt({walletSecret,requestMethod:"POST",requestHost:host,requestPath:path,requestData:body})]);
  const exported=await fetcher(`https://${host}${path}`,{method:"POST",headers:{authorization:`Bearer ${jwt}`,"X-Wallet-Auth":walletJwt,"X-Idempotency-Key":input.exportId,"content-type":"application/json"},body:JSON.stringify(body),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(exported.status===401||exported.status===403)exportFail("CDP_EXPORT_AUTH");
  const result=await jsonResponse(exported);
  if(typeof result.encryptedPrivateKey!=="string"||! /^[A-Za-z0-9+/]+={0,2}$/.test(result.encryptedPrivateKey)||Buffer.from(result.encryptedPrivateKey,"base64").length!==512)throw Error("CDP export response was invalid.");
  return {encryptedPrivateKey:result.encryptedPrivateKey,address};
}
export async function xExportToken(code:string,verifier:string,origin:string,fetcher:typeof fetch=fetch){
  const {clientId,secret}=exportXCredentials();
  const token=await jsonResponse(await fetcher("https://api.x.com/2/oauth2/token",{method:"POST",headers:{authorization:`Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:clientId,code,code_verifier:verifier,redirect_uri:`${origin}/api/key-export/callback`}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)}));
  if(typeof token.access_token!=="string")throw Error("X sign-in could not be verified.");
  return token.access_token;
}
export async function xExportIdentity(accessToken:string,fetcher:typeof fetch=fetch){
  const me=await jsonResponse(await fetcher("https://api.x.com/2/users/me",{headers:{authorization:`Bearer ${accessToken}`},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)}));
  const user=me.data as {id?:unknown}|undefined;
  if(!user||typeof user.id!=="string"||! /^\d{1,30}$/.test(user.id))throw Error("X identity could not be verified.");
  return user.id;
}
