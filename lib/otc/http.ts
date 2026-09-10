import { timingSafeEqual } from "node:crypto";
import { getAddress } from "viem";
import { repository } from "./repository";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { readWebWalletSession, WEB_WALLET_SESSION_COOKIE, webWalletCsrfToken, TERMINAL_RECENT_AUTH_SECONDS } from "../web-wallet-session";
export function sameSecret(a:string,b:string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export class WebError extends Error { constructor(message:string,public status=400){super(message);} }
export async function websiteSession(request:NextRequest,write=false) {
  const secret=process.env.WEB_AUTH_SECRET, url=process.env.NEXT_PUBLIC_CONVEX_URL;
  const session=secret?readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value,secret):null;
  if(!secret||!url||!session) throw new WebError("Connect your account first.",401);
  const active=await new ConvexHttpClient(url).action(api.wallets.verifyWebSession,{secret,sessionId:session.sessionId,ownerXUserId:session.xUserId});
  if(!active) throw new WebError("Reconnect your account.",401);
  if(write){
    const site=process.env.NEXT_PUBLIC_SITE_URL;
    if(!site || request.headers.get("origin")!==new URL(site).origin) throw new WebError("Invalid request origin.",403);
    if(!sameSecret(request.headers.get("x-argus-csrf")??"",webWalletCsrfToken(session.sessionId,secret))) throw new WebError("Invalid session token.",403);
    if(Math.floor(Date.now()/1000)-session.authenticatedAt>=TERMINAL_RECENT_AUTH_SECONDS) throw new WebError("Reconnect before moving funds.",401);
    if(!await repository().identity(session.xUserId,session.walletAddress))throw new WebError("Wallet ownership or active status could not be verified.",403);
  }
  return {...session,walletAddress:getAddress(session.walletAddress)};
}
export const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
export function webFailure(error:unknown) {
  if(error instanceof WebError) return json({error:error.message},error.status);
  const original=error instanceof Error?error.message:"";
  const message=(/Uncaught Error: ([^\n]+)/.exec(original)?.[1] ?? original).trim();
  console.error("otc_request_failed",message);
  const safe=/^(Minimum |Maximum |Enter a premium|Use a positive|Amount |You |Not enough |Listing |Quote |Order not found|Wallet has |A wallet transaction|Balance snapshot|Seller |Gas exceeded|Transaction exceeds|Not enough available|OTC trading is not enabled)/.test(message)&&!message.includes("http");
  return json({error:safe?message.slice(0,240):"Request could not be confirmed. Check order or transaction history before retrying."},400);
}
