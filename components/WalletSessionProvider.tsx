"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type WalletSession = { authenticated: boolean; provider?: "x" | "telegram"; walletAddress?: string; username?: string; csrfToken?: string; expiresAt?: number };
const Context = createContext<WalletSession | null>(null);
export const useWalletSession = () => useContext(Context);

/** One in-memory session check shared by navigation, wallet and trading controls. */
export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null);
  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (request) return;
      const controller = new AbortController(); request = controller;
      try {
        const response = await fetch("/api/auth/x/session", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error("Session check unavailable");
        const next = await response.json() as WalletSession;
        if (!active) return;
        clearTimeout(expiry);
        if (next.authenticated && (!next.expiresAt || next.expiresAt * 1000 <= Date.now())) { setSession({ authenticated: false }); return; }
        setSession(next);
        if (next.authenticated) {
          try { localStorage.setItem("argos-wallet-account", JSON.stringify([next.provider ?? "x", next.walletAddress])); } catch { /* Storage is optional; cookies remain authoritative. */ }
        }
        if (next.authenticated) expiry = setTimeout(() => setSession({ authenticated: false }), Math.max(0, next.expiresAt! * 1000 - Date.now()));
      } catch {
        // Keep the last checked session until its expiry; server authorization still gates every action.
        if (active) setSession(previous => previous ?? { authenticated: false });
      } finally { if (request === controller) request = null; }
    };
    const sync = (event: StorageEvent) => { if (event.key === "arc-bot-signout" || event.key === "argos-wallet-account") { setSession({ authenticated: false }); window.location.reload(); } };
    void refresh(); const timer = setInterval(() => void refresh(), 60000);
    window.addEventListener("focus", refresh); window.addEventListener("storage", sync);
    return () => { active = false; request?.abort(); clearTimeout(expiry); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", sync); };
  }, []);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
