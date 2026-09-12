import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
export const BROWSER_COOKIE = "argos_web_browser";
export const hashAuth = (s: string) => createHash("sha256").update(s).digest("hex");
export function browserValue(secret: string) {
  const nonce = randomBytes(32).toString("hex");
  return `${nonce}.${createHmac("sha256", secret).update(`web-browser:${nonce}`).digest("hex")}`;
}
export function browserHash(request: NextRequest, secret: string) {
  const value = request.cookies.get(BROWSER_COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return null;
  const [nonce, mac] = value.split(".");
  const expected = createHmac("sha256", secret).update(`web-browser:${nonce}`).digest("hex");
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? hashAuth(nonce) : null;
}
export function setBrowserCookie(response: NextResponse, value: string, secure: boolean) {
  response.cookies.set(BROWSER_COOKIE, value, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
}
export function loginSourceHash(request: NextRequest, secret: string) {
  // Vercel overwrites this header at its trusted ingress. Never trust arbitrary X-Forwarded-For.
  const source = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "non-vercel";
  return createHmac("sha256", secret).update(`login-source:${source}`).digest("hex");
}
