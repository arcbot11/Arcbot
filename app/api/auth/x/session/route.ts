import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readWebWalletSession, terminalReauthAt, webWalletCsrfToken, WEB_WALLET_SESSION_COOKIE } from "@/lib/web-wallet-session";
import { ConvexHttpClient } from "convex/browser";
import { checkWebSession } from "@/lib/web-session-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.WEB_AUTH_SECRET;
  const session = secret ? readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, secret) : null;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const active = session && convexUrl ? await checkWebSession(new ConvexHttpClient(convexUrl), secret!, session).catch(() => false) : false;
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
  if (session && secret && convexUrl) {
    const revoked = await checkWebSession(new ConvexHttpClient(convexUrl), secret, session, true).then(() => true).catch(() => false);
    if (!revoked) return NextResponse.json({ error: "Sign out could not be completed" }, { status: 503, headers:{"cache-control":"no-store"} });
  }
  const response = NextResponse.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(WEB_WALLET_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
