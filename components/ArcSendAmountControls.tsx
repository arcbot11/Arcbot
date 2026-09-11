"use client";
import {useEffect,useState} from "react";
import {formatUnits} from "viem";
import {displayTokenAmount,isUsdcAsset} from "@/lib/amount-display";
import {formatTokenUsd} from "@/lib/arc/token-value";

type Balance={address:string;balance:string;raw:string;maxSellRaw:string;decimals:number;usdValue?:number|null};
export function ArcSendAmountControls({wallet,asset,availableUsdc,disabled,value,unit,percentage,onChange,onUnit,onPercentage,refreshKey=0}:{
  wallet:string;asset:string;availableUsdc:string|null;disabled:boolean;value:string;unit:"tokens"|"usd";percentage:25|50|100|null;refreshKey?:number;
  onChange:(value:string)=>void;onUnit:(unit:"tokens"|"usd")=>void;onPercentage:(percent:25|50|100,amount:string)=>void;
}){
  const native=isUsdcAsset(asset),[balance,setBalance]=useState<Balance|null>(null),[failed,setFailed]=useState(false);
  useEffect(()=>{
    setBalance(null);setFailed(false);
    if(native||disabled||!/^0x[0-9a-fA-F]{40}$/.test(asset))return;
    const controller=new AbortController();let pending=false;
    const refresh=async()=>{
      if(pending)return;pending=true;
      try{
        const response=await fetch(`/api/wallet/tokens?token=${encodeURIComponent(asset)}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
        const result=await response.json();
        if(!response.ok||result.walletAddress?.toLowerCase()!==wallet.toLowerCase()||result.token?.address?.toLowerCase()!==asset.toLowerCase())throw Error("Balance unavailable");
        if(!controller.signal.aborted){setBalance(result.token);setFailed(false);}
      }catch{if(!controller.signal.aborted)setFailed(true);}finally{pending=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),15000);
    return()=>{controller.abort();clearInterval(timer);};
  },[wallet,asset,native,disabled,refreshKey]);
  const selected=balance?.address.toLowerCase()===asset.toLowerCase()?balance:null;
  const raw=native?availableUsdc:selected?.maxSellRaw??null,decimals=native?18:selected?.decimals??18;
  return <>
    <p className="otc-fine">{native?`Available: ${availableUsdc===null?"—":displayTokenAmount(formatUnits(BigInt(availableUsdc),18),"native")} USDC`:selected?`Balance: ${displayTokenAmount(selected.balance,asset)}${formatTokenUsd(selected.usdValue)?` · ${formatTokenUsd(selected.usdValue)}`:""}`:failed?"Balance unavailable.":"Select a token to load its balance."}</p>
    <div className="arc-sell-percentages" role="group" aria-label="Send amount unit">{(["tokens","usd"] as const).map(option=><button key={option} type="button" disabled={disabled} aria-pressed={unit===option} onClick={()=>onUnit(option)}>{option==="usd"?"$ USD":native?"USDC":"Tokens"}</button>)}</div>
    <label>{unit==="usd"?"USD value to send":native?"USDC to send":"Tokens to send"}<input required disabled={disabled} inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)}/></label>
    <div className="arc-sell-percentages" role="group" aria-label="Percentage of available funds to send">{([25,50,100] as const).map(percent=><button key={percent} type="button" disabled={disabled||failed||raw===null||BigInt(raw)<=0n} aria-pressed={percentage===percent} onClick={()=>{if(raw!==null)onPercentage(percent,formatUnits(BigInt(raw)*BigInt(percent)/100n,decimals));}}>{percent}%</button>)}</div>
    {percentage!==null&&<p className="otc-fine">Sending {percentage}% of available {native?"USDC after gas":"tokens, allowing for known token taxes"}. The balance is checked when you send.</p>}
    {unit==="usd"&&!native&&<p className="otc-fine">Token quantity uses a current USDC quote.</p>}
  </>;
}
