import { NextRequest, NextResponse } from "next/server";
import {exportOrigin} from "./lib/key-export/policy";

function compact(parts: string[]) {
  return parts.join("; ");
}

function policy(request: NextRequest, nonce?: string) {
  const development = process.env.NODE_ENV !== "production";
  let convexConnections="";
  try {
    const endpoint=new URL(process.env.NEXT_PUBLIC_CONVEX_URL??"");
    if(endpoint.protocol==="https:")convexConnections=` ${endpoint.origin} wss://${endpoint.host}`;
  } catch { /* No public Convex endpoint is configured. */ }
  const strictScripts = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`
    : `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`;
  return compact([
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    strictScripts,
    // Retain inline styles for the small first-paint stylesheet in RootLayout.
    // Script execution is nonce protected on wallet-sensitive routes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${convexConnections}${development ? " http: https: ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.geckoterminal.com",
    "form-action 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
  ]);
}

function isSensitivePage(pathname: string) {
  return pathname === "/wallet" || pathname === "/otc" || pathname.startsWith("/otc/") || pathname === "/terminal" || pathname === "/votes" || pathname.startsWith("/votes/") || pathname.startsWith("/wallet/") || pathname.startsWith("/launch/");
}

export function middleware(request: NextRequest) {
  const exportMode=process.env.WALLET_EXPORT_RUNTIME;
  let keyOrigin:string|undefined;
  try{keyOrigin=exportOrigin();}catch{/* Misconfiguration must not expose export routes. */}
  const onKeyHost=!!keyOrigin&&request.nextUrl.origin===keyOrigin;
  const keyPath=/^\/api\/key-export(?:\/(?:view|script|callback))?$/.test(request.nextUrl.pathname);
  const notFound=()=>new NextResponse("Not found",{status:404,headers:{"cache-control":"no-store"}});
  if(exportMode==="broker"||onKeyHost){
    if(!["broker","shared"].includes(exportMode??"")||!onKeyHost||!keyPath)return notFound();
    return NextResponse.next();
  }
  // The ordinary website and Vercel preview domains never serve the reveal API.
  if(request.nextUrl.pathname==="/api/key-export"||request.nextUrl.pathname.startsWith("/api/key-export/"))return notFound();
  if(request.headers.has("next-router-prefetch")||request.headers.get("purpose")==="prefetch"||/^\/(?:api(?:\/|$)|_next\/(?:static|image)|favicon|arcbot\.png|arcbot-banner\.png|x-logo\.png|x\.webp)/.test(request.nextUrl.pathname))return NextResponse.next();
  const nonce = isSensitivePage(request.nextUrl.pathname)
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : undefined;
  const csp = policy(request, nonce);
  const requestHeaders = new Headers(request.headers);
  if (nonce) requestHeaders.set("x-nonce", nonce);
  else requestHeaders.delete("x-nonce");
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const reportOnly = process.env.CSP_REPORT_ONLY === "true";
  response.headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/:path*"],
};
