"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type WalletSession = { authenticated: boolean; provider?: "x" | "telegram"; walletAddress?: string; username?: string; csrfToken?: string; expiresAt?: number; reauthAt?: number; needsReauth?: boolean };
const Context = createContext<WalletSession | null>(null);
export const useWalletSession = () => useContext(Context);

/** One in-memory session check shared by navigation, wallet and trading controls. */
export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null);
  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let reauth: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (request) return;
      const controller = new AbortController(); request = controller;
      clearTimeout(retry);
      try {
        const response = await fetch("/api/auth/x/session", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error("Session check unavailable");
        const next = await response.json() as WalletSession;
        if (!active || controller.signal.aborted) return;
        clearTimeout(expiry);
        clearTimeout(reauth);
        if (next.authenticated && (!next.expiresAt || next.expiresAt * 1000 <= Date.now())) { setSession({ authenticated: false }); return; }
        setSession({ ...next, needsReauth: Boolean(next.authenticated && next.reauthAt && next.reauthAt * 1000 <= Date.now()) });
        if (next.authenticated && next.reauthAt) reauth = setTimeout(() => setSession(previous => previous?.authenticated ? { ...previous, needsReauth: true } : previous), Math.max(0, next.reauthAt * 1000 - Date.now()));
        if (next.authenticated) {
          try { localStorage.setItem("argos-wallet-account", JSON.stringify([next.provider ?? "x", next.walletAddress])); } catch { /* Storage is optional; cookies remain authoritative. */ }
        }
        if (next.authenticated) expiry = setTimeout(() => setSession({ authenticated: false }), Math.max(0, next.expiresAt! * 1000 - Date.now()));
      } catch {
        // Keep the last checked session until its expiry; server authorization still gates every action.
        if (active && !controller.signal.aborted) {
          setSession(previous => previous ?? { authenticated: false });
          retry = setTimeout(() => void refresh(), 5000);
        }
      } finally { if (request === controller) request = null; }
    };
    const sync = (event: StorageEvent) => { if (event.key === "arc-bot-signout" || event.key === "argos-wallet-account") { setSession({ authenticated: false }); window.location.reload(); } };
    // Mobile browsers may restore a frozen page without remounting React or
    // emitting focus. Discard its old request before checking the current cookie.
    const resume = () => { request?.abort(); request = null; void refresh(); };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    void refresh(); const timer = setInterval(() => void refresh(), 60000);
    window.addEventListener("focus", refresh); window.addEventListener("storage", sync);
    window.addEventListener("pageshow", resume); document.addEventListener("visibilitychange", visible);
    return () => { active = false; request?.abort(); clearTimeout(expiry); clearTimeout(reauth); clearTimeout(retry); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", sync); window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
