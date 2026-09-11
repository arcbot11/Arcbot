"use client";
import {startEstimateRefresh} from "@/lib/arc/estimate-refresh";
import {completedTrade} from "@/lib/arc/trade-result";
import {displayTokenAmount,isUsdcAsset} from "@/lib/amount-display";
import { ArcTokenPicker } from "./ArcTokenPicker";
import {useState,useEffect,useRef,type ReactNode} from "react";
import {formatTokenUsd} from "@/lib/arc/token-value";
import {formatUnits} from "viem";
import {readTransactionStatus} from "@/lib/arc/transaction-progress";
import { executeTradeFlow, type TradeFlowQuote as Quote } from "@/lib/arc/trade-flow";
import {useOtcSession,webPost} from "./OtcClient";
export function ArcTradeControls({side,disabled=false,onNotice=()=>{},onBusyChange=()=>{},onCompleted=()=>{},refreshKey=0,initialToken="",children}:{side:"buy"|"sell"|"swap";disabled?:boolean;onNotice?:(message:string)=>void;onBusyChange?:(busy:boolean)=>void;onCompleted?:(id:string)=>void;refreshKey?:number;initialToken?:string;children?:ReactNode}){
  const session=useOtcSession(),[token,setToken]=useState(initialToken),[amount,setAmount]=useState(""),[output,setOutput]=useState("native"),[slippage,setSlippage]=useState("1");
  const [amountUnit,setAmountUnit]=useState<"tokens"|"usd">("tokens");
  const [busy,setBusy]=useState(false);
  const active=useRef(true),inFlight=useRef(false);
  const estimateRouteHint=useRef<string|undefined>(undefined);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [progress,setProgress]=useState("");
  const [estimate,setEstimate]=useState<{minimumOut:string;routeHint?:string;estimatedTokenDebit?:string;inputTaxAmount?:string;inputTaxBps?:number;inputSymbol?:string|null;outputSymbol?:string|null;outputAddress?:string;expiresAt:number}|null>(null);
  const [estimateStatus,setEstimateStatus]=useState("");
  const [completion,setCompletion]=useState<ReturnType<typeof completedTrade>|null>(null);
  const authenticated=session?.authenticated,csrfToken=session?.csrfToken,walletAddress=session?.walletAddress;
  useEffect(()=>{setCompletion(null);},[side,token,output,amount,amountUnit,slippage,walletAddress,authenticated]);
  const [tokenBalance,setTokenBalance]=useState<{wallet:string;address:string;symbol?:string;balance:string;raw:string;maxSellRaw?:string;sellTaxBps?:number;decimals:number;usdValue?:number|null;pricedAt?:string|null}|null>(null);
  const [balanceFailed,setBalanceFailed]=useState(false);
  const selectedBalance=authenticated&&tokenBalance?.wallet.toLowerCase()===walletAddress?.toLowerCase()&&tokenBalance?.address.toLowerCase()===token.toLowerCase()?tokenBalance:null;
  useEffect(()=>{
    setTokenBalance(null);setBalanceFailed(false);
    if(disabled||busy||!authenticated||!walletAddress||!/^0x[0-9a-fA-F]{40}$/.test(token))return;
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
  },[token,walletAddress,authenticated,disabled,busy,refreshKey]);
  useEffect(()=>{
    setEstimate(null);setEstimateStatus("");
    if(completion||disabled||busy||!authenticated||!token||!/^\d+(\.\d+)?$/.test(amount)||!/[1-9]/.test(amount)||slippage.trim()===""||!Number.isFinite(Number(slippage))||Number(slippage)<0||Number(slippage)>10||(side==="swap"&&(!/^0x[0-9a-fA-F]{40}$/.test(output)||output.toLowerCase()===token.toLowerCase())))return;
    return startEstimateRefresh<NonNullable<typeof estimate>>({
      autoRefresh:side==="buy"||side==="sell",
      request:async signal=>{const result=await webPost("/api/wallet/trade",{action:"estimate",routeHint:estimateRouteHint.current,tokenIn:side==="buy"?"native":token,tokenOut:side==="buy"?token:side==="sell"?"native":output,amount,amountUnit:side!=="buy"?amountUnit:"tokens",slippageBps:Math.round(Number(slippage)*100)},{authenticated,walletAddress,csrfToken},AbortSignal.any([signal,AbortSignal.timeout(45000)]));if(!signal.aborted)estimateRouteHint.current=result.routeHint;return result;},
      estimate:setEstimate,
      status:setEstimateStatus,
    });
  },[side,token,output,amount,amountUnit,slippage,disabled,busy,authenticated,csrfToken,walletAddress,completion]);
  const preview=(fixedAmount?:string,routeHint?:string)=>webPost("/api/wallet/trade",{action:"preview",routeHint,tokenIn:side==="buy"?"native":token,tokenOut:side==="buy"?token:side==="sell"?"native":output,amount:fixedAmount??amount,amountUnit:fixedAmount?"tokens":side!=="buy"?amountUnit:"tokens",slippageBps:Math.round(Number(slippage)*100)},session,AbortSignal.timeout(125000)) as Promise<Quote>;
  const execute=async()=>{
    if(inFlight.current||disabled||!session?.authenticated)return;
    inFlight.current=true;setCompletion(null);setBusy(true);onBusyChange(true);setProgress(`Preparing ${side}…`);
    try{
      if(side==="swap"&&(!/^0x[0-9a-fA-F]{40}$/.test(output)||output.toLowerCase()===token.toLowerCase()))throw new Error("Choose two different token contracts.");
      const initial=await preview(undefined,estimate?.routeHint??estimateRouteHint.current);
      const outcome=await executeTradeFlow(initial,{preview,status:readTransactionStatus,confirm:q=>webPost("/api/wallet/trade",{action:"confirm",quote:q},session,AbortSignal.timeout(125000)),wait:()=>new Promise(resolve=>setTimeout(resolve,3000)),active:()=>active.current,progress:message=>setProgress(message.replace(/trade/gi,side))});
      if(outcome.result){const summary=completedTrade(side,outcome.result);setCompletion(summary);onNotice(summary.message);onCompleted(outcome.result.id);}
      else onNotice(outcome.message);
    }catch(e){onNotice(e instanceof Error&&!/TimeoutError|AbortError/.test(e.name)?e.message:"Request timed out. The trade may still complete. Check transaction history before submitting again.");}
    finally{inFlight.current=false;setBusy(false);onBusyChange(false);setProgress("");}
  };
  return <fieldset disabled={disabled||busy} className={`otc-form-panel arc-trade-controls${disabled?" wallet-preview-disabled":""}`}>
    <legend>{side==="buy"?"Buy":side==="sell"?"Sell":"Swap"}</legend>
    <ArcTokenPicker label={side==="swap"?"From token":"Token"} value={token} disabled={disabled||busy} onChange={address=>{setToken(address);}}/>
    {token&&authenticated&&<p className="otc-fine" aria-live="polite">{selectedBalance?(side==="buy"?`${displayTokenAmount(selectedBalance.balance,token)} ${selectedBalance.symbol||"tokens"}${!isUsdcAsset(token)&&Number.isFinite(selectedBalance.usdValue)&&(selectedBalance.usdValue??0)>0?` · ${formatTokenUsd(selectedBalance.usdValue)}`:""}`:`Balance: ${displayTokenAmount(selectedBalance.balance,token)}${isUsdcAsset(token)?" USDC":formatTokenUsd(selectedBalance.usdValue)?` · ${formatTokenUsd(selectedBalance.usdValue)}`:""}`):balanceFailed?"Balance unavailable.":"Loading balance…"}</p>}
    {side==="swap"&&<ArcTokenPicker label="To token" value={output==="native"?"":output} disabled={disabled||busy} onChange={address=>{setOutput(address);}}/>}
    {side==="sell"&&<p className="otc-fine">Receive Arc USDC.</p>}
    {side!=="buy"&&<div className="arc-sell-percentages" role="group" aria-label="Trade amount unit">{(["tokens","usd"] as const).map(unit=><button type="button" key={unit} aria-pressed={amountUnit===unit} onClick={()=>{if(unit!==amountUnit){setAmountUnit(unit);setAmount("");}}}>{unit==="tokens"?"Tokens":"$ USD"}</button>)}</div>}
    <label>{side==="buy"?"USDC to spend":amountUnit==="usd"?(side==="sell"?"USD value to sell":"USD value to swap"):(side==="sell"?"Tokens to sell":"Tokens to swap")}<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);}} placeholder="0.00"/></label>
    {side!=="buy"&&<div className="arc-sell-percentages" aria-label="Percentage of token balance to trade">{([25,50,100] as const).map(percent=><button type="button" key={percent} disabled={disabled||busy||!selectedBalance||BigInt(selectedBalance.raw)===0n} onClick={()=>{if(selectedBalance){setAmountUnit("tokens");setAmount(formatUnits(BigInt(selectedBalance.maxSellRaw??selectedBalance.raw)*BigInt(percent)/100n,selectedBalance.decimals));}}}>{percent}%</button>)}</div>}
    <label>Slippage %<input inputMode="decimal" value={slippage} onChange={e=>{setSlippage(e.target.value);}}/></label>
    <div className="arc-trade-estimate" aria-live="polite">{completion?<><p>{completion.received?<>You received <strong>{completion.received}</strong>.</>:"Trade completed. Received amount unavailable."}</p>{completion.hash&&<a href={`https://www.arcexplorer.org/tx/${completion.hash}`} target="_blank" rel="noopener noreferrer">View transaction on Arc Explorer</a>}</>:estimate?<><p>You will receive at least <strong>{displayTokenAmount(estimate.minimumOut,estimate.outputAddress??(side==="sell"?"native":side==="buy"?token:output))} {estimate.outputSymbol?estimate.outputSymbol:side==="sell"?"USDC":estimate.outputAddress??(side==="buy"?token:output)}</strong>.</p><small>Estimate includes slippage.</small></>:<p>{estimateStatus}</p>}</div>
    <button type="button" className="arc-button" onClick={()=>void execute()} disabled={disabled||busy||!session?.authenticated||!token||(side==="swap"&&!/^0x[0-9a-fA-F]{40}$/.test(output))}>{busy?progress:side==="buy"?"Buy":side==="sell"?"Sell":"Swap"}</button>
    {busy&&<div className="otc-notice" role="status" aria-live="polite">{progress}</div>}
    {children}
  </fieldset>;
}
