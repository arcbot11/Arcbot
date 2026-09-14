"use client";
import { useEffect, useState } from "react";
import { formatBalanceUsd } from "@/lib/balance-display";
import {displayTokenAmount,isUsdcAsset} from "@/lib/amount-display";
import type { ArcTokenBalance } from "@/lib/arc/wallet-tokens";
import { retainTokenBalances } from "@/lib/token-balance-display";
import { loadTokenBalances, type TokenBalanceSnapshot } from "@/lib/load-token-balances";

type TradeAction=(side:"buy"|"sell",token:string)=>void;
export function HoldingCard({token,onError,onTrade,busy}:{token:ArcTokenBalance;onError:(message:string)=>void;onTrade?:TradeAction;busy:boolean}){
  const [copied,setCopied]=useState(false);
  const balance=displayTokenAmount(token.balance,token.address);
  const usdValue=!isUsdcAsset(token.address)&&token.usdValue!=null?formatBalanceUsd(token.usdValue):undefined;
  return <article className="arc-holding-card">
    <div className="arc-holding-top"><div className="arc-holding-mark" aria-hidden="true">{token.symbol.slice(0,2).toUpperCase()}</div><div><h3>{token.symbol}</h3><p>{token.name}</p></div><span className="arc-holding-chain">ARC</span></div>
    <div className="arc-holding-amount"><span>Balance</span><strong>{balance} {token.symbol}{usdValue&&<> <small title={token.pricedAt?`USD estimate · Price as of ${token.pricedAt}`:"USD estimate"}>({usdValue})</small></>}</strong></div>
    {token.stale&&<p className="otc-fine">Last loaded balance. Refresh pending.</p>}
    <div className="arc-holding-contract"><span>Contract address</span><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(token.address);setCopied(true);}catch{onError("Could not copy the contract address. Select and copy it below.");}}} aria-label={`Copy ${token.symbol} contract address`}>{copied?"Copied":"Copy CA"}</button><code>{token.address}</code></div>
    <a className="arc-text-link" href={`https://www.arcexplorer.org/token/${token.address}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
    {onTrade&&<div className="arc-sell-percentages" role="group" aria-label={`Trade ${token.symbol}`}><button type="button" disabled={busy} aria-label={`Buy ${token.symbol}`} onClick={()=>onTrade("buy",token.address)}>Buy</button><button type="button" disabled={busy} aria-label={`Sell ${token.symbol}`} onClick={()=>onTrade("sell",token.address)}>Sell</button></div>}
  </article>;
}
export function ArcTokenBalances({address,refreshKey=0,onTrade,busy=false}:{address:string;refreshKey?:number;onTrade?:TradeAction;busy?:boolean}){
  const [data,setData]=useState<TokenBalanceSnapshot|null>(null),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();let pending=false;
    const refresh=async()=>{
      if(pending||document.visibilityState==='hidden')return;pending=true;
      try{await loadTokenBalances<TokenBalanceSnapshot>("/api/wallet/tokens",address,controller.signal,result=>{
        setData(previous=>{const tokens=retainTokenBalances(previous?.walletAddress.toLowerCase()===address.toLowerCase()?previous:null,result);return {...result,tokens,partial:result.partial||tokens.some(t=>t.stale)};});
        if(!result.partial)setError("");
      });
      }catch{if(!controller.signal.aborted)setError("Token balances could not refresh.");}finally{pending=false;}
    };
    const focus=()=>{void refresh();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    void refresh();const timer=setInterval(()=>void refresh(),15_000);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[address,refreshKey]);
  useEffect(()=>{setData(null);setError("");},[address]);
  return <section className="otc-history"><h2>Your Arc tokens</h2>
    {error&&<p className="otc-notice" role="status">{error} <button className="otc-inline-button" aria-label="Dismiss token balance notice" onClick={()=>setError("")}>×</button></p>}
    <div className="arc-holdings-grid">{data?.tokens.map(token=><HoldingCard key={token.address} token={token} onError={setError} onTrade={onTrade} busy={busy}/>)}</div>
    {!data&&!error&&<p className="otc-fine">Loading token balances…</p>}
    {data?.partial&&<p className="otc-fine">Some token balances could not refresh. Last loaded balances remain visible.</p>}
    {data&&!data.partial&&!data.tokens.length&&<p className="otc-fine">No other Arc token balances found.</p>}
  </section>;
}
