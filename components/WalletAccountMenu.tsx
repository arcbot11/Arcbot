"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type WalletSession = { authenticated:true;username:string;walletAddress:string;expiresAt:number;csrfToken:string } | {authenticated:false};
export function WalletAccountMenu(){
 const [session,setSession]=useState<WalletSession|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let active=true,expiry:ReturnType<typeof setTimeout>|undefined;
  const refresh=async()=>{try{const r=await fetch("/api/auth/x/session",{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const s=await r.json() as WalletSession;if(!active)return;setSession(s);clearTimeout(expiry);if(s.authenticated)expiry=setTimeout(()=>{setSession({authenticated:false});window.location.reload();},Math.max(0,s.expiresAt*1000-Date.now()));}catch{if(active)setSession(null);}};
  const sync=(event:StorageEvent)=>{if(event.key==="arc-bot-signout")window.location.reload();};
  void refresh();const timer=setInterval(()=>void refresh(),60000);window.addEventListener("focus",refresh);window.addEventListener("storage",sync);
  return()=>{active=false;clearInterval(timer);clearTimeout(expiry);window.removeEventListener("focus",refresh);window.removeEventListener("storage",sync);};
 },[]);
 async function signOut(){if(!session?.authenticated||busy)return;setBusy(true);setError("");try{const r=await fetch("/api/auth/x/session",{method:"DELETE",headers:{"x-argus-csrf":session.csrfToken},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();try{localStorage.setItem("arc-bot-signout",String(Date.now()));}catch{}window.location.assign("/");}catch{setError("Sign out was not confirmed. Try again.");setBusy(false);}}
 if(!session?.authenticated)return <Link className="arc-nav-cta" href="/wallet">Open wallet ↗</Link>;
 return <details className="wallet-account-menu"><summary className="arc-nav-cta">Wallet ▾</summary><div className="wallet-account-dropdown"><strong>@{session.username}</strong><Link href="/wallet">Your funds</Link><a href="/api/auth/x/start?returnTo=/wallet">Refresh X sign-in</a><button type="button" disabled={busy} onClick={()=>void signOut()}>{busy?"Signing out…":"Sign out"}</button>{error&&<p role="alert">{error}</p>}</div></details>;
}
