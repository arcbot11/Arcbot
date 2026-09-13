"use client";
import {useEffect,useRef,useState} from "react";
import {useWalletSession} from "./WalletSessionProvider";
export function WalletKeyExport({address}:{address?:string}={}){
  const session=useWalletSession(),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [eligibleFor,setEligibleFor]=useState<string>();
  const identity=session?.authenticated?`${session.provider}:${session.walletAddress}:${session.csrfToken}`:undefined;
  const attempt=useRef<string|undefined>(undefined);
  useEffect(()=>{
    const controller=new AbortController();let current=true;
    setEligibleFor(undefined);setBusy(false);setError("");attempt.current=undefined;
    if(process.env.NEXT_PUBLIC_WALLET_EXPORT_ENABLED==="true"&&identity){
      const timer=setTimeout(()=>controller.abort(),10000);
      void fetch("/api/wallet/key-export",{cache:"no-store",signal:controller.signal}).then(async response=>{
        const result=await response.json() as {eligible?:boolean};
        if(current&&response.ok&&result.eligible===true)setEligibleFor(identity);
      }).catch(()=>{/* A failed eligibility check keeps export hidden. */}).finally(()=>clearTimeout(timer));
    }
    return ()=>{current=false;controller.abort();};
  },[identity]);
  if(process.env.NEXT_PUBLIC_WALLET_EXPORT_ENABLED!=="true"||!session?.authenticated||!identity||eligibleFor!==identity)return null;
  if(address&&address.toLowerCase()!==session.walletAddress?.toLowerCase())return null;
  if(session.provider==="telegram")return <p>Export your TG wallet key through the Telegram bot using /export.</p>;
  async function start(){if(busy)return;setBusy(true);setError("");try{
    attempt.current??=crypto.randomUUID();
    const response=await fetch("/api/wallet/key-export",{method:"POST",headers:{"x-argus-csrf":session?.csrfToken??"","content-type":"application/json"},body:JSON.stringify({attemptId:attempt.current}),cache:"no-store",signal:AbortSignal.timeout(15000)});
    const result=await response.json() as {url?:string;error?:string;code?:string};if(result.code==="EXPIRED")attempt.current=undefined;if(!response.ok||!result.url)throw Error(result.error??"Export could not be started.");
    const target=new URL(result.url),expected=process.env.NEXT_PUBLIC_WALLET_EXPORT_ORIGIN;
    if(!expected||target.origin!==expected||target.protocol!=="https:"||target.pathname!=="/api/key-export/view")throw Error("Export destination is not configured.");
    window.location.assign(target.href);
  }catch(e){setError(e instanceof Error?e.message:"Export could not be started.");setBusy(false);}}
  return <div className="wallet-key-export" style={{marginTop:"2rem",paddingTop:"1rem",borderTop:"1px solid var(--arc-line, #294154)"}}><p>Export gives full control of this wallet on every EVM chain. Fresh X verification is required.</p><button type="button" disabled={busy} onClick={()=>void start()}>{busy?"Opening secure export…":"Export private key"}</button>{error&&<p role="alert">{error}</p>}</div>;
}
