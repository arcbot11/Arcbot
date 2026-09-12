"use client";
import { useWalletSession } from "./WalletSessionProvider";

export function WalletXName() {
  const session=useWalletSession();
  return <p className="otc-fine" style={{minHeight:"1.5em"}}>{session?.authenticated ? session.provider === "telegram" ? "TG linked wallet" : session.username ? `@${session.username.replace(/^@/,"")}` : "" : ""}</p>;
}
