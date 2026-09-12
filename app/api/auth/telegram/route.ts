import { createHash, createHmac, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { ARC_BOT_TELEGRAM_USERNAME } from "@/lib/project-config";
import { createTelegramWebSession, readWebWalletSession, WEB_WALLET_SESSION_COOKIE, WEB_WALLET_SESSION_SECONDS } from "@/lib/web-wallet-session";
import { checkWebSession } from "@/lib/web-session-authority";

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
    const { action } = await request.json();
    const client = new ConvexHttpClient(url);
    const options = { httpOnly: true, secure: new URL(site).protocol === "https:", sameSite: "strict" as const, path: "/api/auth/telegram" };
    if (action === "start") {
      // A fresh user click replaces the browser's previous attempt, never a wallet binding.
      const token = randomBytes(16).toString("hex"), verifier = randomBytes(32).toString("hex");
      const code = hash(token).slice(0, 8).toUpperCase();
      await client.mutation(api.telegramWebAuth.start, { secret, tokenHash: hash(token), browserHash: hash(verifier), code });
      const response = json({ code, url: `https://t.me/${ARC_BOT_TELEGRAM_USERNAME.replace(/^@/, "")}?start=web_${token}`, expiresAt: Date.now() + 600_000 });
      response.cookies.set(cookie, `${token}.${verifier}`, { ...options, maxAge: 600 });
      return response;
    }
    if (action !== "check") return json({ error: "Invalid sign-in request." }, 400);
    const value = request.cookies.get(cookie)?.value ?? "";
    if (!/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return json({ status: "expired" });
    const [token, verifier] = value.split(".");
    const sessionId = `web_${createHmac("sha256", secret).update(`tg-web:${value}`).digest("base64url")}`;
    const result = await client.mutation(api.telegramWebAuth.exchange, { secret, tokenHash: hash(token), browserHash: hash(verifier), sessionIdHash: hash(sessionId) });
    if (result.status !== "approved") return json({ status: result.status });
    const previous = readWebWalletSession(request.cookies.get(WEB_WALLET_SESSION_COOKIE)?.value, secret);
    if (previous && previous.sessionId !== sessionId) await checkWebSession(client, secret, previous, true);
    const response = json({ status: "approved" });
    response.cookies.set(WEB_WALLET_SESSION_COOKIE, createTelegramWebSession(result.walletAddress, result.telegramUserId, sessionId, result.authenticatedAt, secret), {
      httpOnly: true, secure: options.secure, sameSite: "lax", path: "/", maxAge: Math.max(0, result.authenticatedAt + WEB_WALLET_SESSION_SECONDS - Math.floor(Date.now() / 1000)),
    });
    return response;
  } catch {
    return json({ error: "Telegram sign-in could not be checked. Try again." }, 503);
  }
}
