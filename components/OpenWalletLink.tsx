"use client";

import Link from "next/link";
import { useWalletSession } from "./WalletSessionProvider";

export function OpenWalletLink({ className, label = "Open wallet ↗" }: { className: string; label?: string }) {
  const session = useWalletSession();
  return session?.authenticated
    ? <Link className={className} href="/wallet">{label}</Link>
    : <Link className={className} href="/wallet/sign-in?returnTo=/wallet">{label}</Link>;
}
