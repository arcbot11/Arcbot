import {createHash,createPublicKey,verify,createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {ARC_BOT_TELEGRAM_USER_ID} from "../project-config";
import {EXPORT_TTL_MS} from "./policy";
export const digest=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
export function validateExportKey(value:string){
  if(value.length>1200||! /^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error("Invalid encryption key.");
  const bytes=Buffer.from(value,"base64"),key=createPublicKey({key:bytes,format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="rsa"||key.asymmetricKeyDetails?.modulusLength!==4096||key.asymmetricKeyDetails?.publicExponent!==65537n||!key.export({type:"spki",format:"der"}).equals(bytes))throw Error("Invalid encryption key.");
  return digest(bytes);
}
const TELEGRAM_PUBLIC_KEY="e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d";
export function verifyTelegramExport(data:string,now=Date.now()){
  if(!data||data.length>12000)throw Error("Open export from the Telegram bot.");
  const params=new URLSearchParams(data),seen=new Set<string>();
  for(const [name] of params){if(seen.has(name))throw Error("Invalid Telegram proof.");seen.add(name);}
  const signature=params.get("signature"),date=params.get("auth_date");
  if(!signature||! /^[A-Za-z0-9_-]+={0,2}$/.test(signature)||!date||! /^\d{1,12}$/.test(date))throw Error("Telegram signature is required.");
  const at=Number(date)*1000;
  if(at>now+30_000||now-at>EXPORT_TTL_MS)throw Error("Telegram verification expired. Reopen export.");
  const signed=Array.from(params).filter(([name])=>name!=="hash"&&name!=="signature").sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join("\n");
  const message=`${ARC_BOT_TELEGRAM_USER_ID}:WebAppData\n${signed}`;
  const key=createPublicKey({key:Buffer.from("302a300506032b6570032100"+TELEGRAM_PUBLIC_KEY,"hex"),format:"der",type:"spki"});
  const sig=Buffer.from(signature,"base64url");
  if(sig.length!==64||!verify(null,Buffer.from(message),key,sig))throw Error("Telegram identity could not be verified.");
  const user=JSON.parse(params.get("user")??"null") as {id?:unknown;is_bot?:unknown}|null;
  if(!user||!Number.isSafeInteger(user.id)||Number(user.id)<=0||user.is_bot===true)throw Error("Invalid Telegram identity.");
  return {userId:String(user.id),proofHash:digest(message),authenticatedAt:at};
}
function sealKey(secret:string){if(secret.length<32)throw Error("Export service is not configured.");return createHash("sha256").update(`argos-key-export:${secret}`).digest();}
export function seal(value:string,secret:string,purpose="legacy"){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",sealKey(secret),iv);cipher.setAAD(Buffer.from(`argos-export:${purpose}`));const body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString("base64url");}
export function unseal(value:string,secret:string,purpose="legacy"){const raw=Buffer.from(value,"base64url"),decipher=createDecipheriv("aes-256-gcm",sealKey(secret),raw.subarray(0,12));decipher.setAAD(Buffer.from(`argos-export:${purpose}`));decipher.setAuthTag(raw.subarray(12,28));return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString("utf8");}
