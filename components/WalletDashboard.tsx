"use client";
import {CreatorFeeClaims} from "./CreatorFeeClaims";
import { BASE_USDC } from "@/lib/base/usdc";
import { displayEth } from "@/lib/amount-display";
import { ActiveStatus } from "./ActiveStatus";

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
import { WalletControlsPreview } from "./WalletControlsPreview";
import { CopyWalletAddress } from "./CopyWalletAddress";
import { useOtcSession, units, usdcUnits, ethUnits, webPost } from "./OtcClient";
type Data={baseUsdc?:{balance:string|null;locked:string;available:string|null};walletAddress:string;balances:Array<{chainId:number;observedAt?:number|null;balanceDeficitWei?:string;listingReservedWei?:string;balanceWei:string|null;lockedWei:string;availableWei:string|null;pending:boolean;error?:string|null}>;
  orders:Array<{received?:boolean;canRetry?:boolean;escrowAddress?:string;gasRemainderWei?:string;sellerPaymentHash?:string;serviceFeeHash?:string;gasRefundHash?:string;listingId?:string;paymentAsset?:"ETH"|"USDC";approvalHash?:string;payoutAttempt?:number;id:string;amount:string;premiumBps:number;feeWei:string;totalWei:string;status:string;updatedAt?:number;paymentHash?:string;payoutHash?:string;note?:string;side:string;createdAt:number}>;
  listings:Array<{pendingDelivery?:string;closingAfterSettlement?:boolean;canRetry?:boolean;escrow?:{address?:string;note?:string;gasRemainderWei?:string};id:string;available:string;held:string;premiumBps:number;status:string;sold:string;receivedEthWei:string;receivedUsdcUnits:string;returnedUsdc:string|null;settlementLocked:boolean;canCancel:boolean}>;
  transactions:WalletTransactionHistory[]};
function listingDisplayOrder(listing:Data["listings"][number]){
  if(listing.status==="active"&&!listing.closingAfterSettlement)return 0;
  if(listing.status==="funding")return 1;
  if(listing.status==="closing"||listing.closingAfterSettlement)return 2;
  return 3;
}
type SendQuote={quote:string;amount:string;recipient:string;asset:string;gasWei:string;expiresAt:number};
function settlementNote(note:string){return /^Settlement is waiting for verification or recovery\.(?: Reserved funds remain locked\.)?$/.test(note.trim())?"Pending verification":note;}
export function WalletDashboard({address}:{address?:string}){
  const session=useOtcSession(),[data,setData]=useState<Data|null>(null),[tab,setTab]=useState<"buy"|"sell"|"swap"|"send"|"withdraw">("buy");
  const {notices,notify:setError,dismiss}=usePersistentNotices();
  const [sendUnit,setSendUnit]=useState<"tokens"|"usd">("tokens"),[sendPercent,setSendPercent]=useState<25|50|100|null>(null);
  const [busy,setBusy]=useState(false),[chain,setChain]=useState<5042|8453>(5042),[asset,setAsset]=useState("native"),[token,setToken]=useState(""),[amount,setAmount]=useState(""),[recipient,setRecipient]=useState(""),[quote,setQuote]=useState<SendQuote|null>(null),[now,setNow]=useState(Date.now());
  const balanceRequest=useRef<AbortController|null>(null);
  const historyOpen=useRef(new Set<string>());
  const [historyCursors,setHistoryCursors]=useState<Record<string,string|null>>({});
  const [historyLoading,setHistoryLoading]=useState<Record<string,boolean>>({});
  const historyRequests=useRef(new Map<string,AbortController>());
  const expandedHistory=useRef(new Set<string>());
  const priorActive=useRef<string[]>([]);
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
    const completed=await waitForTransaction({...result,leg:"send"},action,{read:readTransactionStatus,wait:()=>new Promise(resolve=>setTimeout(resolve,3000)),active:()=>trackingActive.current,progress:setSendProgress});
    refreshAfterTransaction(completed.id);
    setError(`${action[0].toUpperCase()+action.slice(1)} completed. See transaction history.`);
  };
  const owns=Boolean(session?.authenticated&&session.walletAddress&&(!address||session.walletAddress?.toLowerCase()===address.toLowerCase()));
  useEffect(()=>{trackingActive.current=owns;return()=>{trackingActive.current=false;};},[owns,session?.walletAddress]);
  const loadHistory=useCallback(async(section:string,cursor?:string)=>{
    if(!owns||historyRequests.current.has(section))return;
    const controller=new AbortController();historyRequests.current.set(section,controller);setHistoryLoading(p=>({...p,[section]:true}));
    try{
      const response=await fetch('/api/wallet/data?part='+section+(cursor?'&cursor='+encodeURIComponent(cursor):''),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
      const result=await response.json();if(!response.ok)throw Error(result.error||'History could not refresh.');
      if(controller.signal.aborted||result.walletAddress?.toLowerCase()!==session?.walletAddress?.toLowerCase())return;
      if(cursor)expandedHistory.current.add(section);
      if(cursor||!expandedHistory.current.has(section))setHistoryCursors(p=>({...p,[section]:result.cursor}));
      setData(prior=>{const previous=prior??{walletAddress:result.walletAddress,balances:[],listings:[],orders:[],transactions:[]};const key=section as 'listings'|'orders'|'transactions';return {...previous,[key]:cursor||expandedHistory.current.has(section)?[...new Map([...previous[key],...result[key]].map(item=>[item.id,item])).values()]:result[key]};});
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'History could not refresh.');}
    finally{if(historyRequests.current.get(section)===controller){historyRequests.current.delete(section);setHistoryLoading(p=>({...p,[section]:false}));}}
  },[owns,session?.walletAddress,setError]);
  const refresh=useCallback(async(force=false)=>{
    if(!owns||balanceRequest.current&&!force)return;
    if(force)balanceRequest.current?.abort();
    const controller=new AbortController();balanceRequest.current=controller;
    const empty:Data={walletAddress:session?.walletAddress??"",balances:[],orders:[],listings:[],transactions:[]};
    try{await Promise.all(['summary','arc','base','base-usdc'].map(async part=>{
      try{
        const response=await fetch('/api/wallet/data?part='+part,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
        const result=await response.json();if(!response.ok)throw Error(result.error||'Wallet data could not refresh.');
        if(controller.signal.aborted||result.walletAddress?.toLowerCase()!==session?.walletAddress?.toLowerCase())return;
        if(part==='summary'){
          const active=(result.active??[]).map((t:{id:string})=>t.id);
          if(priorActive.current.some(id=>!active.includes(id)))setHoldingsRefresh(value=>value+1);
          priorActive.current=active;return;
        }
        setData(previous=>{const old=previous??empty;return retainWalletBalances(old,{...old,...(result.baseUsdc?{baseUsdc:result.baseUsdc}:{}),balances:result.balances?[...old.balances.filter(b=>!result.balances.some((n:{chainId:number})=>n.chainId===b.chainId)),...result.balances]:old.balances});});
      }catch{
        if(controller.signal.aborted)return;
        // Keep display values, but never keep stale spendable amounts.
        setData(previous=>{if(!previous)return previous;if(part==='arc'||part==='base'){const id=part==='arc'?5042:8453;return {...previous,balances:previous.balances.map(b=>b.chainId===id?{...b,availableWei:null,error:'Balance could not refresh.'}:b)};}if(part==='base-usdc'&&previous.baseUsdc)return {...previous,baseUsdc:{...previous.baseUsdc,available:null}};return previous;});
      }
    }));}finally{if(balanceRequest.current===controller)balanceRequest.current=null;}
    if(!controller.signal.aborted)for(const section of historyOpen.current)void loadHistory(section);
  },[owns,session?.walletAddress,loadHistory]);
  const refreshAfterTransaction=(id:string)=>{
    completedTransactions.current?.add(id);
    setHoldingsRefresh(value=>value+1);
    void refresh(true);
  };
  useEffect(()=>{const requests=historyRequests.current;setData(null);setHistoryCursors({});setHistoryLoading({});expandedHistory.current.clear();priorActive.current=[];completedTransactions.current=null;void refresh();const interval=setInterval(()=>void refresh(),10_000);return()=>{clearInterval(interval);balanceRequest.current?.abort();balanceRequest.current=null;for(const c of requests.values())c.abort();requests.clear();};},[refresh]);
  useEffect(()=>{const interval=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(interval);},[]);
  if(address&&!owns)return <PublicWalletBalances key={address} address={address}/>;
  if(!session)return <WalletControlsPreview loading/>;
  if(!owns)return <WalletControlsPreview/>;
  const sendControls = <section className="otc-form-panel"><h2>{tab==="withdraw"?`Withdraw Base ${asset==="usdc"?"USDC":"ETH"}`:"Send Arc tokens"}</h2><form onSubmit={async e=>{e.preventDefault();if(sendInFlight.current||busy||(asset==="token"&&!/^0x[0-9a-fA-F]{40}$/.test(token)))return;sendInFlight.current=true;setBusy(true);setSendProgress(tab==="withdraw"?"Preparing withdrawal…":"Preparing send…");setQuote(null);try{const prepared=await webPost("/api/wallet/send",{action:"preview",chainId:chain,asset:asset==="usdc"?BASE_USDC:asset==="token"?token:"native",amount,recipient,amountUnit:sendUnit,...(chain===5042&&sendPercent!==null?{percentage:sendPercent}:{})},session,AbortSignal.timeout(125000));if(chain===8453){setQuote(prepared);}else{if(Date.now()>=prepared.expiresAt)throw new Error("Send quote expired. Try again.");setSendProgress("Preparing send signature…");const result=await webPost("/api/wallet/send",{action:"confirm",quote:prepared.quote},session,AbortSignal.timeout(125000));await trackSend(result,"send");}}catch(e){setError(e instanceof Error&&!/TimeoutError|AbortError/.test(e.name)?e.message:"Request timed out. Check transaction history before submitting again.");}finally{sendInFlight.current=false;setBusy(false);setSendProgress("");void refresh();}}}>
      <p className="otc-fine">{chain===5042?"Arc network · USDC gas":"Base network · ETH gas"}</p>
      {chain===5042&&<label>Asset<select value={asset} onChange={e=>{setAsset(e.target.value);setQuote(null);}}><option value="native">USDC</option><option value="token">Arc token</option></select></label>}
      {asset==="token"&&<ArcTokenPicker label="Token" value={token} disabled={busy} onChange={address=>{setToken(address);setQuote(null);}}/>}
      <>{chain===5042?<ArcSendAmountControls refreshKey={holdingsRefresh} wallet={session.walletAddress??""} asset={asset==="token"?token:"native"} availableUsdc={data?.balances.find(b=>b.chainId===5042)?.availableWei??null} disabled={busy} value={amount} unit={sendUnit} percentage={sendPercent} onChange={value=>{setAmount(value);setSendPercent(null);setQuote(null);}} onUnit={unit=>{if(unit!==sendUnit){setSendUnit(unit);setSendPercent(null);setAmount("");setQuote(null);}}} onPercentage={(percent,value)=>{setSendUnit("tokens");setSendPercent(percent);setAmount(value);setQuote(null);}}/>:<>{asset!=="usdc"&&<div className="arc-sell-percentages" role="group" aria-label="Withdrawal amount unit">{(["tokens","usd"] as const).map(unit=><button type="button" key={unit} disabled={busy} aria-pressed={sendUnit===unit} onClick={()=>{if(unit!==sendUnit){setSendUnit(unit);setAmount("");setQuote(null);}}}>{unit==="usd"?"$ USD":"ETH"}</button>)}</div>}<label>Amount ({asset==="usdc"?"USDC":sendUnit==="usd"?"USD":"ETH"})<input required disabled={busy} inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setQuote(null);}}/>{asset==="native"&&sendUnit==="tokens"&&<EthUsdValue eth={amount}/>}</label></>}</><label>Recipient<input required value={recipient} onChange={e=>{setRecipient(e.target.value);setQuote(null);}} placeholder="0x…"/></label>
      <button className="arc-button" disabled={busy||(asset==="token"&&!/^0x[0-9a-fA-F]{40}$/.test(token))} type="submit">{busy?<ActiveStatus text={sendProgress} active={busy}/>:tab==="withdraw"?"Review withdrawal":"Send"}</button></form>
      {busy&&<div className="otc-notice" role="status" aria-live="polite"><ActiveStatus text={sendProgress} active={busy}/></div>}
      {quote&&<div className="otc-quote"><h3>{tab==="withdraw"?"Confirm Base withdrawal":"Confirm send"}</h3><p>{quote.asset==="ETH"?displayEth(quote.amount):quote.amount} {quote.asset}{chain===8453&&quote.asset==="ETH"&&<EthUsdValue eth={quote.amount}/>}</p><p className="otc-address">To {quote.recipient}</p><p>Gas allowance: {chain===8453?ethUnits(quote.gasWei):units(quote.gasWei,18)} {chain===5042?"USDC":"ETH"}{chain===8453&&<EthUsdValue wei={quote.gasWei}/>}</p><button className="arc-button" disabled={busy||now>=quote.expiresAt} onClick={async()=>{if(sendInFlight.current)return;sendInFlight.current=true;setBusy(true);setSendProgress("Preparing withdrawal signature…");const signedQuote=quote.quote;setQuote(null);try{const result=await webPost("/api/wallet/send",{action:"confirm",quote:signedQuote},session,AbortSignal.timeout(125000));await trackSend(result,"withdrawal");}catch(e){setError(e instanceof Error&&!/TimeoutError|AbortError/.test(e.name)?e.message:"Request timed out. Check transaction history before submitting again.");}finally{sendInFlight.current=false;setBusy(false);setSendProgress("");void refresh();}}}>{now>=quote.expiresAt?"Quote expired":tab==="withdraw"?"Confirm withdrawal":"Confirm send"}</button></div>}
    </section>;
  const balanceCard = (id:number) => {const b=data?.balances.find(item=>item.chainId===id);return <article key={id}><p className="arc-kicker">{id===5042?"ARC / USDC":"BASE / ETH"}</p><h2>{b?.balanceWei==null?"—":id===5042?usdcUnits(b.balanceWei):ethUnits(b.balanceWei)} <small>{id===5042?"USDC":"ETH"}</small>{id===8453&&<EthUsdValue wei={b?.balanceWei}/>}</h2>{id===8453&&b?.error&&b.balanceWei==null&&<p className="otc-notice" role="status">{b.error} <button className="otc-inline-button" onClick={()=>void refresh()}>Retry</button></p>}{b?.error&&b.observedAt&&<p className="otc-fine">Last read: {new Date(b.observedAt).toLocaleTimeString()}. Showing the last known balance.</p>}{b?.balanceDeficitWei&&BigInt(b.balanceDeficitWei)>0n&&<p className="otc-fine">Balance is below pending commitments. Check transaction history before submitting another request.</p>}{b?.pending&&<p className="otc-fine">Transaction pending.</p>}{id===8453&&<>{tab==="withdraw"&&asset!=="usdc"?<div className="base-withdraw-controls"><div className="otc-panel-title"><button type="button" className="otc-inline-button" disabled={busy} onClick={()=>{setTab("buy");setChain(5042);setQuote(null);}}>Close withdrawal ×</button></div>{sendControls}<PersistentNotices notices={notices} dismiss={dismiss}/></div>:<button className="arc-button" disabled={busy||b?.availableWei==null||BigInt(b.availableWei)<=0n} onClick={()=>{setTab("withdraw");setChain(8453);setAsset("native");setAmount("");setRecipient("");setQuote(null);}}>Withdraw</button>}</>}</article>;};
  return <div className="wallet-dashboard">
    {!address&&session.walletAddress&&<div className="wallet-connection-slot"><CopyWalletAddress address={session.walletAddress}/><a className="arc-button" href={`https://www.arcexplorer.org/address/${session.walletAddress}`} target="_blank" rel="noopener noreferrer">View on Arc Explorer ↗</a></div>}
    <div className="otc-wallet-balances">{balanceCard(5042)}</div>
    {session.walletAddress&&<ArcTokenBalances address={session.walletAddress} refreshKey={holdingsRefresh} onTrade={selectHoldingTrade} busy={busy}/>}
    {session.walletAddress&&<CreatorFeeClaims key={session.walletAddress} wallet={session.walletAddress} onComplete={()=>{setHoldingsRefresh(value=>value+1);void refresh();}}/>}
    <div className="otc-wallet-balances">{balanceCard(8453)}</div>
    {data?.baseUsdc?.balance!=null&&(BigInt(data.baseUsdc.balance)>0n||tab==="withdraw"&&asset==="usdc")&&<div className="otc-wallet-balances"><article><p className="arc-kicker">BASE / USDC</p><h2>{units(data.baseUsdc.balance)} <small>USDC</small></h2><p className="otc-fine">Base ETH is required for gas.</p>{tab==="withdraw"&&asset==="usdc"?<div className="base-withdraw-controls"><div className="otc-panel-title"><button type="button" className="otc-inline-button" disabled={busy} onClick={()=>{setTab("buy");setChain(5042);setAsset("native");setQuote(null);}}>Close withdrawal ×</button></div>{sendControls}<PersistentNotices notices={notices} dismiss={dismiss}/></div>:<button className="arc-button" disabled={busy||data.baseUsdc.available==null||BigInt(data.baseUsdc.available)<=0n} onClick={()=>{setTab("withdraw");setChain(8453);setAsset("usdc");setAmount("");setRecipient("");setQuote(null);}}>Withdraw USDC</button>}</article></div>}
    <div className="otc-panel-title"><h2 id="move-funds" style={{scrollMarginTop:100}} ref={tradeHeading} tabIndex={-1}>Move funds</h2></div>
    <div className="otc-tabs wallet-action-tabs" role="group" aria-label="Wallet action">{["buy","sell","swap","send"].map(action=><button key={action} disabled={busy} aria-pressed={tab===action} onClick={()=>{setTab(action as typeof tab);setChain(5042);setAsset("native");setAmount("");setRecipient("");setQuote(null);}}>{action[0].toUpperCase()+action.slice(1)}</button>)}</div>
    {tab==="buy"||tab==="sell"||tab==="swap"?<ArcTradeControls key={`${tab}:${tradeSelection.revision}`} initialToken={tradeSelection.token} side={tab} onNotice={setError} onBusyChange={setBusy} onCompleted={refreshAfterTransaction} refreshKey={holdingsRefresh}><PersistentNotices notices={notices} dismiss={dismiss}/></ArcTradeControls>:tab==="send"?sendControls:null}
    {tab==="send"&&<PersistentNotices notices={notices} dismiss={dismiss}/>}
    <details className="otc-history wallet-history-collapse" onToggle={e=>{if(e.currentTarget.open){historyOpen.current.add("listings");void loadHistory("listings");}else historyOpen.current.delete("listings");}}><summary><h2>Your OTC listings</h2></summary>{historyLoading.listings&&<p role="status">Loading…</p>}{data?.listings.length?[...data.listings].sort((a,b)=>listingDisplayOrder(a)-listingDisplayOrder(b)).map(l=><article className="otc-listing-row otc-position-card" key={l.id}><div><strong>{l.closingAfterSettlement?"Closing":l.status==="active"?`${units(l.available)} USDC available`:l.status==="funding"?"Funding escrow":l.status==="closing"?"Returning funds":l.status==="cancelled"?"Cancelled":"Closed"}</strong><p>{(l.premiumBps/100).toLocaleString()}% premium · {units(l.pendingDelivery??l.held)} USDC in pending orders · {l.status==="filled"?"Closed":l.closingAfterSettlement?"Closing":l.status}</p><p>{units(l.sold)} Arc USDC sold · Received {ethUnits(l.receivedEthWei)} Base ETH <EthUsdValue wei={l.receivedEthWei}/>{BigInt(l.receivedUsdcUnits)>0n&&<> + {units(l.receivedUsdcUnits)} Base USDC</>}</p>{l.escrow?.note&&settlementNote(l.escrow.note)!=="Pending verification"&&<p>{settlementNote(l.escrow.note)}</p>}{l.returnedUsdc!==null&&<p>{units(l.returnedUsdc)} Arc USDC returned to available funds.</p>}</div>{l.canRetry&&<button className="otc-inline-button" disabled={busy} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"retry_escrow",listingId:l.id},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Settlement retry failed.");}finally{setBusy(false);}}}>Retry settlement</button>}{["active","funding"].includes(l.status)&&<button className="otc-inline-button" disabled={busy||!l.canCancel} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"cancel",listingId:l.id},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Cancellation failed.");}finally{setBusy(false);}}}>Cancel listing</button>}</article>):<p className="otc-fine">{data?"No listings.":"Listing records unavailable."}</p>}{historyCursors.listings&&<button type="button" className="otc-inline-button" disabled={historyLoading.listings} onClick={()=>void loadHistory("listings",historyCursors.listings!)}>Load more</button>}</details>
    <details className="otc-history wallet-history-collapse" onToggle={e=>{if(e.currentTarget.open){historyOpen.current.add("orders");void loadHistory("orders");}else historyOpen.current.delete("orders");}}><summary><h2>OTC orders</h2></summary>{historyLoading.orders&&<p role="status">Loading…</p>}<div className="otc-panel-title"><button className="otc-inline-button" onClick={()=>void refresh()}>Refresh ↻</button></div>{data?.orders.length?[...data.orders].sort((a,b)=>b.createdAt-a.createdAt).map(order=><article key={order.id} className="otc-order-row"><div><strong>{order.side.toUpperCase()} · {units(order.amount)} Arc USDC</strong><span className="otc-status"><ActiveStatus text={otcOrderStatus(order)} active={otcOrderStatus(order)==="Pending"&&!order.note&&!!order.updatedAt} updatedAt={order.updatedAt}/></span></div><p>{new Date(order.createdAt).toLocaleString()} · Premium {(order.premiumBps/100).toLocaleString()}% · Payment {order.paymentAsset==="USDC"?units(order.totalWei):ethUnits(order.totalWei)} Base {order.paymentAsset??"ETH"}{order.paymentAsset!=="USDC"&&<EthUsdValue wei={order.totalWei}/>}</p>{order.note&&!(order.received&&/pending verification|waiting.*verification/i.test(settlementNote(order.note)))&&<p>{settlementNote(order.note)}</p>}{order.canRetry&&<button className="otc-inline-button" disabled={busy} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"retry_escrow",listingId:order.listingId,orderId:order.id},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Settlement retry failed.");}finally{setBusy(false);}}}>Retry settlement</button>}{order.side==="sell"&&order.status==="payout_failed"&&<button className="arc-button" disabled={busy} onClick={async()=>{setBusy(true);try{await webPost("/api/otc",{action:"retry_payout",orderId:order.id,attempt:order.payoutAttempt??0},session);await refresh();}catch(e){setError(e instanceof Error?e.message:"Payout retry failed.");}finally{setBusy(false);}}}>Retry Arc payout</button>}<div className="otc-transaction-links">{order.paymentHash&&<a href={`https://basescan.org/tx/${order.paymentHash}`} target="_blank" rel="noreferrer">Base payment ↗</a>}{order.payoutHash&&<a href={`https://www.arcexplorer.org/tx/${order.payoutHash}`} target="_blank" rel="noreferrer">Arc payout ↗</a>}</div><small>{order.id}</small></article>):<p className="otc-fine">{data?"No OTC orders.":"Order records unavailable."}</p>}{historyCursors.orders&&<button type="button" className="otc-inline-button" disabled={historyLoading.orders} onClick={()=>void loadHistory("orders",historyCursors.orders!)}>Load more</button>}</details>
    <details className="otc-history wallet-history-collapse" onToggle={e=>{if(e.currentTarget.open){historyOpen.current.add("transactions");void loadHistory("transactions");}else historyOpen.current.delete("transactions");}}><summary><h2>Transactions</h2></summary>{historyLoading.transactions&&<p role="status">Loading…</p>}<p className="otc-fine">Bot requests and reconciled replacements. View the wallet on Arc Explorer for other activity.</p>{data?.transactions.length?[...data.transactions].sort((a,b)=>b.createdAt-a.createdAt).map(tx=><article key={tx.id} className="otc-listing-row wallet-transaction-row"><div><strong>{tx.chainId===8453&&tx.escrowStep==="seller"?"Base Payout Received":<>{tx.chainId===5042?"Arc":"Base"} · {tx.title}</>}</strong><p>{tx.status.replaceAll("_"," ")} · {new Date(tx.createdAt).toLocaleString()}</p><dl className="wallet-transaction-details">{tx.details.map(detail=><div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}{tx.chainId===8453&&/^\d+(?:\.\d+)? ETH$/.test(detail.value)&&<EthUsdValue eth={detail.value.slice(0,-4)}/>}</dd></div>)}{tx.blockNumber&&<div><dt>Block</dt><dd>{tx.blockNumber}</dd></div>}</dl>{tx.note&&<p>{settlementNote(tx.note)}</p>}</div>{tx.hash&&<a className="arc-text-link" href={`${tx.chainId===5042?"https://www.arcexplorer.org":"https://basescan.org"}/tx/${tx.hash}`} target="_blank" rel="noreferrer" title={tx.hash}>View transaction ↗</a>}</article>):<p className="otc-fine">{data?"No transactions.":"Transaction records unavailable."}</p>}{historyCursors.transactions&&<button type="button" className="otc-inline-button" disabled={historyLoading.transactions} onClick={()=>void loadHistory("transactions",historyCursors.transactions!)}>Load more</button>}</details>
  </div>;
}
