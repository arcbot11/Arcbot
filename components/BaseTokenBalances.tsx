"use client";
import {useEffect,useState,type ReactNode} from "react";
import type {BaseTokenBalance,BaseTokenSnapshot} from "@/lib/base/wallet-tokens";
import {retainTokenBalances} from "@/lib/token-balance-display";

export function BaseTokenCard({token,busy,onWithdraw}:{token:BaseTokenBalance;busy:boolean;onWithdraw:(token:BaseTokenBalance)=>void}){
  return <article className="arc-holding-card">
    <div className="arc-holding-top"><div className="arc-holding-mark" aria-hidden="true">{token.symbol.slice(0,2).toUpperCase()}</div><div><h3>{token.symbol}</h3><p>{token.name}</p></div><span className="arc-holding-chain">BASE</span></div>
    <div className="arc-holding-amount"><span>Balance</span><strong>{token.balance} {token.symbol}</strong></div>
    {token.stale&&<p className="otc-fine">Last loaded balance. Refresh pending.</p>}
    <div className="arc-holding-contract"><span>Contract address</span><code>{token.address}</code></div>
    <a className="arc-text-link" href={`https://basescan.org/token/${token.address}`} target="_blank" rel="noreferrer">View on Basescan ↗</a>
    <button type="button" className="arc-button" disabled={busy||token.stale} onClick={()=>onWithdraw(token)}>Withdraw {token.symbol}</button>
  </article>;
}

export function BaseTokenBalances({address,refreshKey,busy,onWithdraw,children}:{address:string;refreshKey:number;busy:boolean;onWithdraw:(token:BaseTokenBalance)=>void;children?:ReactNode}){
  const [data,setData]=useState<BaseTokenSnapshot|null>(null),[error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let pending=false;
    const refresh=async()=>{
      if(pending||document.hidden)return;pending=true;
      try{
        const response=await fetch("/api/wallet/base-tokens",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(125000)])});
        const result=await response.json();
        if(!response.ok||result.walletAddress?.toLowerCase()!==address.toLowerCase()||!Array.isArray(result.tokens))throw Error("Base token balances could not refresh.");
        if(controller.signal.aborted)return;
        setData(previous=>({...result,tokens:retainTokenBalances(previous,result)}));setError("");
      }catch{if(!controller.signal.aborted){setError("Base token balances could not refresh.");setData(previous=>previous?{...previous,partial:true,balancePartial:true,tokens:previous.tokens.map(t=>({...t,stale:true}))}:null);}}
      finally{pending=false;}
    };
    const focus=()=>void refresh();void refresh();
    const timer=setInterval(focus,30000);window.addEventListener("focus",focus);document.addEventListener("visibilitychange",focus);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",focus);};
  },[address,refreshKey,retry]);
  return <section className="otc-history"><div className="otc-panel-title"><h2>Your Base Tokens</h2><button type="button" className="otc-inline-button" onClick={()=>setRetry(v=>v+1)}>Refresh ↻</button></div>
    <p className="otc-fine">Withdraw to a wallet on Base. Base ETH is required for gas.</p>
    {error&&<p className="otc-notice" role="status">{error}</p>}
    {!data&&!error&&<p className="otc-fine" role="status">Loading Base tokens…</p>}
    {data?.discoveryPartial&&<p className="otc-fine">Token discovery is incomplete. Some Base tokens may be missing.</p>}
    {data?.balancePartial&&<p className="otc-fine">Some balances could not refresh. Last loaded balances remain visible.</p>}
    {data&&!data.partial&&!data.tokens.length&&<p className="otc-fine">No other Base token balances found.</p>}
    <div className="arc-holdings-grid">{data?.tokens.map(token=><BaseTokenCard key={token.address} token={token} busy={busy} onWithdraw={onWithdraw}/>)}</div>
    {children}
  </section>;
}
