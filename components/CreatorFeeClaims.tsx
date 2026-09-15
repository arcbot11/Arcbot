"use client";
import { useEffect,useRef,useState } from "react";
import { useOtcSession,webPost } from "./OtcClient";
import { readTransactionStatus,waitForTransaction } from "@/lib/arc/transaction-progress";
export function CreatorFeeClaims({wallet,onComplete}:{wallet:string;onComplete:()=>void}){
  const session=useOtcSession(),[tokens,setTokens]=useState<Array<{token:string;symbol:string}>>([]),[selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[hash,setHash]=useState("");
  const active=useRef(true),attempt=useRef<{requestId:string;token:string}|null>(null);
  const storageKey=`creator-claim:${wallet.toLowerCase()}`;
  const clearAttempt=()=>{attempt.current=null;try{sessionStorage.removeItem(storageKey);}catch{/* Storage is optional. */}};
  useEffect(()=>{
    const controller=new AbortController();active.current=true;
    try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??"null");if(saved&&/^[\da-f-]{36}$/i.test(saved.requestId)&&/^0x[\da-f]{40}$/i.test(saved.token)){attempt.current=saved;setMessage("Previous claim request saved. Retry to check its status.");}}catch{/* Ignore invalid browser storage. */}
    void fetch("/api/wallet/fees",{cache:"no-store",signal:controller.signal}).then(async response=>{if(!response.ok)return;const result=await response.json();if(!controller.signal.aborted&&result.wallet?.toLowerCase()===wallet.toLowerCase()){setTokens(result.tokens);setSelected(attempt.current?.token??result.tokens[0]?.token??"");}}).catch(()=>{});
    return()=>{active.current=false;controller.abort();};
  },[wallet,storageKey]);
  if(!tokens.length)return null;
  async function claim(){
    if(busy)return;
    attempt.current??={requestId:crypto.randomUUID(),token:selected};
    try{sessionStorage.setItem(storageKey,JSON.stringify(attempt.current));}catch{/* The in-memory ID still prevents duplicate retries. */}
    setBusy(true);setMessage("Preparing fee claim…");setHash("");
    try{
      const result=await webPost("/api/wallet/fees",attempt.current,session,AbortSignal.timeout(125000));
      if(!result.id&&result.ok===false){clearAttempt();setMessage(result.message);return;}
      if(["reverted","cancelled"].includes(result.status)){clearAttempt();setMessage(result.message);return;}
      const complete=await waitForTransaction({...result,leg:"claim"},"fee claim",{read:readTransactionStatus,wait:()=>new Promise(resolve=>setTimeout(resolve,3000)),active:()=>active.current,progress:setMessage});
      if(active.current){clearAttempt();setMessage("Fees claimed.");setHash(complete.hash??"");onComplete();}
    }catch(error){if(active.current)setMessage(error instanceof Error?error.message:"Claim could not be confirmed. Retry the same request.");}
    finally{if(active.current)setBusy(false);}
  }
  return <section className="otc-panel"><h2>Creator fees</h2><p>Claim credited fees to this wallet. Gas is paid in Arc USDC.</p><label>Token<select value={selected} disabled={busy||!!attempt.current} onChange={e=>setSelected(e.target.value)}>{tokens.map(t=><option key={t.token} value={t.token}>{t.symbol} · {t.token.slice(0,8)}…{t.token.slice(-4)}</option>)}</select></label><button className="arc-button" disabled={busy||!selected} onClick={()=>void claim()}>{busy?"Claim processing…":attempt.current?"Retry claim":"Claim fees"}</button>{message&&<p role="status">{message}</p>}{hash&&<a href={`https://www.arcexplorer.org/tx/${hash}`} target="_blank" rel="noopener noreferrer">Transaction</a>}</section>;
}
