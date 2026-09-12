"use client";
import { ActiveStatus } from "./ActiveStatus";
import { EthUsdValue } from "./EthUsdValue";
import { PersistentNotices, usePersistentNotices } from "./PersistentNotices";
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { useWalletSession } from "./WalletSessionProvider";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { WalletSignInButton } from "./WalletSignInButton";
import { listingCostPercent } from "@/lib/otc/listing-cost";
import { listingSubmission, type ListingSubmission } from "@/lib/otc/listing-submission";
import { formatUnits } from "viem";
import {displayUsdc,displayEth} from "@/lib/amount-display";
import { usdc as validateAmount, premium as validatePremium, usdcPrice, SERVICE_FEE_BPS } from "@/lib/otc/model";

export type OtcSession={authenticated:boolean;walletAddress?:string;csrfToken?:string;reauthAt?:number};
type Listing={id:string;seller:string;available:string;premiumBps:number};
type Market={available:boolean;enabled:boolean;listings:Listing[];stats:{soldUsdc?:string;count:number;available:string;lowestBps:number|null;averageBps:number|null}};
type Quote={received?:boolean;payoutHash?:string;escrowVersion?:1|2;serviceFeeBps?:number;escrowAddress?:string;escrowGasBudgetWei?:string;paymentAsset?:"ETH"|"USDC";approvalGasWei?:string;id:string;amount:string;premiumBps:number;sellerWei:string;feeWei:string;totalWei:string;baseGasWei:string;expiresAt:number;status:string};
const quoteGas=(q:Quote)=>BigInt(q.baseGasWei)*(q.escrowAddress&&q.escrowVersion!==2?2n:1n)+BigInt(q.escrowGasBudgetWei??q.approvalGasWei??"0");
export function units(value:string,decimals=6){const exact=formatUnits(BigInt(value),decimals);return decimals===6?displayUsdc(exact):exact;}
export function usdcUnits(value:string,decimals=18){return displayUsdc(formatUnits(BigInt(value),decimals));}
export function ethUnits(value:string){return displayEth(formatUnits(BigInt(value),18));}
const pct=(bps:number|null)=>bps===null?"—":`${(bps/100).toLocaleString("en-US",{maximumFractionDigits:2})}%`;
export const useOtcSession = useWalletSession;
export async function webPost(path:string,body:unknown,session:OtcSession|null,signal?:AbortSignal){
  const action = body && typeof body === "object" && "action" in body ? body.action : undefined;
  const statusRead = path === "/api/otc" && (action === "purchase_status" || action === "listing_status");
  if (!statusRead && session?.reauthAt && Date.now() >= session.reauthAt * 1000) throw new Error("Sign in again before making another transaction.");
  const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json","x-argus-csrf":session?.csrfToken??""},body:JSON.stringify(body),signal});
  const result=await response.json();if(!response.ok)throw new Error(result.error??"Request failed.");return result;
}
function listingNotice(message:string){
  const phrase=message.includes("Follow it on your wallet page.")?"Follow it on your wallet page.":"view your OTC listings in your wallet",index=message.indexOf(phrase);
  return index<0?message:<>{message.slice(0,index)}<Link href="/wallet">{phrase}</Link>{message.slice(index+phrase.length)}</>;
}
export function OtcClient(){
  const session=useOtcSession();
  const {notices,notify:setNotice,dismiss}=usePersistentNotices();
  const [market,setMarket]=useState<Market|null>(null),[tab,setTab]=useState<"buy"|"sell">("buy");
  const [selected,setSelected]=useState(""),[amount,setAmount]=useState("10"),[premium,setPremium]=useState("0");
  const [quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
  const [purchaseActivityAt,setPurchaseActivityAt]=useState(0);
  const [purchaseProgress,setPurchaseProgress]=useState<{message:string;active:boolean;updatedAt:number}|null>(null);
  const purchaseDone=useRef(false);
  const [cancelEligibility,setCancelEligibility]=useState<{id:string;checkedAt:number}|null>(null);
  const [purchaseSuccessDismissed,setPurchaseSuccessDismissed]=useState(false);
  const [processingPurchase,setProcessingPurchase]=useState<{id:string;amount:string;wallet:string}|null>(null);
  const [premiumAccepted,setPremiumAccepted]=useState<{quoteId:string;premiumBps:number}|null>(null);
  const [paymentAsset]=useState<"ETH"|"USDC">("ETH");
  const [pendingListing,setPendingListing]=useState<ListingSubmission|null>(null);
  const [fundingListing,setFundingListing]=useState<{id:string;wallet:string}|null>(null);
  const storageKey=session?.walletAddress?`arc-listing-pending:${session.walletAddress.toLowerCase()}`:null;
  useEffect(()=>{if(!storageKey)return;try{const saved=sessionStorage.getItem(storageKey);const parsed=saved?JSON.parse(saved):null;setPendingListing(parsed?listingSubmission(parsed.requestId,parsed.amount,parsed.premium,parsed.maxGasReserveWei):null);}catch{setNotice("Pending listing could not be read. Check wallet listings before submitting.");}},[storageKey,setNotice]);
  const [listingPreview,setListingPreview]=useState<{gasReserveWei:string;requiredWei:string;listingAmount:string}|null>(null);
  const inFlight=useRef(false);
  const previewRequest=useRef<AbortController|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const [formOpen,setFormOpen]=useState(false);
  const [listingBalance,setListingBalance]=useState<{walletAddress:string;availableWei:string}|null>(null);
  const [balanceFailed,setBalanceFailed]=useState(false),[balanceRevision,setBalanceRevision]=useState(0);
  useEffect(()=>{
    setListingBalance(null);setBalanceFailed(false);
    if(!formOpen||!session?.authenticated||!session.walletAddress)return;
    const wallet=session.walletAddress,controller=new AbortController();let pending=false;
    const load=async()=>{
      if(pending)return;pending=true;
      try{
        const response=await fetch(`/api/wallet/balance?chain=${tab==="buy"?8453:5042}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
        const next=await response.json();
        if(!response.ok||next.walletAddress?.toLowerCase()!==wallet.toLowerCase()||typeof next.availableWei!=="string"||!/^\d+$/.test(next.availableWei))throw Error("Balance unavailable");
        if(!controller.signal.aborted){setListingBalance(next);setBalanceFailed(false);}
      }catch{if(!controller.signal.aborted){setListingBalance(null);setBalanceFailed(true);}}
      finally{pending=false;}
    };
    void load();const timer=setInterval(()=>void load(),15000);
    return()=>{controller.abort();clearInterval(timer);};
  },[formOpen,tab,session?.authenticated,session?.walletAddress,balanceRevision]);
  useEffect(()=>{if(formOpen)dialog.current?.showModal();else dialog.current?.close();},[formOpen]);
  const openForm=(direction:"buy"|"sell",id="")=>{setPurchaseSuccessDismissed(false);setPremiumAccepted(null);setTab(direction);setSelected(id);setAmount(direction==="sell"&&pendingListing?pendingListing.amount:"10");setPremium(direction==="sell"&&pendingListing?pendingListing.premium:"0");setQuote(null);setListingPreview(null);setFormOpen(true);};
  const marketRequest=useRef<AbortController|null>(null);
  const liveVersion=useRef(0);
  const [marketError,setMarketError]=useState(false);
  const refresh=useCallback(async()=>{
    if(marketRequest.current)return;
    const controller=new AbortController();marketRequest.current=controller;const version=liveVersion.current;
    try{const r=await fetch("/api/otc",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(!r.ok)throw new Error();const next=await r.json();if(!next.available)throw new Error();if(!controller.signal.aborted){setMarket(previous=>version===liveVersion.current?next:previous?{...previous,enabled:next.enabled}:next);setMarketError(false);}}
    catch{if(!controller.signal.aborted){setMarketError(true);setNotice("Market refresh failed. Check listing availability before trading.");}}
    finally{if(marketRequest.current===controller)marketRequest.current=null;}
  },[setNotice]);
  useEffect(()=>{
    const url=process.env.NEXT_PUBLIC_CONVEX_URL;if(!url)return;
    const client=new ConvexClient(url);
    const unsubscribe=client.onUpdate(makeFunctionReference<"query",Record<string,never>,Pick<Market,"listings"|"stats">>("otc:market"),{},next=>{
      liveVersion.current++;
      setMarket(previous=>({...next,available:true,enabled:previous?.enabled??false}));setMarketError(false);
    },()=>{void refresh();});
    return()=>{unsubscribe();void client.close();};
  },[refresh]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),10_000);return()=>{clearInterval(timer);marketRequest.current?.abort();marketRequest.current=null;};},[refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    if(!processingPurchase||!session?.authenticated||session.walletAddress!==processingPurchase.wallet)return;
    const controller=new AbortController();let pending=false;
    const check=async()=>{
      if(pending)return;pending=true;
      try{
        const order=await webPost("/api/otc",{action:"purchase_status",orderId:processingPurchase.id},session,AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]));
        if(controller.signal.aborted)return;
        setCancelEligibility(order?.canCancelUnpaid===true?{id:processingPurchase.id,checkedAt:Date.now()}:null);
        setPurchaseActivityAt(order?.progress?.active?order.progress.updatedAt??0:0);
        if(order?.progress){setPurchaseProgress(order.progress);setNotice(order.progress.message);}
        if(order?.received||order?.status==="completed"){
          purchaseDone.current=true;
          setProcessingPurchase(null);setQuote(current=>current?.id===processingPurchase.id?{...current,received:true,payoutHash:order.payoutHash}:current);setBalanceRevision(value=>value+1);
          setNotice(`Purchase confirmed. Received ${units(processingPurchase.amount)} Arc USDC. Follow it on your wallet page.`);
          void refresh();
        }else if(order&&["payment_failed","refunded","cancelled","expired"].includes(order.status)){
          setProcessingPurchase(null);setQuote(null);
          setNotice(order.note??"Purchase was not paid. Request a new quote.");
        }
      }catch{if(!controller.signal.aborted){setCancelEligibility(null);setPurchaseActivityAt(0);setPurchaseProgress(null);setNotice("Status update unavailable. Checking again. Do not submit another purchase.");}}
      finally{pending=false;}
    };
    void check();const timer=setInterval(()=>void check(),5000);
    return()=>{controller.abort();clearInterval(timer);};
  },[processingPurchase,session,refresh,setNotice]);

  useEffect(()=>{
    if(!fundingListing||!session?.authenticated||session.walletAddress!==fundingListing.wallet)return;
    const controller=new AbortController();let pending=false;
    const check=async()=>{
      if(pending)return;pending=true;
      try{
        const listing=await webPost("/api/otc",{action:"listing_status",listingId:fundingListing.id},session,AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]));
        if(controller.signal.aborted)return;
        if(listing?.status==="active"){
          setFundingListing(null);setBalanceRevision(value=>value+1);
          setNotice("Escrow verified. USDC listing live.");void refresh();
        }else if(listing&&["closing","cancelled","filled"].includes(listing.status))setFundingListing(null);
      }catch{/* Keep the funding message until status is verified. */}
      finally{pending=false;}
    };
    void check();const timer=setInterval(()=>void check(),5000);
    return()=>{controller.abort();clearInterval(timer);};
  },[fundingListing,session,setNotice,refresh]);
  const run=async(body:unknown)=>{
    if(inFlight.current)return;previewRequest.current?.abort();inFlight.current=true;setBusy(true);
    try{const result=await webPost("/api/otc",body,session,AbortSignal.timeout(125000));await refresh();return result;}
    catch(error){setNotice(error instanceof Error?error.message:"Request failed.");}
    finally{inFlight.current=false;setBusy(false);}
  };
  let inputError="",salePrice:string|null=null;
  try{validateAmount(amount);if(tab==="sell"){const bps=validatePremium(premium);if(listingPreview)salePrice=usdcPrice(validateAmount(listingPreview.listingAmount),bps,SERVICE_FEE_BPS).sellerWei;}}catch(e){inputError=e instanceof Error?e.message:"Check the amount.";}
  const availableWei=listingBalance?.walletAddress.toLowerCase()===session?.walletAddress?.toLowerCase()?listingBalance?.availableWei:null;
  let balanceError="";
  if(tab==="sell"&&!pendingListing&&session?.authenticated){
    if(availableWei==null)balanceError=balanceFailed?"Available balance could not load. Try again.":"Checking available Arc USDC…";
    else if(!inputError&&validateAmount(amount)*10n**12n>BigInt(availableWei))balanceError=`Not enough Arc USDC. You have ${usdcUnits(availableWei)} USDC available.`;
  }
  const selectedListing=market?.listings.find(l=>l.id===selected);
  let purchaseError="";
  if(tab==="buy"&&!processingPurchase&&!quote&&!busy&&!inputError&&selectedListing&&validateAmount(amount)>BigInt(selectedListing.available))purchaseError=`This listing has ${units(selectedListing.available)} USDC available. Enter a smaller amount.`;
  useEffect(()=>{
    if(!processingPurchase&&(!formOpen||tab!=="buy"||inputError||purchaseError||!selectedListing))return;
    for(const notice of notices){
      if(/^This listing (?:has [\d,.]+ USDC available|no longer has that much USDC available)\. Enter a smaller amount\.$/.test(notice))dismiss(notice);
    }
  },[formOpen,tab,inputError,purchaseError,selectedListing,notices,dismiss,processingPurchase]);
  useEffect(()=>{
    if(!formOpen||tab!=="buy"||!session?.authenticated||inputError||busy||processingPurchase||quote)return;
    if(purchaseError){setNotice(purchaseError);return;}
    const controller=new AbortController();previewRequest.current=controller;
    const timer=setTimeout(()=>{void webPost("/api/otc",{action:"quote_preview",listingId:selected,amount},session,controller.signal).catch(error=>{if(!controller.signal.aborted&&!inFlight.current)setNotice(error instanceof Error?error.message:"Purchase estimate unavailable.");});},500);
    return()=>{clearTimeout(timer);controller.abort();if(previewRequest.current===controller)previewRequest.current=null;};
  },[formOpen,tab,session,selected,amount,inputError,purchaseError,setNotice,busy,processingPurchase,quote]);
  const renderNotice=(message:string)=>purchaseProgress?.message===message?<ActiveStatus text={message} active={!!processingPurchase&&purchaseProgress.active&&now-purchaseActivityAt<90_000} updatedAt={purchaseActivityAt}/>:message==="Purchase processing. Follow it on your wallet page."?<><ActiveStatus text="Purchase processing." active={!!processingPurchase&&now-purchaseActivityAt<90_000} updatedAt={purchaseActivityAt}/> <Link href="/wallet">Follow it on your wallet page.</Link></>:listingNotice(message);
  const purchaseReceived=!!quote&&(quote.received===true||quote.status==="completed");
  const ready=Boolean(session?.authenticated&&!inputError&&!balanceError);
  return <div className="otc-workspace">
    {!formOpen&&<PersistentNotices notices={notices} dismiss={dismiss} renderMessage={renderNotice}/>}
    {<div className="otc-metrics"><article><span>Available Arc USDC</span><strong>{market?.available?units(market.stats.available):"—"}</strong></article><article><span>Lowest premium</span><strong>{pct(market?.stats.lowestBps??null)}</strong></article><article><span>Average premium <small>weighted by available USDC</small></span><strong>{pct(market?.stats.averageBps??null)}</strong></article><article><span>USDC sold</span><strong>{market?.available&&market.stats.soldUsdc!=null?units(market.stats.soldUsdc):"—"}</strong></article></div>}
    <p className="market-refresh-status" role="status">{marketError?"Market refresh failed. Displayed listings may be outdated. Retrying…":""}</p>
    <div className="otc-single">
      {<section className="otc-book"><div className="otc-panel-title"><h2>Listings</h2><button className="arc-button" onClick={()=>openForm("sell")}>Sell USDC</button></div>
        <div className="otc-market-cards">{market?.listings.map(l=>{
          const cost=listingCostPercent(l.premiumBps),percent=(value:number)=>`${value.toLocaleString(undefined,{maximumFractionDigits:6})}%`;
          const own=l.seller.toLowerCase()===session?.walletAddress?.toLowerCase();
          return <article className="otc-market-card" key={l.id}>
            <div className="otc-market-amount"><span>Available Arc USDC</span><h3>{units(l.available)} <small>USDC</small></h3></div>
            <p className="otc-market-seller">Seller <Link href={`/wallet/${l.seller}`} title={l.seller}>{l.seller.slice(0,6)}…{l.seller.slice(-4)}</Link></p>
            <dl><div><dt>Premium</dt><dd>{pct(l.premiumBps)}</dd></div><div><dt>Service fee</dt><dd>{SERVICE_FEE_BPS/100}%</dd></div><div className="otc-market-total"><dt>Premium + fee</dt><dd>+{percent(cost.aboveFaceValue)}</dd></div><div><dt>Total cost</dt><dd>{(cost.total/100).toFixed(3)}x face value</dd></div></dl>
            
            <button className="arc-button" disabled={marketError||busy||!!processingPurchase} onClick={()=>openForm("buy",l.id)}>{own?"Your listing":"Buy USDC ↗"}</button>
            {own&&<button type="button" className="otc-inline-button" disabled={marketError||busy||!!processingPurchase} onClick={async()=>{
              const result=await run({action:"cancel",listingId:l.id});
              if(result){setBalanceRevision(value=>value+1);setNotice(result.status==="closing"?"Listing is closing. Follow it on your wallet page.":result.status==="cancelled"?"Listing cancelled. Follow it on your wallet page.":"Check this listing on your wallet page.");}
            }}>Cancel Listing</button>}
          </article>;
        })}</div>
        {!market?.listings.length&&<div className="otc-empty"><strong>{!market?(marketError?"Listings unavailable.":"Loading listings…"):market.available?"No listings.":"Listings unavailable."}</strong><p>{!market&&!marketError?"Checking available listings.":market?.available?"Fund your wallet with Arc USDC to list it for sale.":"Unable to load listings. Try again."}</p></div>}
        <p className="otc-fine">Minimum purchase $10. You can buy part of a listing.</p>
      </section>}
      <dialog ref={dialog} className="otc-modal" aria-labelledby="otc-form-title" onCancel={e=>{if(busy)e.preventDefault();}} onClose={()=>setFormOpen(false)}>
      {formOpen&&<section className="otc-form-panel" id="otc-order-form">
        <div className="otc-panel-title"><span>{tab==="sell"?"New listing":"Buy from listing"}</span><button className="otc-inline-button" type="button" disabled={busy} onClick={()=>setFormOpen(false)} aria-label="Close form">Close ×</button></div>
        <h2 id="otc-form-title">{tab==="buy"?`Base ${paymentAsset} → Arc USDC`:"List your Arc USDC"}</h2>{tab==="buy"&&<p className="otc-fine">Arc USDC is held in dedicated escrow and pays out on Base ETH payment confirmation.</p>}{tab==="buy"&&<p className="otc-listing-available">Available Base ETH <strong>{availableWei!=null?<>{ethUnits(availableWei)} ETH <EthUsdValue wei={availableWei}/></>:balanceFailed?"Balance unavailable":"—"}</strong></p>}
        {tab==="sell"&&<p className="otc-fine">Your Arc USDC will be locked in a secure escrow wallet.<br/>Base ETH pays out at each buy. Cancel to return remaining USDC at any time.</p>}
        {tab==="sell"&&<p className="otc-listing-available">Available Arc USDC <strong>{availableWei!=null?usdcUnits(availableWei):"—"}</strong></p>}
        {!quote&&<PersistentNotices notices={notices} dismiss={dismiss} renderMessage={renderNotice}/>}
        {!session?.authenticated&&<p className="otc-notice"><WalletSignInButton className="arc-text-link" destination="/otc">Connect your account</WalletSignInButton> to create a listing or trade.</p>}
        {tab==="sell"&&pendingListing&&<p className="otc-notice">Creating OTC USDC listing</p>}
        {(tab==="sell"||!quote)&&<form onSubmit={async e=>{e.preventDefault();if(inFlight.current||processingPurchase||(!ready&&!pendingListing))return;if(tab==="buy"){if(purchaseError){setNotice(purchaseError);return;}const result=await run({action:"quote",listingId:selected,amount,paymentAsset});if(result)setQuote(result);}else{if(!pendingListing&&!listingPreview){const preview=await run({action:"list_preview",amount,premium});if(preview)setListingPreview(preview);return;}const submission=pendingListing??listingSubmission(crypto.randomUUID(),amount,premium,listingPreview!.gasReserveWei);try{if(!storageKey)throw new Error();sessionStorage.setItem(storageKey,JSON.stringify(submission));}catch{setNotice("Could not save the request for safe retry. No listing was submitted.");return;}setPendingListing(submission);const result=await run(submission);if(result){sessionStorage.removeItem(storageKey!);setPendingListing(null);setFundingListing({id:result.id,wallet:session!.walletAddress!});setBalanceRevision(value=>value+1);setNotice("Position created. Its escrow deposit is being verified. You can view your OTC listings in your wallet.");setListingPreview(null);}}}}>
          {tab==="buy"&&<p className="otc-fine">Selected listing: {market?.listings.find(l=>l.id===selected)?`${units(market.listings.find(l=>l.id===selected)!.available)} USDC available · ${pct(market.listings.find(l=>l.id===selected)!.premiumBps)} premium`:"Listing unavailable"}</p>}
          <>{tab==="buy"&&<p className="otc-fine">Pay with Base ETH.</p>}</>
          <label>{tab==="buy"?"Arc USDC to receive":"Total Arc USDC listing"}<div className="otc-input-unit"><input required inputMode="decimal" disabled={busy||!!processingPurchase||(tab==="sell"&&!!pendingListing)} value={amount} onChange={e=>{setAmount(e.target.value);setQuote(null);setListingPreview(null);}} pattern="[0-9]+(\.[0-9]{1,6})?"/><span>USDC</span></div>{tab==="sell"&&<button type="button" className="otc-inline-button otc-listing-max" disabled={busy||!!pendingListing||availableWei==null} onClick={()=>{if(availableWei==null)return;setAmount(formatUnits(BigInt(availableWei)/10n**12n,6));setListingPreview(null);}}>Max</button>}{tab==="buy"&&<><button type="button" className="otc-inline-button otc-buy-full" aria-label="Use the maximum available from the selected listing" disabled={busy||!!processingPurchase||!selectedListing||marketError} onClick={()=>{if(!selectedListing)return;setAmount(formatUnits(BigInt(selectedListing.available),6));setQuote(null);setPremiumAccepted(null);setListingPreview(null);}}>Max</button><small>Minimum 10 USDC. Base gas is additional.</small></>}</label>
          
          {tab==="sell"&&balanceError&&<p className="otc-fine" role="status">{<ActiveStatus text={balanceError} active={!balanceFailed&&availableWei==null}/>} {balanceFailed&&<button type="button" className="otc-inline-button" onClick={()=>setBalanceRevision(value=>value+1)}>Retry</button>}</p>}
          {tab==="sell"&&<><label>Your premium<div className="otc-input-unit"><input required inputMode="decimal" disabled={busy||!!pendingListing} value={premium} onChange={e=>{setPremium(e.target.value);setListingPreview(null);}} pattern="[0-9]+(\.[0-9]{1,2})?"/><span>%</span></div><small>Set the percent premium for your USDC. The buyer will pay an additional 1.5% service fee on top of this premium.</small></label><div className="otc-comparison"><span>Current lowest <b>{pct(market?.stats.lowestBps??null)}</b></span><span>Weighted average <b>{pct(market?.stats.averageBps??null)}</b></span></div><p className="otc-fine">Your USDC is held in an escrow wallet and listed after funding is verified. Any unsold funds return when you close the position.</p></>}
          {tab==="sell"&&listingPreview&&<div className="otc-comparison"><span>Listed for sale <b>{displayUsdc(listingPreview.listingAmount)} USDC</b></span>{salePrice!==null&&<span>Sale price at premium <b>${units(salePrice)} USD</b></span>}<span>Gas <b>{units(listingPreview.gasReserveWei,18)} USDC</b></span><span>Total to reserve <b>{usdcUnits(listingPreview.requiredWei)} USDC</b></span></div>}
          {inputError&&<p className="otc-fine" role="status">{inputError}</p>}
          <button className="arc-button" disabled={busy||!!processingPurchase||!(ready||(tab==="sell"&&pendingListing&&session?.authenticated))} type="submit">{processingPurchase?<ActiveStatus text="Processing" active={now-purchaseActivityAt<90_000}/>:busy?<ActiveStatus text={tab==="buy"?"Preparing quote":"Preparing listing"} active={busy}/>:tab==="buy"?"Get exact quote":pendingListing?"Retry original listing":listingPreview?"Confirm listing":"Review Listing"}</button>
        </form>}
        {quote&&<div className="otc-quote"><div className="otc-panel-title"><h3>Your quote</h3>{!busy&&!processingPurchase&&!purchaseReceived&&<button type="button" className="otc-inline-button" onClick={()=>{setQuote(null);setPremiumAccepted(null);}}>Back</button>}{purchaseReceived?<span>Received</span>:!processingPurchase&&<span>{Math.max(0,Math.ceil((quote.expiresAt-now)/1000))}s left</span>}</div><PersistentNotices notices={purchaseReceived?(purchaseSuccessDismissed?[]:[`Purchase confirmed. Received ${units(quote.amount)} Arc USDC. Follow it on your wallet page.`]):notices} dismiss={message=>{if(purchaseReceived)setPurchaseSuccessDismissed(true);dismiss(message);}} renderMessage={renderNotice}/><dl><dt>{purchaseReceived?"You received":"You receive"}</dt><dd>{units(quote.amount)} Arc USDC</dd><dt>Premium</dt><dd>{pct(quote.premiumBps)}</dd><dt>Fee</dt><dd>{(quote.serviceFeeBps??SERVICE_FEE_BPS)/100}%</dd><dt>{purchaseReceived?"Quoted total cost":"Total cost"}</dt><dd>{ethUnits((BigInt(quote.totalWei)+quoteGas(quote)).toString())} ETH <EthUsdValue wei={(BigInt(quote.totalWei)+quoteGas(quote)).toString()}/></dd></dl>{purchaseReceived&&quote.payoutHash&&<a className="arc-text-link" href={`https://www.arcexplorer.org/tx/${quote.payoutHash}`} target="_blank" rel="noreferrer">Arc payout</a>}{!purchaseReceived&&<><p className="otc-fine">Your Base ETH payment goes to an escrow wallet. Once confirmed, you receive the exact Arc USDC quoted.</p><label className="otc-premium-ack"><input type="checkbox" checked={premiumAccepted?.quoteId===quote.id&&premiumAccepted.premiumBps===quote.premiumBps} disabled={busy||now>=quote.expiresAt} onChange={e=>setPremiumAccepted(e.target.checked?{quoteId:quote.id,premiumBps:quote.premiumBps}:null)}/><span>I understand I’m paying a {pct(quote.premiumBps)} premium.</span></label><button className="arc-button" aria-busy={busy||!!processingPurchase} disabled={busy||!!processingPurchase||now>=quote.expiresAt||quote.status!=="quoted"||premiumAccepted?.quoteId!==quote.id||premiumAccepted.premiumBps!==quote.premiumBps} onClick={async()=>{if(inFlight.current||processingPurchase||!session?.walletAddress||premiumAccepted?.quoteId!==quote.id||premiumAccepted.premiumBps!==quote.premiumBps)return;for(const notice of notices){if(/^This listing (has|no longer has)/.test(notice))dismiss(notice);}purchaseDone.current=false;setCancelEligibility(null);setPurchaseProgress(null);setNotice("Preparing Base ETH payment");setPurchaseActivityAt(Date.now());setProcessingPurchase({id:quote.id,amount:quote.amount,wallet:session.walletAddress});const result=await run({action:"accept",orderId:quote.id});if(purchaseDone.current)return;if(!result){setNotice("Confirming purchase status. Follow it on your wallet page.");return;}if(result.status==="completed"){setProcessingPurchase(null);setQuote({...result,received:true});setBalanceRevision(value=>value+1);setNotice(`Purchase confirmed. Received ${units(result.amount)} Arc USDC. Follow it on your wallet page.`);}else if(result.status==="quoted"||result.status==="expired"){setProcessingPurchase(null);setNotice("Purchase was not submitted. Request a new quote.");}else{setQuote(result);setNotice("Purchase processing. Follow it on your wallet page.");}}}>{busy||processingPurchase?<ActiveStatus text="Processing" active={busy||now-purchaseActivityAt<90_000}/>:"Confirm purchase"}</button>{processingPurchase&&!busy&&session?.walletAddress===processingPurchase.wallet&&cancelEligibility?.id===processingPurchase.id&&now-cancelEligibility.checkedAt<10_000&&<button type="button" className="otc-inline-button" onClick={async()=>{if(inFlight.current||Date.now()-cancelEligibility.checkedAt>=10_000)return;setCancelEligibility(null);const result=await run({action:"cancel_purchase",orderId:processingPurchase.id});if(result?.status==="payment_failed"){setProcessingPurchase(null);setQuote(null);setNotice("Purchase cancelled before payment. No funds sent.");}}}>Cancel unpaid purchase</button>}</>}</div>}
        
      </section>}
      </dialog>
    </div>
  </div>;
}
