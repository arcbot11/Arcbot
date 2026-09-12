"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useWalletSession } from "./WalletSessionProvider";
import { WalletSignInButton } from "./WalletSignInButton";
import { walletReturnPath } from "@/lib/wallet-return-path";
import { clearTelegramSignIn, readTelegramSignIn, TELEGRAM_SIGNIN_PENDING } from "@/lib/telegram-web-signin";

export function WalletSignInRecovery() {
  const session = useWalletSession(), pathname = usePathname();
  useEffect(() => {
    let stopped = false, running = false;
    async function resume() {
      if (stopped || running || document.visibilityState !== "visible") return;
      let expires = 0;
      try { expires = Number(sessionStorage.getItem(TELEGRAM_SIGNIN_PENDING)); } catch { return; }
      if (!expires || expires <= Date.now()) return;
      running = true;
      try {
        const data = await readTelegramSignIn();
        if (stopped) return;
        if (data.status === "approved" || data.status === "none" || data.status === "expired") {
          clearTelegramSignIn();
          if (data.status === "approved") window.location.assign(walletReturnPath(data.returnTo));
        }
      } catch { /* A pending attempt survives transport failures. */ }
      finally { running = false; }
    }
    void resume(); const timer = setInterval(() => void resume(), 2500);
    window.addEventListener("pageshow", resume); window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("pageshow", resume); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, []);
  if (!session?.authenticated || !session.needsReauth || !(pathname.startsWith("/wallet") || pathname === "/otc")) return null;
  return <div className="otc-notice" role="status">Sign in again before making another transaction. Balances and transaction status remain available. <WalletSignInButton className="arc-button" destination={walletReturnPath(pathname)}>Sign in again</WalletSignInButton></div>;
}
