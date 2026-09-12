import { timingSafeEqual } from "node:crypto";
import { getAddress } from "viem";
import { repository } from "./repository";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { checkWebSession } from "../web-session-authority";
import { webSessionOwner } from "../web-wallet-session";
import { readWebWalletSession, WEB_WALLET_SESSION_COOKIE, webWalletCsrfToken, TERMINAL_RECENT_AUTH_SECONDS } from "../web-wallet-session";
export function sameSecret(a:string,b:string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export class WebError extends Error { constructor(message:string,public status=400){super(message);} }
export async function websiteSession(request:NextRequest,write=false) {
  const secret=process.env.WEB_AUTH_SECRET, url=process.env.NEXT_PUBLIC_CONVEX_URL;
  const session=secret?readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value,secret):null;
  if(!secret||!url||!session) throw new WebError("Connect your account first.",401);
  const active=await checkWebSession(new ConvexHttpClient(url),secret,session);
  if(!active) throw new WebError("Reconnect your account.",401);
  if(write){
    const site=process.env.NEXT_PUBLIC_SITE_URL;
    if(!site || request.headers.get("origin")!==new URL(site).origin) throw new WebError("Invalid request origin.",403);
    if(!sameSecret(request.headers.get("x-argus-csrf")??"",webWalletCsrfToken(session.sessionId,secret))) throw new WebError("Invalid session token.",403);
    if(Math.floor(Date.now()/1000)-session.authenticatedAt>=TERMINAL_RECENT_AUTH_SECONDS) throw new WebError("Reconnect before moving funds.",401);
    if(!await repository().identity(webSessionOwner(session),session.walletAddress))throw new WebError("Wallet ownership or active status could not be verified.",403);
  }
  return {...session,owner:webSessionOwner(session),walletAddress:getAddress(session.walletAddress)};
}
export const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
export function webFailure(error:unknown) {
  if(error instanceof WebError) return json({error:error.message},error.status);
  const original=error instanceof Error?error.message:"";
  const message=(/Uncaught Error: ([^\n]+)/.exec(original)?.[1] ?? original).trim();
  console.error("otc_request_failed",message);
  // Fixed messages identify operational failures without exposing credentials or provider URLs.
  if (message.startsWith("Configure ARC_MAINNET_RPC_URL, ARC_CHECKPOINT_NUMBER and ARC_CHECKPOINT_HASH"))
    return json({error:"Arc transaction settings are missing on the website server. Contact Argos Bot support."},503);
  if (/^(CDP_API_KEY_ID|CDP_API_KEY_SECRET|CDP_WALLET_SECRET) is not configured\.$/.test(message))
    return json({error:"Wallet signing is not configured on the website server. Contact Argos Bot support."},503);
  if (message === "OTC storage is not configured." || message === "OTC service authorization failed.")
    return json({error:"Wallet reservation service is unavailable. Contact Argos Bot support."},503);
  if (message.includes("No healthy Arc RPC supports this request"))
    return json({error:"Arc network request failed. Check transaction history before retrying."},503);
  if (message === "No supported liquid Arc route found.")
    return json({error:"No supported trading route has liquidity for this token pair."},400);
  const safe=/^(Minimum |Maximum |Enter a premium|Use a positive|Amount |You |Not enough |Listing |Quote |Order not found|Wallet has |A wallet transaction|Balance snapshot|Seller |Gas exceeded|Transaction exceeds|Not enough available|OTC trading is not enabled)/.test(message)&&!message.includes("http");
  return json({error:safe?message.slice(0,240):"Request could not be confirmed. Check order or transaction history before retrying."},400);
}
