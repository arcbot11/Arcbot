"use client";
import styles from "./CreatorFeeClaims.module.css";
import { useEffect,useRef,useState } from "react";
import { useOtcSession,webPost } from "./OtcClient";
import { readTransactionStatus,waitForTransaction } from "@/lib/arc/transaction-progress";
export function CreatorFeeClaims({wallet,onComplete}:{wallet:string;onComplete:()=>void}){
  const session=useOtcSession(),[tokens,setTokens]=useState<Array<{token:string;symbol:string}>>([]),[selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[hash,setHash]=useState("");
  const [discoveryError,setDiscoveryError]=useState(false),[reload,setReload]=useState(0);
  const active=useRef(true),attempt=useRef<{requestId:string;token:string}|null>(null);
  const storageKey=`creator-claim:${wallet.toLowerCase()}`;
  const clearAttempt=()=>{attempt.current=null;try{sessionStorage.removeItem(storageKey);}catch{/* Storage is optional. */}};
  useEffect(()=>{
    const controller=new AbortController();active.current=true;
    try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??"null");if(saved&&/^[\da-f-]{36}$/i.test(saved.requestId)&&/^0x[\da-f]{40}$/i.test(saved.token)){attempt.current=saved;setMessage("Previous claim request saved. Retry to check its status.");}}catch{/* Ignore invalid browser storage. */}
    setDiscoveryError(false);let retry:ReturnType<typeof setTimeout>|undefined;
    const load=async(attemptNumber=0):Promise<void>=>{try{const response=await fetch("/api/wallet/fees",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});if(!response.ok)throw Error("Discovery unavailable");const result=await response.json();if(!controller.signal.aborted&&result.wallet?.toLowerCase()===wallet.toLowerCase()){setTokens(result.tokens);setSelected(attempt.current?.token??result.tokens[0]?.token??"");if(result.incomplete){setDiscoveryError(true);if(attemptNumber<2)retry=setTimeout(()=>void load(attemptNumber+1),2000*(attemptNumber+1));}else setDiscoveryError(false);}}catch{if(controller.signal.aborted)return;if(attemptNumber<2)retry=setTimeout(()=>void load(attemptNumber+1),1000*(attemptNumber+1));else setDiscoveryError(true);}};
    void load();
    return()=>{active.current=false;controller.abort();if(retry)clearTimeout(retry);};
  },[wallet,storageKey,reload]);
  if(!tokens.length)return discoveryError?<p role="status">Creator tokens could not be checked. <button type="button" onClick={()=>setReload(n=>n+1)}>Retry</button></p>:null;
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
  return <section className={styles.panel} aria-labelledby="creator-fees-heading">
    <header className={styles.header}>
      <h2 id="creator-fees-heading">Creator fees</h2>
      {discoveryError&&<p role="status">Token refresh failed. <button type="button" onClick={()=>setReload(n=>n+1)}>Retry</button></p>}
      <p>Claim fees from your tokens. Gas is paid in Arc USDC.</p>
    </header>
    <div className={styles.controls}>
      <label className={styles.field}>
        <span>Token</span>
        <select value={selected} disabled={busy||!!attempt.current} onChange={e=>setSelected(e.target.value)}>
          {tokens.map(t=><option key={t.token} value={t.token}>{t.symbol} · {t.token.slice(0,8)}…{t.token.slice(-4)}</option>)}
        </select>
      </label>
      <button type="button" className={`arc-button ${styles.claim}`} disabled={busy||!selected} onClick={()=>void claim()}>
        {busy?"Claim processing…":attempt.current?"Retry claim":"Claim fees"}
      </button>
    </div>
    {(message||hash)&&<div className={styles.status}>
      {message&&<p role="status">{message}</p>}
      {hash&&<a href={`https://www.arcexplorer.org/tx/${hash}`} target="_blank" rel="noopener noreferrer">Transaction</a>}
    </div>}
  </section>;
}
