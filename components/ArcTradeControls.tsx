"use client";
import { ArcTokenPicker } from "./ArcTokenPicker";
import {useState,useEffect,useRef} from "react";
import {formatUnits} from "viem";
import {readTransactionStatus} from "@/lib/arc/transaction-progress";
import { executeTradeFlow, type TradeFlowQuote as Quote } from "@/lib/arc/trade-flow";
import {useOtcSession,webPost} from "./OtcClient";
export function ArcTradeControls({side,disabled=false,onNotice=()=>{},onBusyChange=()=>{}}:{side:"buy"|"sell"|"swap";disabled?:boolean;onNotice?:(message:string)=>void;onBusyChange?:(busy:boolean)=>void}){
  const session=useOtcSession(),[token,setToken]=useState(""),[amount,setAmount]=useState(""),[output,setOutput]=useState("native"),[slippage,setSlippage]=useState("1");
  const [busy,setBusy]=useState(false);
  const active=useRef(true),inFlight=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [progress,setProgress]=useState("");
  const [estimate,setEstimate]=useState<{minimumOut:string;outputSymbol?:string|null;outputAddress?:string;expiresAt:number}|null>(null);
  const [estimateStatus,setEstimateStatus]=useState("");
  const authenticated=session?.authenticated,csrfToken=session?.csrfToken,walletAddress=session?.walletAddress;
  const [tokenBalance,setTokenBalance]=useState<{wallet:string;address:string;balance:string;raw:string;decimals:number}|null>(null);
  const [balanceFailed,setBalanceFailed]=useState(false);
  const selectedBalance=authenticated&&tokenBalance?.wallet.toLowerCase()===walletAddress?.toLowerCase()&&tokenBalance?.address.toLowerCase()===token.toLowerCase()?tokenBalance:null;
  useEffect(()=>{
    setTokenBalance(null);setBalanceFailed(false);
    if(disabled||!authenticated||!walletAddress||!/^0x[0-9a-fA-F]{40}$/.test(token))return;
    const controller=new AbortController();let pending=false;
    const refresh=async()=>{
      if(pending)return;pending=true;
      try{
        const response=await fetch(`/api/wallet/tokens?token=${encodeURIComponent(token)}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
        const result=await response.json();
        if(!response.ok||result.walletAddress?.toLowerCase()!==walletAddress.toLowerCase()||result.token?.address?.toLowerCase()!==token.toLowerCase())throw Error("Balance unavailable");
        if(!controller.signal.aborted){setTokenBalance({...result.token,wallet:walletAddress});setBalanceFailed(false);}
      }catch{if(!controller.signal.aborted){setTokenBalance(null);setBalanceFailed(true);}}finally{pending=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),15000);
    return()=>{controller.abort();clearInterval(timer);};
  },[token,walletAddress,authenticated,disabled,busy]);
  useEffect(()=>{
    setEstimate(null);setEstimateStatus("");
    if(disabled||busy||!authenticated||!token||!/^\d+(\.\d+)?$/.test(amount)||!/[1-9]/.test(amount)||slippage.trim()===""||!Number.isFinite(Number(slippage))||Number(slippage)<0||Number(slippage)>10||(side==="swap"&&(!/^0x[0-9a-fA-F]{40}$/.test(output)||output.toLowerCase()===token.toLowerCase())))return;
    const controller=new AbortController();let expiry:ReturnType<typeof setTimeout>|undefined;
    setEstimateStatus("Estimating…");
    const timer=setTimeout(async()=>{
      try{
        const result=await webPost("/api/wallet/trade",{action:"estimate",tokenIn:side==="buy"?"native":token,tokenOut:side==="buy"?token:side==="sell"?"native":output,amount,slippageBps:Math.round(Number(slippage)*100)},{authenticated,walletAddress,csrfToken},AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]));
        if(controller.signal.aborted)return;
        if(result.expiresAt<=Date.now())throw new Error("Estimate expired. Change the amount to refresh.");
        setEstimate(result);setEstimateStatus("");
        expiry=setTimeout(()=>{setEstimate(null);setEstimateStatus("Estimate expired. Change the amount to refresh.");},result.expiresAt-Date.now());
      }catch{if(!controller.signal.aborted){setEstimate(null);setEstimateStatus("Estimate unavailable. Change the amount to retry.");}}
    },500);
    return()=>{controller.abort();clearTimeout(timer);clearTimeout(expiry);};
  },[side,token,output,amount,slippage,disabled,busy,authenticated,csrfToken,walletAddress]);
  const preview=()=>webPost("/api/wallet/trade",{action:"preview",tokenIn:side==="buy"?"native":token,tokenOut:side==="buy"?token:side==="sell"?"native":output,amount,slippageBps:Math.round(Number(slippage)*100)},session,AbortSignal.timeout(125000)) as Promise<Quote>;
  const execute=async()=>{
    if(inFlight.current||disabled||!session?.authenticated)return;
    inFlight.current=true;setBusy(true);onBusyChange(true);setProgress(`Preparing ${side}…`);
    try{
      if(side==="swap"&&(!/^0x[0-9a-fA-F]{40}$/.test(output)||output.toLowerCase()===token.toLowerCase()))throw new Error("Choose two different token contracts.");
      const initial=await preview();
      const outcome=await executeTradeFlow(initial,{preview,status:readTransactionStatus,confirm:q=>webPost("/api/wallet/trade",{action:"confirm",quote:q},session,AbortSignal.timeout(125000)),wait:()=>new Promise(resolve=>setTimeout(resolve,3000)),active:()=>active.current,progress:message=>setProgress(message.replace(/trade/gi,side))});
      onNotice(outcome.result?`${side[0].toUpperCase()+side.slice(1)} completed. See transaction history.`:outcome.message);
    }catch(e){onNotice(e instanceof Error&&!/TimeoutError|AbortError/.test(e.name)?e.message:"Request timed out. The trade may still complete. Check transaction history before submitting again.");}
    finally{inFlight.current=false;setBusy(false);onBusyChange(false);setProgress("");}
  };
  return <fieldset disabled={disabled||busy} className={`otc-form-panel arc-trade-controls${disabled?" wallet-preview-disabled":""}`}>
    <legend>{side==="buy"?"Buy":side==="sell"?"Sell":"Swap"}</legend>
    <ArcTokenPicker label={side==="swap"?"From token":"Token"} value={token} disabled={disabled||busy} onChange={address=>{setToken(address);}}/>
    {token&&authenticated&&<p className="otc-fine" aria-live="polite">{selectedBalance?`Balance: ${selectedBalance.balance}`:balanceFailed?"Balance unavailable.":"Loading balance…"}</p>}
    {side==="swap"&&<ArcTokenPicker label="To token" value={output==="native"?"":output} disabled={disabled||busy} onChange={address=>{setOutput(address);}}/>}
    {side==="sell"&&<p className="otc-fine">Receive Arc USDC.</p>}
    <label>{side==="buy"?"USDC to spend":side==="sell"?"Tokens to sell":"Tokens to spend"}<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);}} placeholder="0.00"/></label>
    {side==="sell"&&<div className="arc-sell-percentages" aria-label="Percentage of token balance to sell">{([25,50,100] as const).map(percent=><button type="button" key={percent} disabled={disabled||busy||!selectedBalance||BigInt(selectedBalance.raw)===0n} onClick={()=>{if(selectedBalance)setAmount(formatUnits(BigInt(selectedBalance.raw)*BigInt(percent)/100n,selectedBalance.decimals));}}>{percent}%</button>)}</div>}
    <label>Slippage %<input inputMode="decimal" value={slippage} onChange={e=>{setSlippage(e.target.value);}}/></label>
    <div className="arc-trade-estimate" aria-live="polite">{estimate?<><p>You will receive at least <strong>{estimate.minimumOut} {estimate.outputSymbol?estimate.outputSymbol:side==="sell"?"USDC":estimate.outputAddress??(side==="buy"?token:output)}</strong>.</p><small>Estimate includes slippage.</small></>:<p>{estimateStatus}</p>}</div>
    <button type="button" className="arc-button" onClick={()=>void execute()} disabled={disabled||busy||!session?.authenticated||!token||(side==="swap"&&!/^0x[0-9a-fA-F]{40}$/.test(output))}>{busy?progress:side==="buy"?"Buy":side==="sell"?"Sell":"Swap"}</button>
    {busy&&<div className="otc-notice" role="status" aria-live="polite">{progress}</div>}
  </fieldset>;
}
