"use client";
import { useEffect, useState } from "react";
import type { ArcTokenBalance } from "@/lib/arc/wallet-tokens";

function HoldingCard({token,onError}:{token:ArcTokenBalance;onError:(message:string)=>void}){
  const [copied,setCopied]=useState(false);
  const [whole,fraction=""]=token.balance.split(".");
  const displayedFraction=fraction.slice(0,6).replace(/0+$/,"");
  const balance=whole==="0"&&!displayedFraction&&/[1-9]/.test(fraction)?"<0.000001":whole.replace(/\B(?=(\d{3})+(?!\d))/g,",")+(displayedFraction?`.${displayedFraction}`:"");
  return <article className="arc-holding-card">
    <div className="arc-holding-top"><div className="arc-holding-mark" aria-hidden="true">{token.symbol.slice(0,2).toUpperCase()}</div><div><h3>{token.symbol}</h3><p>{token.name}</p></div><span className="arc-holding-chain">ARC</span></div>
    <div className="arc-holding-amount"><span>Balance</span><strong title={`${token.balance} ${token.symbol}`}>{balance}</strong><small>{token.symbol}</small></div>
    <div className="arc-holding-contract"><span>Contract address</span><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(token.address);setCopied(true);}catch{onError("Could not copy the contract address. Select and copy it below.");}}} aria-label={`Copy ${token.symbol} contract address`}>{copied?"Copied":"Copy CA"}</button><code>{token.address}</code></div>
    <a className="arc-text-link" href={`https://www.arcexplorer.org/token/${token.address}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
  </article>;
}
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
    <div className="arc-holdings-grid">{data?.tokens.map(token=><HoldingCard key={token.address} token={token} onError={setError}/>)}</div>
    {!data&&!error&&<p className="otc-fine">Loading token balances…</p>}
    {data?.partial&&<p className="otc-fine">Some token balances are unavailable. Displayed balances were verified on Arc.</p>}
    {data&&!data.partial&&!data.tokens.length&&<p className="otc-fine">No other Arc token balances found.</p>}
  </section>;
}
