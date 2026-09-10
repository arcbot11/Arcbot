"use client";

import Link from "next/link";
import { useWalletSession } from "./WalletSessionProvider";

export function OpenWalletLink({ className }: { className: string }) {
  const session = useWalletSession();
  return session?.authenticated
    ? <Link className={className} href="/wallet">Open wallet ↗</Link>
    : <a className={className} href="/api/auth/x/start?returnTo=/wallet">Open wallet ↗</a>;
}
