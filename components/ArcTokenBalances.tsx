"use client";
import { useEffect, useState } from "react";
import type { ArcTokenBalance } from "@/lib/arc/wallet-tokens";
export function ArcTokenBalances({address}:{address:string}){
  const [data,setData]=useState<{tokens:ArcTokenBalance[];partial:boolean}|null>(null),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();let pending=false;setData(null);setError("");
    const refresh=async()=>{
      if(pending)return;pending=true;
      try{const response=await fetch("/api/wallet/tokens",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});const result=await response.json();
        if(!response.ok||result.walletAddress?.toLowerCase()!==address.toLowerCase())throw Error("Token balances unavailable.");
        if(!controller.signal.aborted)setData(result);
      }catch{if(!controller.signal.aborted)setError("Token balances could not refresh.");}finally{pending=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),15_000);return()=>{controller.abort();clearInterval(timer);};
  },[address]);
  return <section className="otc-history"><h2>Your Arc tokens</h2>
    {error&&<p className="otc-notice" role="status">{error} <button className="otc-inline-button" aria-label="Dismiss token balance notice" onClick={()=>setError("")}>×</button></p>}
    {data?.tokens.map(token=><article className="otc-listing-row" key={token.address}><div><strong>{token.balance} ${token.symbol}</strong><p>{token.name}</p></div><a className="arc-text-link" href={`https://www.arcexplorer.org/token/${token.address}`} target="_blank" rel="noreferrer">View token ↗</a></article>)}
    {!data&&!error&&<p className="otc-fine">Loading token balances…</p>}
    {data?.partial&&<p className="otc-fine">Some token balances are unavailable. Displayed balances were verified on Arc.</p>}
    {data&&!data.partial&&!data.tokens.length&&<p className="otc-fine">No other Arc token balances found.</p>}
  </section>;
}
