"use client";
import { useState } from "react";
import Link from "next/link";
import { OpenWalletLink } from "./OpenWalletLink";
import { useWalletSession } from "./WalletSessionProvider";
export function WalletAccountMenu(){
 const session=useWalletSession(); const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function signOut(){if(!session?.authenticated||busy)return;setBusy(true);setError("");try{const r=await fetch("/api/auth/x/session",{method:"DELETE",headers:{"x-argus-csrf":session.csrfToken??""},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();try{localStorage.setItem("arc-bot-signout",String(Date.now()));}catch{}window.location.assign("/");}catch{setError("Sign out was not confirmed. Try again.");setBusy(false);}}
 if(!session?.authenticated)return <OpenWalletLink className="arc-nav-cta" label="Sign In to Wallet" />;
 return <details className="wallet-account-menu"><summary className="arc-nav-cta">Wallet ▾</summary><div className="wallet-account-dropdown"><strong>{session.provider === "telegram" ? "TG linked wallet" : "@"+session.username}</strong><Link href="/wallet">Your wallet</Link><Link href="/wallet/sign-in">Refresh sign-in / switch account</Link><button type="button" disabled={busy} onClick={()=>void signOut()}>{busy?"Signing out…":"Sign out"}</button>{error&&<p role="alert">{error}</p>}</div></details>;
}
