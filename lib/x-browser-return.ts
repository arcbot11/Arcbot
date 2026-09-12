import { NextRequest, NextResponse } from "next/server";
import { oauthCookieName } from "./x-oauth-attempt";

const escape = (s:string) => s.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");

/** Return an unused OAuth code to the browser holding its PKCE/state cookie.
 * This page never exchanges the code, creates a session, or transfers cookies.
 */
export function xBrowserReturn(request:NextRequest,siteUrl:string) {
  const state=request.nextUrl.searchParams.get("state")??"",code=request.nextUrl.searchParams.get("code");
  const cookie=oauthCookieName(state),ua=request.headers.get("user-agent")??"";
  if(!cookie||!code||code.length>2048||request.cookies.has(cookie)||request.nextUrl.searchParams.has("browserReturn")||request.nextUrl.searchParams.has("error"))return null;
  const android=/Android/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua);
  if(!android&&!ios)return null;
  const callback=new URL("/api/auth/x/callback",siteUrl);
  if(callback.protocol!=="https:")return null;
  callback.search=new URLSearchParams({state,code,browserReturn:"1"}).toString();
  const firefox=android?`intent://${callback.host}${callback.pathname}${callback.search}#Intent;scheme=https;package=org.mozilla.firefox;end`:`firefox://open-url?url=${encodeURIComponent(callback.href)}`;
  const chrome=android?`intent://${callback.host}${callback.pathname}${callback.search}#Intent;scheme=https;package=com.android.chrome;end`:`googlechromes://${callback.host}${callback.pathname}${callback.search}`;
  const hint=/^v3_(ff|ch|other)_/.exec(state)?.[1];
  const target=hint==="ff"?firefox:hint==="ch"?chrome:null;
  const buttons=target?`<p><a href="${escape(target)}" rel="noreferrer">Finish sign-in in browser</a></p>`:`<p>Choose the browser where you started:</p><p><a href="${escape(firefox)}" rel="noreferrer">Firefox</a></p><p><a href="${escape(chrome)}" rel="noreferrer">Chrome</a></p>`;
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finish sign-in | Argos Bot</title><style>body{font:17px system-ui;background:#071526;color:#edf4fa;margin:0;padding:40px 24px}main{max-width:480px;margin:8vh auto}h1{font-size:28px}p{line-height:1.6}a{color:#b9e5ff;display:inline-block;padding:12px 0}</style></head><body><main><h1>Finish sign-in in browser</h1><p>X opened this page in another browser. Return to the browser where you started signing in.</p>${buttons}<p>If your browser is not listed or the button does not open it, use this app’s menu to open this page in your original browser. Use the same normal or private browsing mode.</p></main></body></html>`,{headers:{
    "content-type":"text/html; charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow","x-content-type-options":"nosniff",
    "content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  }});
}
