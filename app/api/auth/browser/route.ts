import { NextRequest, NextResponse } from "next/server";
import { browserHash, browserValue, setBrowserCookie } from "@/lib/web-browser-auth";
export async function POST(request: NextRequest) {
  const secret = process.env.WEB_AUTH_SECRET, site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !site) return NextResponse.json({ error: "Sign-in unavailable." }, { status: 503 });
  if (request.headers.get("origin") !== new URL(site).origin || request.nextUrl.origin !== new URL(site).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const response = NextResponse.json({ ready: true }, { headers: { "cache-control": "no-store" } });
  if (!browserHash(request, secret)) setBrowserCookie(response, browserValue(secret), new URL(site).protocol === "https:");
  return response;
}
