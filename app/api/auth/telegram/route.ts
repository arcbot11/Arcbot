import { createHash, createHmac, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { ARC_BOT_TELEGRAM_USERNAME } from "@/lib/project-config";
import { createTelegramWebSession, readWebWalletSession, WEB_WALLET_SESSION_COOKIE, WEB_WALLET_SESSION_SECONDS } from "@/lib/web-wallet-session";
import { browserHash, loginSourceHash, hashAuth } from "@/lib/web-browser-auth";
import { boundedJson, RequestBodyError } from "@/lib/bounded-json";
import { walletReturnPath } from "@/lib/wallet-return-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookie = "argos_tg_web_login";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest) {
  const secret = process.env.WEB_AUTH_SECRET, url = process.env.NEXT_PUBLIC_CONVEX_URL, site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !url || !site) return json({ error: "Telegram sign-in is unavailable." }, 503);
  // Both initiation and exchange require a same-origin browser POST. No user identity comes from the browser.
  if (request.headers.get("origin") !== new URL(site).origin || request.nextUrl.origin !== new URL(site).origin)
    return json({ error: "Open the website directly to sign in." }, 403);
  try {
    const { action, returnTo, restart } = await boundedJson<{ action?: string; returnTo?: string; restart?: boolean }>(request, 512);
    const family = browserHash(request, secret);
    if (!family) return json({ error: "Refresh the sign-in page and try again." }, 409);
    const client = new ConvexHttpClient(url);
    const options = { httpOnly: true, secure: new URL(site).protocol === "https:", sameSite: "strict" as const, path: "/api/auth/telegram" };
    const value = request.cookies.get(cookie)?.value ?? "";
    const current = readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, secret);
    const proof = /^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value) ? value.split(".") : null;
    const sessionId = proof ? `web_${createHmac("sha256", secret).update(`tg-web:${value}`).digest("base64url")}` : "";
    async function exchange(resume: boolean) {
      const [token, verifier] = proof!;
      return client.mutation(api.telegramWebAuth.exchange, { secret: secret!, tokenHash: hash(token), browserHash: hash(verifier), sessionIdHash: hash(sessionId), browserFamily: family!, ...(resume ? { resume: true } : {}) });
    }
    function approved(result: { walletAddress: string; telegramUserId: string; authenticatedAt: number; returnTo?: string }) {
      const response = json({ status: "approved", returnTo: walletReturnPath(result.returnTo) });
      response.cookies.set(WEB_WALLET_SESSION_COOKIE, createTelegramWebSession(result.walletAddress, result.telegramUserId, sessionId, result.authenticatedAt, secret!, family!), {
        httpOnly: true, secure: options.secure, sameSite: "lax", path: "/", maxAge: Math.max(0, result.authenticatedAt + WEB_WALLET_SESSION_SECONDS - Math.floor(Date.now() / 1000)),
      });
      return response;
    }
    const pending = (token: string, result: { code?: string; expiresAt?: number; returnTo?: string }) => json({ status: "pending", code: result.code, expiresAt: result.expiresAt, returnTo: walletReturnPath(result.returnTo), url: `https://t.me/${ARC_BOT_TELEGRAM_USERNAME.replace(/^@/, "")}?start=web_${token}` });
    if (action === "start") {
      // Repeat clicks/reopens reuse the original browser-bound approval. Only an
      // explicit account change or expired attempt replaces the challenge.
      if (proof && restart !== true && current?.sessionId !== sessionId) {
        const result = await exchange(true);
        if (result.status === "pending") return pending(proof[0], result);
        if (result.status === "approved") return approved(result);
      }
      const token = randomBytes(16).toString("hex"), verifier = randomBytes(32).toString("hex");
      const code = hash(token).slice(0, 8).toUpperCase();
      const previous = readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, secret);
      await client.mutation(api.telegramWebAuth.start, { secret, tokenHash: hash(token), browserHash: hash(verifier), code, browserFamily: family, sourceHash: loginSourceHash(request, secret), returnTo: walletReturnPath(returnTo), ...(previous ? { previousSessionHash: hashAuth(previous.sessionId) } : {}) });
      const response = pending(token, { code, expiresAt: Date.now() + 600_000, returnTo });
      response.cookies.set(cookie, `${token}.${verifier}`, { ...options, maxAge: 600 });
      return response;
    }
    if (action !== "check" && action !== "resume") return json({ error: "Invalid sign-in request." }, 400);
    if (!proof) return json({ status: "expired" });
    // Opening the account chooser must not redirect a user already using this session.
    if (action === "resume" && current?.sessionId === sessionId) return json({ status: "none" });
    const result = await exchange(action === "resume");
    if (result.status === "pending" && action === "resume") return pending(proof[0], result);
    if (result.status !== "approved") return json({ status: result.status });
    return approved(result);
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message.includes("Sign-in limit reached")) return json({ error: "Sign-in limit reached. Try again in a minute." }, 429);
    return json({ error: "Telegram sign-in could not be checked. Try again." }, 503);
  }
}
