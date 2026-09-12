"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useWalletSession } from "./WalletSessionProvider";
import { WalletSignInButton } from "./WalletSignInButton";
import { walletReturnPath } from "@/lib/wallet-return-path";

export function WalletSignInRecovery() {
  const session = useWalletSession(), pathname = usePathname();
  useEffect(() => {
    let stopped = false, running = false;
    const controller = new AbortController();
    async function resume() {
      if (stopped || running || document.visibilityState !== "visible") return;
      let expires = 0;
      try { expires = Number(sessionStorage.getItem("argos-tg-signin-pending")); } catch { return; }
      if (!expires || expires <= Date.now()) return;
      running = true;
      try {
        const response = await fetch("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume" }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        if (!response.ok || stopped) return;
        const data = await response.json();
        if (stopped) return;
        if (data.status === "approved" || data.status === "none" || data.status === "expired") {
          try { sessionStorage.removeItem("argos-tg-signin-pending"); } catch { /* Optional browser storage. */ }
          if (data.status === "approved") window.location.assign(walletReturnPath(data.returnTo));
        }
      } catch { /* A pending attempt survives transport failures. */ }
      finally { running = false; }
    }
    void resume(); const timer = setInterval(() => void resume(), 2500);
    window.addEventListener("pageshow", resume); document.addEventListener("visibilitychange", resume);
    return () => { stopped = true; controller.abort(); clearInterval(timer); window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", resume); };
  }, []);
  if (!session?.authenticated || !session.needsReauth || !(pathname.startsWith("/wallet") || pathname === "/otc")) return null;
  return <div className="otc-notice" role="status">Sign in again before making another transaction. Balances and transaction status remain available. <WalletSignInButton className="arc-button" destination={walletReturnPath(pathname)}>Sign in again</WalletSignInButton></div>;
}
