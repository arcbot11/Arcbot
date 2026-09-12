"use client";
import { useEffect, useRef, useState } from "react";
import { walletReturnPath } from "@/lib/wallet-return-path";
import { clearTelegramSignIn, prepareSignInBrowser, readTelegramSignIn, startTelegramSignIn, type TelegramSignInAttempt } from "@/lib/telegram-web-signin";

export function WalletSignIn({ destination }: { destination?: string } = {}) {
  const returnTo = walletReturnPath(destination);
  const [attempt, setAttempt] = useState<TelegramSignInAttempt | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [ready, setReady] = useState(false), [initialization, setInitialization] = useState(0);
  const starting = useRef(false), mounted = useRef(false);
  useEffect(() => {
    let stopped = false;
    mounted.current = true;
    setReady(false); setError("");
    void (async () => {
      await prepareSignInBrowser();
      const data = await readTelegramSignIn();
      if (stopped) return;
      if (data.status === "approved") { clearTelegramSignIn(); window.location.assign(walletReturnPath(data.returnTo)); return; }
      if (data.status === "pending") setAttempt(data);
      setReady(true);
    })().catch(() => { if (!stopped) setError("Sign-in could not load. Try again."); });
    return () => { stopped = true; mounted.current = false; };
  }, [initialization]);

  async function start(restart = false) {
    if (starting.current || !ready) return;
    starting.current = true;
    setBusy(true); setError("");
    // Open during the click so mobile/desktop popup protection does not discard
    // the Telegram handoff after the asynchronous challenge request finishes.
    let telegram: Window | null = null;
    try {
      telegram = window.open("about:blank", "_blank");
      if (telegram) { telegram.opener = null; telegram.document.title = "Opening Telegram"; telegram.document.body.textContent = "Opening Telegram… Return to your original browser after approving sign-in."; }
    } catch { /* The persistent link below also works when popups are blocked. */ }
    try {
      const data = await startTelegramSignIn(returnTo, restart);
      if (data.status === "approved") { telegram?.close(); clearTelegramSignIn(); window.location.assign(walletReturnPath(data.returnTo)); return; }
      if (data.status !== "pending") throw Error("Sign-in expired. Try again.");
      if (mounted.current) setAttempt(data);
      if (telegram && !telegram.closed) telegram.location.replace(data.url);
    } catch (e) {
      telegram?.close();
      if (mounted.current) setError(e instanceof Error ? e.message : "Sign-in unavailable.");
    } finally { starting.current = false; if (mounted.current) setBusy(false); }
  }

  useEffect(() => {
    if (!attempt) return;
    let cancelled = false, checking = false;
    async function check() {
      if (cancelled || checking || starting.current || document.visibilityState !== "visible") return;
      if (Date.now() >= attempt!.expiresAt) { clearTelegramSignIn(); setError("Sign-in expired. Try again."); setAttempt(null); return; }
      checking = true;
      try {
        const data = await readTelegramSignIn();
        if (cancelled) return;
        if (data.status === "approved") { clearTelegramSignIn(); window.location.assign(walletReturnPath(data.returnTo ?? attempt?.returnTo ?? returnTo)); return; }
        if (data.status === "expired") { clearTelegramSignIn(); setError("Sign-in expired. Try again."); setAttempt(null); return; }
        setError("");
      } catch { if (!cancelled) setError("Connection interrupted. Your sign-in is saved. Retrying…"); }
      finally { checking = false; }
    }
    void check();
    const timer = setInterval(() => void check(), 2500);
    window.addEventListener("pageshow", check); window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("pageshow", check); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [attempt, returnTo]);

  return <div className="wallet-signin-form">
    <p>Choose your wallet.</p>
    {ready && !busy ? <a className="arc-button" onClick={clearTelegramSignIn} href={`/api/auth/x/start?returnTo=${encodeURIComponent(returnTo)}`}>Sign in with X</a> : <button className="arc-button" disabled>Sign in with X</button>}
    {!attempt && <button className="arc-button" onClick={() => void start()} disabled={busy || !ready}>{busy ? "Opening Telegram…" : "Sign in with Telegram"}</button>}
    {attempt && <div className="otc-notice">
      <p>Match this code in Telegram: <strong>{attempt.code}</strong></p>
      {busy ? <button className="arc-button" disabled>Opening Telegram…</button> : <a className="arc-button" href={attempt.url} target="_blank" rel="noopener noreferrer">Open Telegram</a>}
      <p>Tap Start in Telegram if shown, then approve the matching code. Return to this browser to finish signing in.</p>
      <p role="status">Waiting for Telegram approval…</p>
      <p>No TG wallet yet? The bot will show you how to create one.</p>
      <button type="button" className="arc-text-link" disabled={busy} onClick={() => void start(true)}>Use another Telegram account</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    {!ready && error && <button type="button" className="arc-button" onClick={() => setInitialization(value => value + 1)}>Retry sign-in</button>}
  </div>;
}
