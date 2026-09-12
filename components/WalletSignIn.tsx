"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { walletReturnPath } from "@/lib/wallet-return-path";

export function WalletSignIn() {
  const params = useSearchParams(), returnTo = walletReturnPath(params.get("returnTo"));
  const [attempt, setAttempt] = useState<{ code: string; url: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/browser", { method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) }).then(r => {
      if (!r.ok) throw Error(); setReady(true);
    }).catch(() => { if (!controller.signal.aborted) setError("Sign-in unavailable. Refresh this page to retry."); });
    return () => controller.abort();
  }, []);
  async function start() {
    if (busy) return;
    setBusy(true); setError(""); setAttempt(null);
    try {
      const r = await fetch("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }), signal: AbortSignal.timeout(15000) });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Sign-in unavailable.");
      setAttempt(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in unavailable."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!attempt) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      if (cancelled) return;
      if (Date.now() >= attempt!.expiresAt) { setError("Sign-in expired. Start again."); setAttempt(null); return; }
      try {
        const r = await fetch("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check" }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) { setError("Sign-in check interrupted. Retrying…"); }
        else if (data.status === "approved") { window.location.assign(returnTo); return; }
        else if (data.status === "expired") { setError("Sign-in expired. Start again."); setAttempt(null); return; }
        else setError("");
      } catch { if (!cancelled) setError("Sign-in check interrupted. Retrying…"); }
      if (!cancelled) timer = setTimeout(() => void check(), 2500);
    }
    void check();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [attempt, returnTo]);
  return <div className="otc-form" style={{ maxWidth: 520, display: "grid", gap: 16 }}>
    <p>Choose the account linked to your wallet. Only one wallet can be signed in at a time.</p>
    {ready ? <a className="arc-button" href={`/api/auth/x/start?returnTo=${encodeURIComponent(returnTo)}`}>Sign in with X</a> : <button className="arc-button" disabled>Sign in with X</button>}
    <button className="arc-button" onClick={() => void start()} disabled={busy || !ready}>{busy ? "Preparing…" : attempt ? "Restart Telegram sign-in" : "Sign in with Telegram"}</button>
    {attempt && <div className="otc-notice"><p>Match this code in Telegram: <strong>{attempt.code}</strong></p><a className="arc-button" href={attempt.url} target="_blank" rel="noopener noreferrer">Open Telegram to approve</a><p>Approve in the bot, then return here. Waiting for approval…</p><p>This opens your TG linked wallet. If you haven’t created one, use /createtg in the bot first.</p></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
