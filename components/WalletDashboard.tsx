"use client";

import { retainWalletBalances } from "@/lib/wallet-balance-display";
import { otcOrderStatus } from "@/lib/otc/order-display";
import { EthUsdValue } from "./EthUsdValue";
import { ArcTokenBalances } from "./ArcTokenBalances";
import { PublicWalletBalances } from "./PublicWalletBalances";
import {ArcSendAmountControls} from "./ArcSendAmountControls";
import type { WalletTransactionHistory } from "@/lib/otc/transaction-history";
import { ArcTokenPicker } from "./ArcTokenPicker";
import { PersistentNotices, usePersistentNotices } from "./PersistentNotices";
import { ArcTradeControls } from "./ArcTradeControls";
import {readTransactionStatus,waitForTransaction,type TransactionStatus} from "@/lib/arc/transaction-progress";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WalletControlsPreview } from "./WalletControlsPreview";
import { CopyWalletAddress } from "./CopyWalletAddress";
import { useOtcSession, units, usdcUnits, webPost } from "./OtcClient";
type Data={baseUsdc?:{balance:string|null;locked:string;available:string|null};walletAddress:string;balances:Array<{chainId:number;listingReservedWei?:string;balanceWei:string|null;lockedWei:string;availableWei:string|null;pending:boolean;error?:string|null}>;
  orders:Array<{received?:boolean;canRetry?:boolean;escrowAddress?:string;gasRemainderWei?:string;sellerPaymentHash?:string;serviceFeeHash?:string;gasRefundHash?:string;listingId?:string;paymentAsset?:"ETH"|"USDC";approvalHash?:string;payoutAttempt?:number;id:string;amount:string;premiumBps:number;feeWei:string;totalWei:string;status:string;paymentHash?:string;payoutHash?:string;note?:string;side:string;createdAt:number}>;
  listings:Array<{pendingDelivery?:string;closingAfterSettlement?:boolean;canRetry?:boolean;escrow?:{address?:string;note?:string;gasRemainderWei?:string};id:string;available:string;held:string;premiumBps:number;status:string;sold:string;receivedEthWei:string;receivedUsdcUnits:string;returnedUsdc:string|null;settlementLocked:boolean;canCancel:boolean}>;
  transactions:WalletTransactionHistory[]};
type SendQuote={quote:string;amount:string;recipient:string;asset:string;gasWei:string;expiresAt:number};
function settlementNote(note:string){return /^Settlement is waiting for verification or recovery\.(?: Reserved funds remain locked\.)?$/.test(note.trim())?"Pending verification":note;}
export function WalletDashboard({address}:{address?:string}){
  const session=useOtcSession(),[data,setData]=useState<Data|null>(null),[tab,setTab]=useState<"buy"|"sell"|"swap"|"send"|"withdraw">("buy");
  const {notices,notify:setError,dismiss}=usePersistentNotices();
  const [sendUnit,setSendUnit]=useState<"tokens"|"usd">("tokens"),[sendPercent,setSendPercent]=useState<25|50|100|null>(null);
  const [busy,setBusy]=useState(false),[chain,setChain]=useState<5042|8453>(5042),[asset,setAsset]=useState("native"),[token,setToken]=useState(""),[amount,setAmount]=useState(""),[recipient,setRecipient]=useState(""),[quote,setQuote]=useState<SendQuote|null>(null),[now,setNow]=useState(Date.now());
  const balanceRequest=useRef<AbortController|null>(null);
  const [holdingsRefresh,setHoldingsRefresh]=useState(0);
  const [tradeSelection,setTradeSelection]=useState({token:"",revision:0});
  const tradeHeading=useRef<HTMLHeadingElement|null>(null);
  useEffect(()=>{if(tradeSelection.revision){tradeHeading.current?.scrollIntoView({block:"start"});tradeHeading.current?.focus({preventScroll:true});}},[tradeSelection.revision]);
  const selectHoldingTrade=(side:"buy"|"sell",address:string)=>{
    if(busy||!session?.authenticated)return;
    setTab(side);setTradeSelection(previous=>({token:address,revision:previous.revision+1}));
  };
  const completedTransactions=useRef<Set<string>|null>(null);
  useEffect(()=>{setSendUnit("tokens");setSendPercent(null);setAmount("");},[tab,asset,token,session?.walletAddress]);
  const sendInFlight=useRef(false);
  const trackingActive=useRef(true);
  const [sendProgress,setSendProgress]=useState("");
  const trackSend=async(result:TransactionStatus,action:string)=>{
    const completed=await waitForTransaction({...result,leg:"send"},action,{read:readTransactionStatus,wait:()=>new Promise(resolve=>setTimeout(resolve,action==="withdrawal"?10000:3000)),active:()=>trackingActive.current,progress:setSendProgress});
    refreshAfterTransaction(completed.id);
    setError(`${action[0].toUpperCase()+action.slice(1)} completed. See transaction history.`);
  };
  const owns=Boolean(session?.authenticated&&session.walletAddress&&(!address||session.walletAddress?.toLowerCase()===address.toLowerCase()));
  useEffect(()=>{trackingActive.current=owns;return()=>{trackingActive.current=false;};},[owns,session?.walletAddress]);
  const refresh=useCallback(async(force=false)=>{
    if(!owns||balanceRequest.current&&!force)return;
    if(force)balanceRequest.current?.abort();
    const controller=new AbortController();balanceRequest.current=controller;
    try{
      const response=await fetch("/api/otc?scope=wallet",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Wallet data unavailable.");
      if(result.walletAddress?.toLowerCase()!==session?.walletAddress?.toLowerCase())throw new Error("Wallet account changed. Refresh the page.");
      if(!controller.signal.aborted){
        const settled=(result as Data).transactions.filter(tx=>tx.status==="completed"&&["swap","send"].includes(tx.leg)).map(tx=>tx.id);
        if(completedTransactions.current&&settled.some(id=>!completedTransactions.current!.has(id)))setHoldingsRefresh(value=>value+1);
        completedTransactions.current=new Set(settled);
        setData(previous=>retainWalletBalances(previous,result as Data));for(const balance of (result as Data).balances){if(balance.error)setError(`${balance.chainId===5042?"Arc":"Base"}: ${balance.error}`);}
      }
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Wallet data unavailable. Retry shortly.");}
    finally{if(balanceRequest.current===controller)balanceRequest.current=null;}
  },[owns,session?.walletAddress,setError]);
  const refreshAfterTransaction=(id:string)=>{
    completedTransactions.current?.add(id);
    setHoldingsRefresh(value=>value+1);
    void refresh(true);
  };
  useEffect(()=>{setData(null);completedTransactions.current=null;void refresh();const interval=setInterval(()=>void refresh(),10_000);return()=>{clearInterval(interval);balanceRequest.current?.abort();balanceRequest.current=null;};},[refresh]);
  useEffect(()=>{const interval=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(interval);},[]);
  if(address&&!owns)return <PublicWalletBalances key={address} address={address}/>;
  if(!session)return <WalletControlsPreview loading/>;
  if(!owns)return <WalletControlsPreview/>;
  const sendControls = <section className="otc-form-panel"><h2>{tab==="withdraw"?"Withdraw Base":"Send Arc tokens"}</h2><form onSubmit={async e=>{e.preventDefault();if(sendInFlight.current||busy||(asset==="token"&&!/^0x[0-9a-fA-F]{40}$/.test(token)))return;sendInFlight.current=true;setBusy(true);setSendProgress(tab==="withdraw"?"Preparing withdrawal…":"Preparing send…");setQuote(null);try{const prepared=await webPost("/api/wallet/send",{action:"preview",chainId:chain,asset:asset==="token"?token:"native",amount,recipient,amountUnit:sendUnit,...(chain===5042&&sendPercent!==null?{percentage:sendPercent}:{})},session,AbortSignal.timeout(125000));if(chain===8453){setQuote(prepared);}else{if(Date.now()>=prepared.expiresAt)throw new Error("Send quote expired. Try again.");setSendProgress("Preparing send signature…");const result=await webPost("/api/wallet/send",{action:"confirm",quote:prepared.quote},session,AbortSignal.timeout(125000));await trackSend(result,"send");}}catch(e){setError(e instanceof Error&&!/TimeoutError|AbortError/.test(e.name)?e.message:"Request timed out. Check transaction history before submitting again.");}finally{sendInFlight.current=false;setBusy(false);setSendProgress("");void refresh();}}}>
      <p className="otc-fine">{chain===5042?"Arc network · USDC gas":"Base network · ETH gas"}</p>
      {chain===5042&&<label>Asset<select value={asset} onChange={e=>{setAsset(e.target.value);setQuote(null);}}><option value="native">USDC</option><option value="token">Arc token</option></select></label>}
      {asset==="token"&&<ArcTokenPicker label="Token" value={token} disabled={busy} onChange={address=>{setToken(address);setQuote(null);}}/>}
      <>{chain===5042?<ArcSendAmountControls refreshKey={holdingsRefresh} wallet={session.walletAddress??""} asset={asset==="token"?token:"native"} availableUsdc={data?.balances.find(b=>b.chainId===5042)?.availableWei??null} disabled={busy} value={amount} unit={sendUnit} percentage={sendPercent} onChange={value=>{setAmount(value);setSendPercent(null);setQuote(null);}} onUnit={unit=>{if(unit!==sendUnit){setSendUnit(unit);setSendPercent(null);setAmount("");setQuote(null);}}} onPercentage={(percent,value)=>{setSendUnit("tokens");setSendPercent(percent);setAmount(value);setQuote(null);}}/>:<><div className="arc-sell-percentages" role="group" aria-label="Withdrawal amount unit">{(["tokens","usd"] as const).map(unit=><button type="button" key={unit} disabled={busy} aria-pressed={sendUnit===unit} onClick={()=>{if(unit!==sendUnit){setSendUnit(unit);setAmount("");setQuote(null);}}}>{unit==="usd"?"$ USD":"ETH"}</button>)}</div><label>Amount ({sendUnit==="usd"?"USD":"ETH"})<input required disabled={busy} inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setQuote(null);}}/>{asset==="native"&&sendUnit==="tokens"&&<EthUsdValue eth={amount}/>}</label></>}</><label>Recipient<input required value={recipient} onChange={e=>{setRecipient(e.target.value);setQuote(null);}} placeholder="0x…"/></label>
      <button className="arc-button" disabled={busy||(asset==="token"&&!/^0x[0-9a-fA-F]{40}$/.test(token))} type="submit">{busy?sendProgress:tab==="withdraw"?"Review withdrawal":"Send"}</button></form>
      {busy&&<div className="otc-notice" role="status" aria-live="polite">{sendProgress}</div>}
      {quote&&<div className="otc-quote"><h3>{tab==="withdraw"?"Confirm Base withdrawal":"Confirm send"}</h3><p>{quote.amount} {quote.asset}{chain===8453&&quote.asset==="ETH"&&<EthUsdValue eth={quote.amount}/>}</p><p className="otc-address">To {quote.recipient}</p><p>Gas allowance: {units(quote.gasWei,18)} {chain===5042?"USDC":"ETH"}{chain===8453&&<EthUsdValue wei={quote.gasWei}/>}</p><button className="arc-button" disabled={busy||now>=quote.expiresAt} onClick={async()=>{if(sendInFlight.current)return;sendInFlight.current=true;setBusy(true);setSendProgress("Preparing withdrawal signature…");const signedQuote=quote.quote;setQuote(null);try{const result=await webPost("/api/wallet/send",{action:"confirm",quote:signedQuote},session,AbortSignal.timeout(125000));await trackSend(result,"withdrawal");}catch(e){setError(e instanceof Error&&!/TimeoutError|AbortError/.test(e.name)?e.message:"Request timed out. Check transaction history before submitting again.");}finally{sendInFlight.current=false;setBusy(false);setSendProgress("");void refresh();}}}>{now>=quote.expiresAt?"Quote expired":tab==="withdraw"?"Confirm withdrawal":"Confirm send"}</button></div>}
    </section>;
  const balanceCard = (id:number) => {const b=data?.balances.find(item=>item.chainId===id);return <article key={id}><p className="arc-kicker">{id===5042?"ARC / USDC":"BASE / ETH"}</p><h2>{b?.balanceWei==null?"—":id===5042?usdcUnits(b.balanceWei):units(b.balanceWei,18)} <small>{id===5042?"USDC":"ETH"}</small>{id===8453&&<EthUsdValue wei={b?.balanceWei}/>}</h2>{b?.error&&<p className="otc-notice" role="status">{b.error} <button className="otc-inline-button" onClick={()=>void refresh()}>Retry</button></p>}{b?.pending&&<p className="otc-fine">Transaction pending.</p>}{id===8453&&<>{tab==="withdraw"?<div className="base-withdraw-controls"><div className="otc-panel-title"><button type="button" className="otc-inline-button" disabled={busy} onClick={()=>{setTab("buy");setChain(5042);setQuote(null);}}>Close withdrawal ×</button></div>{sendControls}<PersistentNotices notices={notices} dismiss={dismiss}/></div>:<button className="arc-button" disabled={busy||b?.availableWei==null||BigInt(b.availableWei)<=0n} onClick={()=>{setTab("withdraw");setChain(8453);setAsset("native");setAmount("");setRecipient("");setQuote(null);}}>Withdraw</button>}</>}</article>;};
  return <div className="wallet-dashboard">
    {!address&&session.walletAddress&&<div className="wallet-connection-slot"><CopyWalletAddress address={session.walletAddress}/><a className="arc-button" href={`https://www.arcexplorer.org/address/${session.walletAddress}`} target="_blank" rel="noopener noreferrer">View on Arc Explorer ↗</a></div>}
    <div className="otc-wallet-balances">{balanceCard(5042)}</div>
    {session.walletAddress&&<ArcTokenBalances address={session.walletAddress} refreshKey={holdingsRefresh} onTrade={selectHoldingTrade} busy={busy}/>}
    {(tab==="withdraw"||data?.balances.some(b=>b.chainId===8453&&b.balanceWei!=null&&BigInt(b.balanceWei)>0n))&&<div className="otc-wallet-balances">{balanceCard(8453)}</div>}
    <div className="otc-panel-title"><h2 ref={tradeHeading} tabIndex={-1}>Move funds</h2><Link className="arc-text-link" href="/otc">Open OTC market ↗</Link></div>
    <div className="otc-tabs wallet-action-tabs" role="group" aria-label="Wallet action">{["buy","sell","swap","send"].map(action=><button key={action} disabled={busy} aria-pressed={tab===action} onClick={()=>{setTab(action as typeof tab);setChain(5042);setAsset("native");setAmount("");setRecipient("");setQuote(null);}}>{action[0].toUpperCase()+action.slice(1)}</button>)}</div>
    {tab==="buy"||tab==="sell"||tab==="swap"?<ArcTradeControls key={`${tab}:${tradeSelection.revision}`} initialToken={tradeSelection.token} side={tab} onNotice={setError} onBusyChange={setBusy} onCompleted={refreshAfterTransaction} refreshKey={holdingsRefresh}><PersistentNotices notices={notices} dismiss={dismiss}/></ArcTradeControls>:tab==="send"?sendControls:null}
    {tab==="send"&&<PersistentNotices notices={notices} dismiss={dismiss}/>}
    <section className="otc-history"><div className="otc-panel-title"><h2>Your OTC listings</h2></div>{data?.listings.length?[...data.listings].sort((a,b)=>Number(a.status==="cancelled")-Number(b.status==="cancelled")).map(l=><article className="otc-listing-row otc-position-card" key={l.id}><div><strong>{l.closingAfterSettlement?"Closing":l.status==="active"?`${units(l.available)} USDC available`:l.status==="funding"?"Funding escrow":l.status==="closing"?"Returning funds":l.status==="cancelled"?"Cancelled":"Closed"}</strong><p>{(l.premiumBps/100).toLocaleString()}% premium · {units(l.pendingDelivery??l.held)} USDC in pending orders · {l.status==="filled"?"Closed":l.closingAfterSettlement?"Closing":l.status}</p><p>{units(l.sold)} Arc USDC sold · Received {units(l.receivedEthWei,18)} Base ETH <EthUsdValue wei={l.receivedEthWei}/>{BigInt(l.receivedUsdcUnits)>0n&&<> + {units(l.receivedUsdcUnits)} Base USDC</>}</p>{l.escrow?.note&&settlementNote(l.escrow.note)!=="Pending verification"&&<p>{settlementNote(l.escrow.note)}</p>}{l.returnedUsdc!==null&&<p>{units(l.returnedUsdc)} Arc USDC returned to available funds.</p>}</div>{l.canRetry&&<button className="otc-inline-button" disabled={busy} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"retry_escrow",listingId:l.id},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Settlement retry failed.");}finally{setBusy(false);}}}>Retry settlement</button>}{["active","funding"].includes(l.status)&&<button className="otc-inline-button" disabled={busy||!l.canCancel} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"cancel",listingId:l.id},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Cancellation failed.");}finally{setBusy(false);}}}>Cancel listing</button>}</article>):<p className="otc-fine">{data?"No listings.":"Listing records unavailable."}</p>}</section>
    <section className="otc-history"><div className="otc-panel-title"><h2>OTC orders</h2><button className="otc-inline-button" onClick={()=>void refresh()}>Refresh ↻</button></div>{data?.orders.length?data.orders.sort((a,b)=>b.createdAt-a.createdAt).map(order=><article key={order.id} className="otc-order-row"><div><strong>{order.side.toUpperCase()} · {units(order.amount)} Arc USDC</strong><span className="otc-status">{otcOrderStatus(order)}</span></div><p>{new Date(order.createdAt).toLocaleString()} · Premium {(order.premiumBps/100).toLocaleString()}% · Payment {units(order.totalWei,order.paymentAsset==="USDC"?6:18)} Base {order.paymentAsset??"ETH"}{order.paymentAsset!=="USDC"&&<EthUsdValue wei={order.totalWei}/>}</p>{order.note&&!(order.received&&/pending verification|waiting.*verification/i.test(settlementNote(order.note)))&&<p>{settlementNote(order.note)}</p>}{order.canRetry&&<button className="otc-inline-button" disabled={busy} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"retry_escrow",listingId:order.listingId,orderId:order.id},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Settlement retry failed.");}finally{setBusy(false);}}}>Retry settlement</button>}{order.side==="sell"&&order.status==="payout_failed"&&<button className="arc-button" disabled={busy} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"retry_payout",orderId:order.id,attempt:order.payoutAttempt??0},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Payout retry failed.");}finally{setBusy(false);}}}>Retry Arc payout</button>}<div className="otc-transaction-links">{order.paymentHash&&<a href={`https://basescan.org/tx/${order.paymentHash}`} target="_blank" rel="noreferrer">Base payment ↗</a>}{order.payoutHash&&<a href={`https://www.arcexplorer.org/tx/${order.payoutHash}`} target="_blank" rel="noreferrer">Arc payout ↗</a>}</div><small>{order.id}</small></article>):<p className="otc-fine">{data?"No OTC orders.":"Order records unavailable."}</p>}</section>
    <section className="otc-history"><h2>Transactions</h2>{data?.transactions.length?[...data.transactions].sort((a,b)=>b.createdAt-a.createdAt).map(tx=><article key={tx.id} className="otc-listing-row wallet-transaction-row"><div><strong>{tx.chainId===8453&&tx.escrowStep==="seller"?"Base Payout Received":<>{tx.chainId===5042?"Arc":"Base"} · {tx.title}</>}</strong><p>{tx.status.replaceAll("_"," ")} · {new Date(tx.createdAt).toLocaleString()}</p><dl className="wallet-transaction-details">{tx.details.map(detail=><div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}{tx.chainId===8453&&/^\d+(?:\.\d+)? ETH$/.test(detail.value)&&<EthUsdValue eth={detail.value.slice(0,-4)}/>}</dd></div>)}{tx.blockNumber&&<div><dt>Block</dt><dd>{tx.blockNumber}</dd></div>}</dl>{tx.note&&<p>{settlementNote(tx.note)}</p>}</div>{tx.hash&&<a className="arc-text-link" href={`${tx.chainId===5042?"https://www.arcexplorer.org":"https://basescan.org"}/tx/${tx.hash}`} target="_blank" rel="noreferrer" title={tx.hash}>View transaction ↗</a>}</article>):<p className="otc-fine">{data?"No transactions.":"Transaction records unavailable."}</p>}</section>
  </div>;
}
