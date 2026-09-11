import { ConvexHttpClient } from "convex/browser";
import { walletReturnPath } from "@/lib/wallet-return-path";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {oauthCookieName,readOAuthAttempt,telegramRetryToken,telegramReturnToken} from "@/lib/x-oauth-attempt";
import { ARC_BOT_TELEGRAM_URL } from "@/lib/project-config";
import { createWebWalletSession, readWebWalletSession, WEB_WALLET_SESSION_COOKIE, WEB_WALLET_SESSION_SECONDS } from "@/lib/web-wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type XToken = { access_token?: string };
type XIdentity = { data?: { id?: string; username?: string; verified?: boolean; verified_type?: string } };

function attemptContext(request:NextRequest){
  const state=request.nextUrl.searchParams.get("state")??"",secret=process.env.WEB_AUTH_SECRET??"";
  const name=oauthCookieName(state);
  if(name)return readOAuthAttempt(request.cookies.get(name)?.value,secret);
  // Let sign-ins started immediately before this deployment finish normally.
  if(state&&state===request.cookies.get("argus_x_oauth_state")?.value)return {verifier:request.cookies.get("argus_x_oauth_verifier")?.value,returnTo:request.cookies.get("argus_x_oauth_return")?.value,telegramLink:request.cookies.get("argus_telegram_link")?.value};
  return null;
}
function clearAttempt(response:NextResponse,request:NextRequest){
  const name=oauthCookieName(request.nextUrl.searchParams.get("state")??"");
  if(name)response.cookies.set(name,"",{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/api/auth/x",maxAge:0});
  response.headers.set("Cache-Control","no-store");
  return response;
}

function errorRedirect(request: NextRequest, reason: string) {
  const target = new URL("/wallet/sign-in-error", request.url);
  target.searchParams.set("reason", reason);
  const context=attemptContext(request);
  if(context?.telegramLink&&/^[a-f0-9]{64}$/.test(context.telegramLink)&&process.env.WEB_AUTH_SECRET){
    target.searchParams.set("retry",telegramRetryToken(context.telegramLink,process.env.WEB_AUTH_SECRET));
    target.searchParams.set("telegram","1");
  }
  console.warn("x_wallet_sign_in_stage_failed",{reason,telegram:Boolean(context?.telegramLink)});
  const response = NextResponse.redirect(target);
  response.cookies.set("argus_x_oauth_state", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
  response.cookies.set("argus_x_oauth_verifier", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
  response.cookies.set("argus_telegram_link", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
  return clearAttempt(response,request);
}

export async function GET(request: NextRequest) {
  const clientId = process.env.X_OAUTH_CLIENT_ID;
  const clientSecret = process.env.X_OAUTH_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const webSecret = process.env.WEB_AUTH_SECRET;
  if (!clientId || !clientSecret || !siteUrl || !convexUrl || !webSecret) return errorRedirect(request, "configuration");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const context=attemptContext(request),verifier=context?.verifier;
  if(request.nextUrl.searchParams.has("error"))return errorRedirect(request,"denied");
  if (!code || !state || !verifier) return errorRedirect(request, "invalid_state");

  let stage="token_exchange";
  try {
    const callback = `${siteUrl.replace(/\/$/, "")}/api/auth/x/callback`;
    const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: callback,
        code_verifier: verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) return errorRedirect(request, "token_exchange");
    const token = await tokenResponse.json() as XToken;
    if (!token.access_token) return errorRedirect(request, "token_exchange");

    stage="identity";
    const identityResponse = await fetch("https://api.x.com/2/users/me?user.fields=verified,verified_type", {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!identityResponse.ok) return errorRedirect(request, "identity");
    const identity = (await identityResponse.json() as XIdentity).data;
    if (!identity?.id || !identity.username) return errorRedirect(request, "identity");

    stage="wallet";
    const wallet = await new ConvexHttpClient(convexUrl).action(api.wallets.provisionWebWallet, {
      secret: webSecret,
      xUserId: identity.id,
      username: identity.username,
      verified: Boolean(identity.verified),
      ...(identity.verified_type ? { verifiedType: identity.verified_type } : {}),
    });
    const telegramLink = context?.telegramLink;
    if (telegramLink && /^[a-f0-9]{64}$/.test(telegramLink)) {
      stage="telegram_link";
      const returnToken=telegramReturnToken(telegramLink,identity.id,webSecret);
      await new ConvexHttpClient(convexUrl).action(api.telegram.stageXLink,{secret:webSecret,nonce:telegramLink,ownerXUserId:identity.id,returnToken});
      const target=new URL(ARC_BOT_TELEGRAM_URL);target.searchParams.set("start","link_"+returnToken);
      const response = NextResponse.redirect(target);
      response.cookies.set("argus_x_oauth_state", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
      response.cookies.set("argus_x_oauth_verifier", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
      response.cookies.set("argus_x_oauth_return", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
      response.cookies.set("argus_telegram_link", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
      // Telegram linking authorizes access inside Telegram; it must not leave
      // an unrelated website wallet session behind in the OAuth browser.
      response.cookies.set(WEB_WALLET_SESSION_COOKIE, "", {
        httpOnly: true, secure: siteUrl.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 0,
      });
      return clearAttempt(response,request);
    }
    stage="session";
    const requestedReturn = context?.returnTo;
    const returnTo = walletReturnPath(requestedReturn);
    const sessionCookie = createWebWalletSession(wallet.address, identity.id, identity.username, webSecret);
    const session = readWebWalletSession(sessionCookie, webSecret);
    if (!session) return errorRedirect(request, "session");
    await new ConvexHttpClient(convexUrl).action(api.wallets.registerWebSession, {
      secret: webSecret, sessionId: session.sessionId, ownerXUserId: session.xUserId, expiresAt: session.expiresAt,
    });
    const response = NextResponse.redirect(new URL(returnTo, siteUrl));
    response.cookies.set("argus_x_oauth_state", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
    response.cookies.set("argus_x_oauth_verifier", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
    response.cookies.set("argus_x_oauth_return", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
    response.cookies.set("argus_telegram_link", "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
    response.cookies.set(WEB_WALLET_SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: siteUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: WEB_WALLET_SESSION_SECONDS,
    });
    return clearAttempt(response,request);
  } catch (error) {
    console.error("x_wallet_sign_in_failed",{stage:"provision_or_link",errorType:error instanceof Error?error.name:"unknown",telegram:Boolean(context?.telegramLink)});
    return errorRedirect(request, stage);
  }
}
