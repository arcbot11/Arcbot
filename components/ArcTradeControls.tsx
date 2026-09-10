"use client";
import {useState} from "react";
import {useOtcSession,webPost,units} from "./OtcClient";
type Quote={quote:string;stage:string;amountOut:string;minimumOut:string;protocol:string;gasWei:string;expiresAt:number};
export function ArcTradeControls({side,disabled=false}:{side:"buy"|"sell";disabled?:boolean}){
  const session=useOtcSession(),[token,setToken]=useState(""),[amount,setAmount]=useState(""),[output,setOutput]=useState("native"),[slippage,setSlippage]=useState("1");
  const [quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const review=async()=>{setBusy(true);setNotice("");setQuote(null);try{setQuote(await webPost("/api/wallet/trade",{action:"preview",tokenIn:side==="buy"?"native":token,tokenOut:side==="buy"?token:output,amount,slippageBps:Math.round(Number(slippage)*100)},session));}catch(e){setNotice(e instanceof Error?e.message:"Trade preview failed.");}finally{setBusy(false);}};
  return <fieldset disabled={disabled||busy} className={`otc-form-panel arc-trade-controls${disabled?" wallet-preview-disabled":""}`}>
    <legend>{side==="buy"?"Buy":"Sell / Swap"}</legend>
    <label>Token contract<input value={token} onChange={e=>{setToken(e.target.value);setQuote(null);}} placeholder="0x…"/></label>
    {side==="sell"&&<label>Receive<select value={output==="native"?"native":"token"} onChange={e=>{setOutput(e.target.value==="native"?"native":"");setQuote(null);}}><option value="native">Arc USDC</option><option value="token">Another Arc token</option></select>{output!=="native"&&<input aria-label="Output token contract" placeholder="0x…" value={output} onChange={e=>{setOutput(e.target.value);setQuote(null);}}/>}</label>}
    <label>{side==="buy"?"USDC to spend":"Tokens to spend"}<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setQuote(null);}} placeholder="0.00"/></label>
    <label>Slippage %<input inputMode="decimal" value={slippage} onChange={e=>{setSlippage(e.target.value);setQuote(null);}}/></label>
    <button type="button" className="arc-button" onClick={()=>void review()} disabled={disabled||busy||!session?.authenticated}>{busy?"Checking…":"Review trade"}</button>
    {quote&&<div className="otc-quote"><h3>{quote.stage==="swap"?"Confirm swap":quote.stage}</h3><p>{quote.protocol.toUpperCase()} · Estimated output: {quote.amountOut}</p><p>Minimum output: {quote.minimumOut}</p><p>Gas allowance: {units(quote.gasWei,18)} USDC</p>{quote.stage!=="swap"&&<p>Approve access to the input amount. After confirmation, review the trade again for a fresh price.</p>}<button type="button" className="arc-button" disabled={busy} onClick={async()=>{setBusy(true);try{if(Date.now()>=quote.expiresAt)throw new Error("Quote expired. Review the trade again.");const r=await webPost("/api/wallet/trade",{action:"confirm",quote:quote.quote},session);setQuote(null);setNotice(`${r.leg==="allowance"?"Approval":"Swap"} recorded: ${r.status}. Check transaction history before continuing.`);}catch(e){setNotice(e instanceof Error?e.message:"Trade failed.");}finally{setBusy(false);}}}>Confirm {quote.stage}</button></div>}
    {notice&&<p role="status">{notice} {notice.startsWith("Reconnect")&&<a href="/api/auth/x/start">Reconnect X</a>}</p>}
  </fieldset>;
}
