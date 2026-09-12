import { createHash, randomBytes } from "node:crypto";
import {oauthCookieName,sealOAuthAttempt,readTelegramRetry,oauthBrowserHint} from "@/lib/x-oauth-attempt";
import { walletReturnPath } from "@/lib/wallet-return-path";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { browserHash, browserValue, setBrowserCookie, loginSourceHash, hashAuth } from "@/lib/web-browser-auth";
import { checkWebSession } from "@/lib/web-session-authority";
import { readWebWalletSession, WEB_WALLET_SESSION_COOKIE, TERMINAL_RECENT_AUTH_SECONDS } from "@/lib/web-wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function base64url(value: Buffer) {
  return value.toString("base64url");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.X_OAUTH_CLIENT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const webSecret = process.env.WEB_AUTH_SECRET;
  if (!clientId || !siteUrl || !convexUrl || !webSecret) return NextResponse.json({ error: "X wallet sign-in is not configured" }, { status: 503 });

  // Set host-only OAuth cookies on the same origin as the registered callback.
  if(request.nextUrl.origin!==new URL(siteUrl).origin){
    return NextResponse.redirect(new URL(request.nextUrl.pathname+request.nextUrl.search,siteUrl));
  }
  const session = readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, webSecret);
  const requestedReturn = request.nextUrl.searchParams.get("returnTo");
  if(request.nextUrl.searchParams.has("retry")&&!readTelegramRetry(request.nextUrl.searchParams.get("retry")??undefined,webSecret)){
    return NextResponse.redirect(new URL("/wallet/sign-in-error?reason=telegram_expired&telegram=1",siteUrl));
  }
  const telegramLink = readTelegramRetry(request.nextUrl.searchParams.get("retry")??undefined,webSecret) || request.nextUrl.searchParams.get("telegramLink");
  const validTelegramLink = telegramLink && /^[a-f0-9]{64}$/.test(telegramLink) ? telegramLink : null;
  const returnTo = walletReturnPath(requestedReturn);
  // Telegram account linking must always pass through X authorization. Reusing
  // a website session here can bind the Telegram nonce to a stale or different
  // X identity, and can make relinking fail before the nonce is consumed.
  if (session && session.provider !== "telegram" && !validTelegramLink) {
    const active = await checkWebSession(new ConvexHttpClient(convexUrl), webSecret, session, false, browserHash(request, webSecret)).catch(() => false);
    if (active && Math.floor(Date.now()/1000)-session.authenticatedAt < TERMINAL_RECENT_AUTH_SECONDS) {
      const family = browserHash(request, webSecret);
      const kept = !family || await new ConvexHttpClient(convexUrl).mutation(api.webAuth.keepSession, { secret: webSecret, browserHash: family, sessionIdHash: hashAuth(session.sessionId) }).catch(() => false);
      if (kept) {
        const response = NextResponse.redirect(new URL(returnTo, siteUrl));
        response.cookies.set("argos_tg_web_login", "", { httpOnly: true, path: "/api/auth/telegram", maxAge: 0 });
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
    }
  }

  if(validTelegramLink){
    const valid=await new ConvexHttpClient(convexUrl).action(api.telegram.previewLink,{secret:webSecret,nonce:validTelegramLink}).catch(()=>undefined);
    if(!valid){const target=new URL("/wallet/sign-in-error",siteUrl);target.searchParams.set("reason",valid===undefined?"link_check":"telegram_expired");target.searchParams.set("telegram","1");return NextResponse.redirect(target);}
  }
  const state = "v3_"+oauthBrowserHint(request.headers.get("user-agent")??"")+"_"+base64url(randomBytes(32));
  let family: string | null = null, generation: number | undefined;
  if (!validTelegramLink) {
    family = browserHash(request, webSecret);
    if (!family) {
      const response = NextResponse.redirect(request.nextUrl);
      setBrowserCookie(response, browserValue(webSecret), new URL(siteUrl).protocol === "https:");
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    try {
      const begun = await new ConvexHttpClient(convexUrl).mutation(api.webAuth.begin, { secret: webSecret, browserHash: family, sourceHash: loginSourceHash(request, webSecret), ...(session ? { previousSessionHash: hashAuth(session.sessionId) } : {}) });
      generation = begun.generation;
    } catch (error) {
      const limited = error instanceof Error && error.message.includes("Sign-in limit reached");
      return NextResponse.json({ error: limited ? "Sign-in limit reached. Try again in a minute." : "Sign-in unavailable. Try again." }, { status: limited ? 429 : 503, headers: { "cache-control": "no-store" } });
    }
  }
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const callback = `${siteUrl.replace(/\/$/, "")}/api/auth/x/callback`;
  const authorize = new URL("https://x.com/i/oauth2/authorize");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "users.read tweet.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(authorize);
  const secure = callback.startsWith("https://");
  const cookie = { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/auth/x", maxAge: 10 * 60 };
  response.cookies.set(oauthCookieName(state)!,sealOAuthAttempt({verifier,returnTo,...(validTelegramLink?{telegramLink:validTelegramLink}:{}),...(family ? { browserFamily: family, generation } : {}),expiresAt:Date.now()+600_000},webSecret),cookie);
  response.headers.set("Cache-Control","no-store");
  // A cryptographically valid cookie may refer to a revoked or missing Convex
  // session. Remove it before starting OAuth so it cannot cause a redirect loop.
  if (session && !validTelegramLink && !await checkWebSession(new ConvexHttpClient(convexUrl), webSecret, session, false, family).catch(() => false)) response.cookies.set(WEB_WALLET_SESSION_COOKIE, "", {
    httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0,
  });
  return response;
}
