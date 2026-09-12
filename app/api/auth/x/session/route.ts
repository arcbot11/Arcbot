import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readWebWalletSession, terminalReauthAt, webWalletCsrfToken, WEB_WALLET_SESSION_COOKIE } from "@/lib/web-wallet-session";
import { ConvexHttpClient } from "convex/browser";
import { checkWebSession } from "@/lib/web-session-authority";
import { browserHash, hashAuth } from "@/lib/web-browser-auth";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.WEB_AUTH_SECRET;
  const session = secret ? readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, secret) : null;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  let active = false;
  try {
    active = session && convexUrl ? await checkWebSession(new ConvexHttpClient(convexUrl), secret!, session, false, browserHash(request, secret!)) : false;
  } catch {
    // A temporary backend failure is not evidence that the account signed out.
    return NextResponse.json({error:"Session check unavailable."},{status:503,headers:{"cache-control":"no-store"}});
  }
  return NextResponse.json(active && session ? {
    authenticated: true,
    provider: session.provider ?? "x",
    username: session.username,
    walletAddress: session.walletAddress,
    expiresAt: session.expiresAt,
    reauthAt: terminalReauthAt(session.authenticatedAt),
    csrfToken: webWalletCsrfToken(session.sessionId, secret!),
  } : { authenticated: false }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site || request.headers.get("origin") !== new URL(site).origin)
    return NextResponse.json({error:"Invalid request origin"},{status:403,headers:{"cache-control":"no-store"}});
  const secret = process.env.WEB_AUTH_SECRET;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const session = secret ? readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, secret) : null;
  if(session && secret){
    const supplied=Buffer.from(request.headers.get("x-argus-csrf")??""), expected=Buffer.from(webWalletCsrfToken(session.sessionId,secret));
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return NextResponse.json({error:"Invalid session token"},{status:403,headers:{"cache-control":"no-store"}});
    if(!convexUrl)return NextResponse.json({error:"Sign out could not be completed"},{status:503,headers:{"cache-control":"no-store"}});
  }
  const family = secret ? browserHash(request, secret) : null;
  if (family) {
    if (!secret || !convexUrl) return NextResponse.json({ error: "Sign out could not be completed" }, { status: 503 });
    const invalidated = await new ConvexHttpClient(convexUrl).mutation(api.webAuth.logout, { secret, browserHash: family, ...(session ? { previousSessionHash: hashAuth(session.sessionId) } : {}) }).then(() => true).catch(() => false);
    if (!invalidated) return NextResponse.json({ error: "Sign out could not be completed" }, { status: 503 });
  }
  if (session && secret && convexUrl) {
    const revoked = await checkWebSession(new ConvexHttpClient(convexUrl), secret, session, true).then(() => true).catch(() => false);
    if (!revoked) return NextResponse.json({ error: "Sign out could not be completed" }, { status: 503, headers:{"cache-control":"no-store"} });
  }
  const response = NextResponse.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
  response.cookies.set("argos_tg_web_login", "", { httpOnly: true, path: "/api/auth/telegram", maxAge: 0 });
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("argos_oauth_") || ["argus_x_oauth_state", "argus_x_oauth_verifier", "argus_x_oauth_return", "argus_telegram_link"].includes(cookie.name)) response.cookies.set(cookie.name, "", { httpOnly: true, path: "/api/auth/x", maxAge: 0 });
  }
  response.cookies.set(WEB_WALLET_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
