import { randomBytes, randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../convex/_generated/api";
import { browserHash, hashAuth } from "./web-browser-auth";
import { decryptXCheckpoint, encryptXCheckpoint } from "./x-oauth-checkpoint";
import { oauthCookieName, readOAuthAttempt, telegramReturnToken } from "./x-oauth-attempt";
import { xBrowserReturn } from "./x-browser-return";
import { walletReturnPath } from "./wallet-return-path";
import { ARC_BOT_TELEGRAM_URL } from "./project-config";
import { checkWebSession } from "./web-session-authority";
import { createWebWalletSession, readWebWalletSession, WEB_WALLET_SESSION_COOKIE } from "./web-wallet-session";

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
function retryPage(request: NextRequest, site: string, busy: boolean, keepCode: boolean, proof?: string) {
  const target = new URL("/api/auth/x/callback", site);
  target.searchParams.set("state", request.nextUrl.searchParams.get("state")!);
  if (proof) target.searchParams.set("proof", proof);
  if (keepCode && request.nextUrl.searchParams.get("code")) target.searchParams.set("code", request.nextUrl.searchParams.get("code")!);
  const link = escape(target.href);
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${busy ? `<meta http-equiv="refresh" content="3;url=${link}">` : ""}<title>Finish sign-in | Argos Bot</title></head><body><main><h1>${busy ? "Finishing sign-in…" : "Sign-in interrupted"}</h1><p>${busy ? "Your authorization is being processed." : "Continue this sign-in. You do not need to authorize again if X authorization has already completed."}</p><a href="${link}" rel="noreferrer">Continue sign-in</a></main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" } });
}

/** A receiving browser exchanges immediately; only the initiating browser can activate a web session. */
export async function completeXOAuth(request: NextRequest) {
  const secret = process.env.WEB_AUTH_SECRET!, site = process.env.NEXT_PUBLIC_SITE_URL!, client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const state = request.nextUrl.searchParams.get("state")!, stateHash = hashAuth(state), lease = randomUUID();
  const code = request.nextUrl.searchParams.get("code");
  let tokenSaved = false, acquired = false, stage = "attempt";
  let completionProof: string | undefined;
  const expired = () => NextResponse.redirect(new URL("/wallet/sign-in-error?reason=invalid_state", site));
  try {
    // One atomic read/lease before exchange. No wallet provisioning or browser round-trip before exchanging the code.
    const result = await client.mutation(api.webAuth.xLock, { secret, stateHash, lease });
    if (result.status === "expired") return expired();
    if (result.status === "busy") return retryPage(request, site, true, true, request.nextUrl.searchParams.get("proof") ?? undefined);
    acquired = true;
    const saved = decryptXCheckpoint(result.encrypted, state, secret), context = saved.attempt;
    const checkpoint = async () => {
      const encrypted = encryptXCheckpoint(saved, state, secret);
      // Retry the same ciphertext after an uncertain response; the lease makes this idempotent.
      for (let i = 0; ; i++) { try { await client.mutation(api.webAuth.xSave, { secret, stateHash, lease, encrypted }); return; } catch (e) { if (i === 2) throw e; } }
    };
    tokenSaved = Boolean(saved.accessToken || saved.identity);
    // Knowing the initiating state alone must never retrieve another browser's authorization.
    // The callback code or its replacement completion proof must travel with the user's handoff.
    if (tokenSaved && (!saved.completionProof || !(code && hashAuth(code) === saved.codeHash) && request.nextUrl.searchParams.get("proof") !== saved.completionProof)) return expired();
    if (tokenSaved) completionProof = saved.completionProof;
    if (!tokenSaved) {
      if (!code || code.length > 2048) return expired();
      stage = "token_exchange";
      const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${process.env.X_OAUTH_CLIENT_ID}:${process.env.X_OAUTH_CLIENT_SECRET}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: `${site.replace(/\/$/, "")}/api/auth/x/callback`, code_verifier: context.verifier }), cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return NextResponse.redirect(new URL("/wallet/sign-in-error?reason=token_exchange", site));
      const token = await response.json() as { access_token?: string };
      if (!token.access_token) throw Error("Missing token");
      saved.accessToken = token.access_token;
      saved.codeHash = hashAuth(code); saved.completionProof = randomBytes(32).toString("base64url");
      completionProof = saved.completionProof;
      await checkpoint(); tokenSaved = true;
    }
    if (!saved.identity) {
      stage = "identity";
      const response = await fetch("https://api.x.com/2/users/me?user.fields=verified,verified_type", { headers: { authorization: `Bearer ${saved.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error("Identity unavailable");
      const identity = (await response.json() as { data?: { id?: string; username?: string; verified?: boolean; verified_type?: string } }).data;
      if (!identity?.id || !identity.username) throw Error("Missing identity");
      saved.identity = { id: identity.id, username: identity.username, verified: Boolean(identity.verified), ...(identity.verified_type ? { verifiedType: identity.verified_type } : {}) };
      delete saved.accessToken; await checkpoint();
    }
    const identity = saved.identity;
    const family = browserHash(request, secret);
    const proof = readOAuthAttempt(request.cookies.get(oauthCookieName(state)!)?.value, secret);
    if (!context.telegramLink && (!family || family !== context.browserFamily || proof?.verifier !== context.verifier || proof.generation !== context.generation)) {
      return xBrowserReturn(request, site, true, completionProof) ?? expired();
    }
    if (!saved.walletAddress) {
      stage = "wallet";
      const wallet = await client.action(api.wallets.provisionWebWallet, { secret, xUserId: identity.id, username: identity.username, verified: identity.verified, ...(identity.verifiedType ? { verifiedType: identity.verifiedType } : {}) });
      saved.walletAddress = wallet.address; await checkpoint();
    }
    let response: NextResponse;
    if (context.telegramLink) {
      stage = "telegram_link";
      const returnToken = telegramReturnToken(context.telegramLink, identity.id, secret);
      await client.action(api.telegram.stageXLink, { secret, nonce: context.telegramLink, ownerXUserId: identity.id, returnToken });
      const target = new URL(ARC_BOT_TELEGRAM_URL); target.searchParams.set("start", "link_" + returnToken);
      const previous = readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, secret);
      if (family) await client.mutation(api.webAuth.logout, { secret, browserHash: family, ...(previous ? { previousSessionHash: hashAuth(previous.sessionId) } : {}) });
      else if (previous) await checkWebSession(client, secret, previous, true);
      response = NextResponse.redirect(target);
      response.cookies.set(WEB_WALLET_SESSION_COOKIE, "", { httpOnly: true, secure: site.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 0 });
    } else {
      stage = "session";
      if (!saved.sessionCookie) { saved.sessionCookie = createWebWalletSession(saved.walletAddress, identity.id, identity.username, secret, family!); await checkpoint(); }
      const session = readWebWalletSession(saved.sessionCookie, secret);
      if (!session || session.provider === "telegram") return expired();
      await client.action(api.wallets.registerWebSession, { secret, sessionId: session.sessionId, ownerXUserId: identity.id, expiresAt: session.expiresAt });
      const activated = await client.mutation(api.webAuth.activate, { secret, browserHash: family!, generation: context.generation!, sessionIdHash: hashAuth(session.sessionId), expiresAt: session.expiresAt * 1000 });
      if (!activated) { await checkWebSession(client, secret, session, true); return expired(); }
      response = NextResponse.redirect(new URL(walletReturnPath(context.returnTo), site));
      response.cookies.set(WEB_WALLET_SESSION_COOKIE, saved.sessionCookie, { httpOnly: true, secure: site.startsWith("https:"), sameSite: "lax", path: "/", maxAge: Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000)) });
    }
    response.cookies.set("argos_tg_web_login", "", { httpOnly: true, path: "/api/auth/telegram", maxAge: 0 });
    // Keep the attempt proof for its original short lifetime so an interrupted response can be retried.
    response.headers.set("cache-control", "no-store"); response.headers.set("referrer-policy", "no-referrer");
    return response;
  } catch (error) {
    console.warn("x_sign_in_retry", { stage, errorType: error instanceof Error ? error.name : "unknown" });
    return retryPage(request, site, false, !tokenSaved, completionProof ?? request.nextUrl.searchParams.get("proof") ?? undefined);
  } finally {
    if (acquired) await client.mutation(api.webAuth.xUnlock, { secret, stateHash, lease }).catch(() => undefined);
  }
}
