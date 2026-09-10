"use client";
import { ArcTokenPicker } from "./ArcTokenPicker";
import {useState,useEffect,useRef} from "react";
import { executeTradeFlow, type TradeFlowQuote as Quote } from "@/lib/arc/trade-flow";
import {useOtcSession,webPost} from "./OtcClient";
export function ArcTradeControls({side,disabled=false,onNotice=()=>{}}:{side:"buy"|"sell"|"swap";disabled?:boolean;onNotice?:(message:string)=>void}){
  const session=useOtcSession(),[token,setToken]=useState(""),[amount,setAmount]=useState(""),[output,setOutput]=useState("native"),[slippage,setSlippage]=useState("1");
  const [busy,setBusy]=useState(false);
  const active=useRef(true),inFlight=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [progress,setProgress]=useState("");
  const [estimate,setEstimate]=useState<{minimumOut:string;expiresAt:number}|null>(null);
  const [estimateStatus,setEstimateStatus]=useState("");
  const authenticated=session?.authenticated,csrfToken=session?.csrfToken,walletAddress=session?.walletAddress;
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
  const preview=()=>webPost("/api/wallet/trade",{action:"preview",tokenIn:side==="buy"?"native":token,tokenOut:side==="buy"?token:side==="sell"?"native":output,amount,slippageBps:Math.round(Number(slippage)*100)},session) as Promise<Quote>;
  const execute=async()=>{
    if(inFlight.current||disabled||!session?.authenticated)return;
    inFlight.current=true;setBusy(true);setProgress(`Preparing ${side}…`);
    try{
      if(side==="swap"&&(!/^0x[0-9a-fA-F]{40}$/.test(output)||output.toLowerCase()===token.toLowerCase()))throw new Error("Choose two different token contracts.");
      const initial=await preview();
      const outcome=await executeTradeFlow(initial,{preview,confirm:q=>webPost("/api/wallet/trade",{action:"confirm",quote:q},session),wait:()=>new Promise(resolve=>setTimeout(resolve,3000)),active:()=>active.current,progress:message=>setProgress(message.replace("trade",side))});
      onNotice(outcome.result?`Trade recorded: ${outcome.result.status}. Check transaction history.`:outcome.message);
    }catch(e){onNotice(e instanceof Error?e.message:"Trade failed. Check transaction history.");}
    finally{inFlight.current=false;setBusy(false);setProgress("");}
  };
  return <fieldset disabled={disabled||busy} className={`otc-form-panel arc-trade-controls${disabled?" wallet-preview-disabled":""}`}>
    <legend>{side==="buy"?"Buy":side==="sell"?"Sell":"Swap"}</legend>
    <ArcTokenPicker label={side==="swap"?"From token":"Token"} value={token} disabled={disabled||busy} onChange={address=>{setToken(address);}}/>
    {side==="swap"&&<ArcTokenPicker label="To token" value={output==="native"?"":output} disabled={disabled||busy} onChange={address=>{setOutput(address);}}/>}
    {side==="sell"&&<p className="otc-fine">Receive Arc USDC.</p>}
    <label>{side==="buy"?"USDC to spend":"Tokens to spend"}<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);}} placeholder="0.00"/></label>
    <label>Slippage %<input inputMode="decimal" value={slippage} onChange={e=>{setSlippage(e.target.value);}}/></label>
    <div className="arc-trade-estimate" aria-live="polite">{estimate?<><p>You will receive at least <strong>{estimate.minimumOut} {side==="sell"?"USDC":"tokens"}</strong>.</p><small>Estimate includes slippage. Rechecked when you submit.</small></>:<p>{estimateStatus}</p>}</div>
    <button type="button" className="arc-button" onClick={()=>void execute()} disabled={disabled||busy||!session?.authenticated||!token||(side==="swap"&&!/^0x[0-9a-fA-F]{40}$/.test(output))}>{busy?progress:side==="buy"?"Buy":side==="sell"?"Sell":"Swap"}</button>
  </fieldset>;
}
