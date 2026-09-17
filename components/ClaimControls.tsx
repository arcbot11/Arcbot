"use client";
import { useEffect, useRef, useState } from "react";
import { useWalletSession } from "./WalletSessionProvider";
import { WalletSignInButton } from "./WalletSignInButton";
import type { rewardSnapshot } from "@/lib/launches/reward-service";
type Snapshot=Awaited<ReturnType<typeof rewardSnapshot>>;
type Request={token:string;requestId:string;action:"distribute"|"holders";offset:number};
const amount=(value:string)=>Number(value).toLocaleString(undefined,{maximumFractionDigits: Number(value)>0&&Number(value)<.01?6:2});
export function ClaimControls(){
  const session=useWalletSession(),[token,setToken]=useState(""),[data,setData]=useState<Snapshot|null>(null),[loading,setLoading]=useState(false),[notice,setNotice]=useState(""),[hash,setHash]=useState<string>(),[job,setJob]=useState<Request|null>(null),[busy,setBusy]=useState(false);
  const [results,setResults]=useState<string[]>([]);
  const running=useRef(false),epoch=useRef(0);
  const [requestFailed,setRequestFailed]=useState(false);
  const [gasBalance,setGasBalance]=useState<{wallet:string;wei:string}|null>(null);
  const wallet=session?.authenticated?session.walletAddress?.toLowerCase():undefined;
  const noGas=!!wallet&&gasBalance?.wallet===wallet&&gasBalance.wei==="0";
  useEffect(()=>{
    setGasBalance(null);
    if(!wallet)return;
    const controller=new AbortController();let reading=false;
    const refresh=async()=>{
      if(reading||document.visibilityState==="hidden")return;
      reading=true;
      try{
        const response=await fetch("/api/wallet/balance?chain=5042",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
        if(!response.ok)return;
        const result=await response.json();
        if(!controller.signal.aborted&&result.walletAddress?.toLowerCase()===wallet&&typeof result.balanceWei==="string"&&/^\d+$/.test(result.balanceWei))setGasBalance({wallet,wei:BigInt(result.balanceWei).toString()});
      }catch{/* A failed read is not a zero balance. */}finally{reading=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),30000);
    window.addEventListener("focus",refresh);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[wallet,job?.requestId]);
  const key=session?.walletAddress?`argos-claim:${session.walletAddress.toLowerCase()}`:null;
  useEffect(()=>{epoch.current++;setResults([]);setRequestFailed(false);setJob(null);setBusy(false);setHash(undefined);if(key){try{const saved=sessionStorage.getItem(key);if(saved){const parsed=JSON.parse(saved) as Request;if(/^0x[\da-f]{40}$/i.test(parsed.token)&&["holders","distribute"].includes(parsed.action)){setJob(parsed);setNotice("Checking saved transaction.");}}}catch{/* Optional storage. */}}},[key]);
  async function load(address=token){const version=++epoch.current;setResults([]);setHash(undefined);setLoading(true);setNotice("");try{const r=await fetch(`/api/claim?token=${encodeURIComponent(address)}`,{cache:"no-store"});const value=await r.json();if(!r.ok)throw Error(value.error);if(version===epoch.current){setData(value);}}catch(e){if(version===epoch.current){setData(null);setNotice(e instanceof Error?e.message:"Could not load fees.");}}finally{if(version===epoch.current)setLoading(false);}}
  async function submit(request:Request,resume=false){
    if(running.current||!session?.csrfToken||!key)return;
    running.current=true;setBusy(true);const version=epoch.current;
    try{const r=await fetch("/api/claim",{method:"POST",headers:{"content-type":"application/json","x-argus-csrf":session.csrfToken},signal:AbortSignal.timeout(90000),body:JSON.stringify({...request,resume})});const result=await r.json();if(version!==epoch.current)return;if(!r.ok)throw Error(result.error);setRequestFailed(!!result.missing);setNotice(result.message);setResults(result.results??[]);setHash(result.hash);if(!result.pending&&!result.missing){setJob(null);try{sessionStorage.removeItem(key);}catch{/* Optional storage. */}if(result.status==="completed"){const fresh=await fetch(`/api/claim?token=${request.token}`,{cache:"no-store"});if(fresh.ok&&version===epoch.current){setData(await fresh.json());setNotice("Transaction confirmed. Balances refreshed.");}}}}
    catch(e){if(version===epoch.current){setRequestFailed(true);setNotice(e instanceof Error?e.message:"Request uncertain. Check your wallet history.");}}
    finally{running.current=false;setBusy(false);}
  }
  useEffect(()=>{if(!job||!session?.authenticated)return;const timer=setInterval(()=>void submit(job,true),6000);return()=>clearInterval(timer);/* submit reads the current session */},[job,session]); // eslint-disable-line react-hooks/exhaustive-deps
  function start(action:Request["action"]){if(!data||!key||job||running.current)return;const request={token:data.token,requestId:crypto.randomUUID(),action,offset:0};try{sessionStorage.setItem(key,JSON.stringify(request));}catch{/* Server journal remains authoritative. */}setResults([]);setRequestFailed(false);setHash(undefined);setNotice("Processing. Preparing transaction.");setJob(request);void submit(request);}
  const disabled=!session?.authenticated||!!session.needsReauth||!!job||busy||noGas;
  const allocationTotal=data?Object.values(data.allocation).reduce((a,b)=>a+b,0):0;
  const share=(value:number)=>allocationTotal?`${(value*100/allocationTotal).toFixed(1)}% of token fees`:"";
  return <section className="claim-page"><h1>Crank</h1><p>Argus automated distribution is slow due to high volume. You can call the contract to crank fees, releasing them for creators to claim, buying back and burning, or distributing to holders. Enter a contract address to see eligible funds.</p>
    <form className="claim-lookup" onSubmit={e=>{e.preventDefault();void load();}}><label style={{flex:1}}>Token contract<input aria-label="Token contract address" placeholder="0x…" value={token} disabled={!!job} onChange={e=>setToken(e.target.value)} required pattern="0x[a-fA-F0-9]{40}"/></label><button disabled={loading||!!job}>{loading?"Loading…":"Load token"}</button></form>
    {notice&&<div className="claim-status" role="status"><div className="claim-status-actions"><button aria-label="Dismiss message" onClick={()=>setNotice("")}>×</button>{job&&requestFailed&&<button className="claim-retry" disabled={busy} onClick={()=>void submit(job,false)}>Retry same request</button>}</div>{notice}{results.length>0&&<ul>{results.map((line,i)=><li key={i}>{line}</li>)}</ul>}{hash&&<p><a href={`https://www.arcexplorer.org/tx/${hash}`} target="_blank" rel="noreferrer">Transaction</a></p>}</div>}
    {noGas&&<div className="claim-status" role="alert">You must now fund your Argos Bot wallet with Arc USDC for gas.</div>}
    {data&&<><h2>{data.symbol}</h2><p className="claim-contract">{data.token}</p><p>Each action uses your wallet’s Arc USDC for gas (approximately 0.02 USDC each time). Funds go to the recipients set by the token contract.</p>
      {!session?.authenticated||session.needsReauth?<WalletSignInButton destination="/claim">Sign in to Wallet</WalletSignInButton>:<p className="claim-wallet">You are using your {session.provider==="telegram"?"Telegram-linked":"X-linked"} wallet ({session.walletAddress?.slice(0,6)}…{session.walletAddress?.slice(-5)}).</p>}
      <div className="claim-grid">
        <article className="claim-card"><h3>Awaiting distribution</h3><strong>{amount(data.unallocatedQuote)} {data.quoteSymbol}</strong><strong>{amount(data.unallocatedTokens)} {data.symbol}</strong><p>Fees not yet allocated to creator rewards, holders, burn, or liquidity.</p><small>Already allocated creator fees and liquidity reserves are excluded.</small><button disabled={disabled||!data.canDistribute} onClick={()=>start("distribute")}>Distribute fees</button></article>
        {data.allocation.creator>0&&<article className="claim-card"><h3>Claimable creator fees</h3><small>{share(data.allocation.creator)}</small><strong>{amount(data.creatorQuote)} {data.quoteSymbol}</strong><strong>{amount(data.creatorTokens)} {data.symbol}</strong>{Number(data.creatorUsdc)>0&&<strong>{amount(data.creatorUsdc)} USDC</strong>}<p>These fees are allocated to the creator and remain in the splitter until claimed; they are excluded from Awaiting distribution.</p><a href={`https://arguspad.io/token/${data.token}`} target="_blank" rel="noreferrer">Go to this page and click Claim Fees to claim available fees</a></article>}
        {data.allocation.holders>0&&<><article className="claim-card"><h3>Funded for holders</h3><small>{share(data.allocation.holders)}</small><strong>{amount(data.holderFunds)} {data.payoutSymbol}</strong><p>Rewards already in the holder contract pay each eligible holder according to their recorded entitlement.</p><small>Total paid: {amount(data.paid)} {data.payoutSymbol}</small><div className="claim-actions"><button disabled={disabled||!data.canPay} onClick={()=>start("holders")}>Send to holders</button></div><small>Automatically checks the next 50 holders. Confirmed payouts advance this token’s shared queue, returning to the beginning at the end.</small></article><article className="claim-card"><h3>Held for future rewards</h3><strong>{amount(data.heldFunds)} {data.payoutSymbol}</strong><p>This portion of holder funding is held by the contract until its reward conditions are met.</p></article></>}
        {data.allocation.burn>0&&<article className="claim-card"><h3>Buyback and burn</h3><strong>{share(data.allocation.burn)}</strong><p>Distributing fees uses the contract’s burn allocation to buy and burn tokens within its current limits.</p><small>This allocation is part of the splitter balance, not an additional balance.</small><button disabled={disabled||!data.canDistribute} onClick={()=>start("distribute")}>Run distribution and burn</button></article>}
        {data.allocation.liquidity>0&&<article className="claim-card"><h3>Reserved for liquidity</h3><small>{share(data.allocation.liquidity)}</small><strong>{amount(data.principalQuote)} {data.quoteSymbol}</strong><strong>{amount(data.principalTokens)} {data.symbol}</strong><p>These funds are reserved by the contract for adding liquidity rather than holder or creator payouts.</p></article>}
      </div><small>Read from Arc block {data.block}. A confirmed call may process only part of the balance; contract limits still apply.</small><p><button disabled={loading||!!job} onClick={()=>void load(data.token)}>Refresh balances</button></p></>}
  </section>;
}
