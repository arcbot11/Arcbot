// Browser-only coordination shared by the chooser and background sign-in recovery.
// The challenge verifier stays in the HttpOnly cookie, never in browser storage.
export type TelegramSignInAttempt = { status: "pending"; code: string; url: string; expiresAt: number; returnTo?: string };
export type TelegramSignInResult = TelegramSignInAttempt | { status: "approved"; returnTo?: string } | { status: "expired" | "none" };
export const TELEGRAM_SIGNIN_PENDING = "argos-tg-signin-pending";
let browserRequest: Promise<void> | undefined;
let reading: Promise<TelegramSignInResult> | undefined;
let starting: Promise<TelegramSignInResult> | undefined;

export function prepareSignInBrowser() {
  return browserRequest ??= fetch("/api/auth/browser", { method: "POST", signal: AbortSignal.timeout(20000) })
    .then(response => { if (!response.ok) throw Error("Sign-in unavailable. Try again."); })
    .finally(() => { browserRequest = undefined; });
}

async function request(body: { action: "start" | "resume"; returnTo?: string; restart?: boolean }): Promise<TelegramSignInResult> {
  const response = await fetch("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Telegram sign-in could not be checked. Try again.");
  if (data.status === "pending") {
    try { sessionStorage.setItem(TELEGRAM_SIGNIN_PENDING, String(data.expiresAt)); } catch { /* Optional browser storage. */ }
  }
  return data;
}

export function readTelegramSignIn() {
  // A background poll must not inspect an old cookie while a new start is in flight.
  return starting ?? (reading ??= request({ action: "resume" }).finally(() => { reading = undefined; }));
}

export function startTelegramSignIn(returnTo: string, restart = false) {
  if (starting) return starting;
  const previousRead = reading;
  starting = (async () => {
    if (previousRead) await previousRead.catch(() => undefined);
    await prepareSignInBrowser();
    return request({ action: "start", returnTo, ...(restart ? { restart: true } : {}) });
  })().finally(() => { starting = undefined; });
  return starting;
}

export function clearTelegramSignIn() {
  try { sessionStorage.removeItem(TELEGRAM_SIGNIN_PENDING); } catch { /* Optional browser storage. */ }
}
