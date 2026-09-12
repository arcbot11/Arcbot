"use client";

import Link from "next/link";
import { useWalletSession } from "./WalletSessionProvider";
import { WalletSignInButton } from "./WalletSignInButton";

export function OpenWalletLink({ className, label = "Open wallet ↗" }: { className: string; label?: string }) {
  const session = useWalletSession();
  return session?.authenticated
    ? <Link className={className} href="/wallet">{label}</Link>
    : <WalletSignInButton className={className} align={className === "arc-nav-cta" ? "right" : "left"}>{label}</WalletSignInButton>;
}
