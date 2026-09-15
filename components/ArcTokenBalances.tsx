"use client";
import { useEffect, useState } from "react";
import { formatBalanceUsd } from "@/lib/balance-display";
import {displayTokenAmount,isUsdcAsset} from "@/lib/amount-display";
import type { ArcTokenBalance } from "@/lib/arc/wallet-tokens";
import { retainTokenBalances } from "@/lib/token-balance-display";
import { loadTokenBalances, type TokenBalanceSnapshot } from "@/lib/load-token-balances";
import { loadTokenPrice } from "@/lib/load-token-price";
import { freshDisplayPrice } from "@/lib/price-freshness";

type TradeAction=(side:"buy"|"sell",token:string)=>void;
export function HoldingCard({token,onError,onTrade,busy}:{token:ArcTokenBalance;onError:(message:string)=>void;onTrade?:TradeAction;busy:boolean}){
  const [copied,setCopied]=useState(false);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const [price,setPrice]=useState<{address:string;priceUsd:number;pricedAt:string|null}|null>(null);
  useEffect(()=>{
    if(isUsdcAsset(token.address))return;
    let cancelled=false;
    const refresh=async()=>{
      if(document.hidden)return;
      const result=await loadTokenPrice(token.address);
      if(!cancelled&&result)setPrice({address:token.address.toLowerCase(),...result});
    };
    if(token.usdValue==null||!freshDisplayPrice(token.pricedAt))void refresh();
    const timer=setInterval(()=>void refresh(),60000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[token.address,token.usdValue,token.pricedAt]);
  const balance=displayTokenAmount(token.balance,token.address);
  const fallback=price?.address===token.address.toLowerCase()&&freshDisplayPrice(price.pricedAt,now)?price:null;
  const useSnapshot=token.usdValue!=null&&freshDisplayPrice(token.pricedAt,now)&&(!fallback||Date.parse(token.pricedAt!)>=Date.parse(fallback.pricedAt!));
  const estimatedUsd=useSnapshot?token.usdValue:(fallback?Number(token.balance)*fallback.priceUsd:null);
  const pricedAt=useSnapshot?token.pricedAt:fallback?.pricedAt;
  const usdValue=!isUsdcAsset(token.address)&&estimatedUsd!=null?formatBalanceUsd(estimatedUsd):undefined;
  return <article className="arc-holding-card">
    <div className="arc-holding-top"><div className="arc-holding-mark" aria-hidden="true">{token.symbol.slice(0,2).toUpperCase()}</div><div><h3>{token.symbol}</h3><p>{token.name}</p></div><span className="arc-holding-chain">ARC</span></div>
    <div className="arc-holding-amount"><span>Balance</span><strong>{balance} {token.symbol}{usdValue&&<> <small title={pricedAt?`USD estimate · Price as of ${pricedAt}`:"USD estimate"}>({usdValue})</small></>}</strong></div>
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
        if(!(result.balancePartial??result.partial))setError("");
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
    {(data?.balancePartial??data?.partial)&&<p className="otc-fine">Some token balances could not refresh. Last loaded balances remain visible.</p>}
    {data&&!data.partial&&!data.tokens.length&&<p className="otc-fine">No other Arc token balances found.</p>}
  </section>;
}
