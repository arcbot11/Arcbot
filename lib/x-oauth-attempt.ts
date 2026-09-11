import {createHmac,timingSafeEqual} from "node:crypto";

export type OAuthAttempt={verifier:string;returnTo:string;telegramLink?:string;expiresAt:number};
export const oauthCookieName=(state:string)=>/^v2_[A-Za-z0-9_-]{43}$/.test(state)?`argos_oauth_${state}`:null;
function seal(value:unknown,secret:string,purpose:string){const data=Buffer.from(JSON.stringify(value)).toString("base64url");return `${data}.${createHmac("sha256",secret).update(`${purpose}:${data}`).digest("base64url")}`;}
function unseal(value:string|undefined,secret:string,purpose:string):unknown{
  try{const [data,signature,extra]=(value??"").split(".");const expected=createHmac("sha256",secret).update(`${purpose}:${data}`).digest("base64url");
    if(extra||!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
    return JSON.parse(Buffer.from(data,"base64url").toString());
  }catch{return null;}
}
export const sealOAuthAttempt=(attempt:OAuthAttempt,secret:string)=>seal(attempt,secret,"x-oauth-attempt");
export function readOAuthAttempt(value:string|undefined,secret:string):OAuthAttempt|null{
  const a=unseal(value,secret,"x-oauth-attempt") as OAuthAttempt|null;
  return a&&typeof a.verifier==="string"&&typeof a.returnTo==="string"&&a.expiresAt>Date.now()&&(!a.telegramLink||/^[a-f0-9]{64}$/.test(a.telegramLink))?a:null;
}
export function telegramRetryToken(nonce:string,secret:string){return seal({nonce,expiresAt:Date.now()+600_000},secret,"telegram-login-retry");}
export function readTelegramRetry(value:string|undefined,secret:string){const a=unseal(value,secret,"telegram-login-retry") as {nonce?:string;expiresAt?:number}|null;return a&&typeof a.nonce==="string"&&/^[a-f0-9]{64}$/.test(a.nonce)&&(a.expiresAt??0)>Date.now()?a.nonce:null;}
// Stable for retries of the same authenticated identity and original Telegram nonce.
export const telegramReturnToken=(nonce:string,owner:string,secret:string)=>createHmac("sha256",secret).update(`telegram-return:${nonce}:${owner}`).digest("hex").slice(0,32);
