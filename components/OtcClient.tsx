"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { listingSubmission, type ListingSubmission } from "@/lib/otc/listing-submission";
import { formatUnits } from "viem";
import { usdc as validateAmount, premium as validatePremium } from "@/lib/otc/model";

export type OtcSession={authenticated:boolean;walletAddress?:string;csrfToken?:string};
type Listing={id:string;seller:string;available:string;premiumBps:number};
type Market={available:boolean;enabled:boolean;listings:Listing[];stats:{count:number;available:string;lowestBps:number|null;averageBps:number|null}};
type Quote={paymentAsset?:"ETH"|"USDC";approvalGasWei?:string;id:string;amount:string;premiumBps:number;sellerWei:string;feeWei:string;totalWei:string;baseGasWei:string;expiresAt:number;status:string};
export function units(value:string,decimals=6){return formatUnits(BigInt(value),decimals);}
const pct=(bps:number|null)=>bps===null?"—":`${(bps/100).toLocaleString("en-US",{maximumFractionDigits:2})}%`;
export function useOtcSession(){
  const [session,setSession]=useState<OtcSession|null>(null);
  useEffect(()=>{let active=true;fetch("/api/auth/x/session",{cache:"no-store"}).then(r=>r.json()).then(s=>{if(active)setSession(s);}).catch(()=>{if(active)setSession({authenticated:false});});return()=>{active=false;};},[]);
  return session;
}
export async function webPost(path:string,body:unknown,session:OtcSession|null){
  const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json","x-argus-csrf":session?.csrfToken??""},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error??"Request failed.");return result;
}
export function OtcClient(){
  const session=useOtcSession();
  const [market,setMarket]=useState<Market|null>(null),[tab,setTab]=useState<"buy"|"sell">("buy");
  const [selected,setSelected]=useState(""),[amount,setAmount]=useState("10"),[premium,setPremium]=useState("0");
  const [quote,setQuote]=useState<Quote|null>(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
  const [paymentAsset,setPaymentAsset]=useState<"ETH"|"USDC">("ETH");
  const [pendingListing,setPendingListing]=useState<ListingSubmission|null>(null);
  const storageKey=session?.walletAddress?`arc-listing-pending:${session.walletAddress.toLowerCase()}`:null;
  useEffect(()=>{if(!storageKey)return;try{const saved=sessionStorage.getItem(storageKey);const parsed=saved?JSON.parse(saved):null;setPendingListing(parsed?listingSubmission(parsed.requestId,parsed.amount,parsed.premium,parsed.maxGasReserveWei):null);}catch{setNotice("Pending listing could not be read. Check wallet listings before submitting.");}},[storageKey]);
  const [listingPreview,setListingPreview]=useState<{gasReserveWei:string;requiredWei:string}|null>(null);
  const inFlight=useRef(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const [formOpen,setFormOpen]=useState(false);
  useEffect(()=>{if(formOpen)dialog.current?.showModal();else dialog.current?.close();},[formOpen]);
  const openForm=(direction:"buy"|"sell",id="")=>{setTab(direction);setSelected(id);setAmount(direction==="sell"&&pendingListing?pendingListing.amount:"10");setPremium(direction==="sell"&&pendingListing?pendingListing.premium:"0");setQuote(null);setListingPreview(null);setNotice("");setFormOpen(true);};
  const refresh=useCallback(async()=>{try{const r=await fetch("/api/otc",{cache:"no-store"});if(!r.ok)throw new Error();setMarket(await r.json());}catch{setMarket({available:false,enabled:false,listings:[],stats:{count:0,available:"0",lowestBps:null,averageBps:null}});}},[]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),10_000);return()=>clearInterval(timer);},[refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);

  const run=async(body:unknown)=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setNotice("");
    try{const result=await webPost("/api/otc",body,session);await refresh();return result;}
    catch(error){setNotice(error instanceof Error?error.message:"Request failed.");}
    finally{inFlight.current=false;setBusy(false);}
  };
  let inputError="";
  try{validateAmount(amount);if(tab==="sell")validatePremium(premium);}catch(e){inputError=e instanceof Error?e.message:"Check the amount.";}
  const ready=Boolean(session?.authenticated&&!inputError);
  return <div className="otc-workspace">
    {<div className="otc-metrics"><article><span>Available Arc USDC</span><strong>{market?.available?units(market.stats.available):"—"}</strong></article><article><span>Lowest premium</span><strong>{pct(market?.stats.lowestBps??null)}</strong></article><article><span>Average premium <small>weighted by available USDC</small></span><strong>{pct(market?.stats.averageBps??null)}</strong></article></div>}
    {market&&!market.available&&<p className="otc-notice">Market unavailable. Try again.</p>}
    <div className="otc-single">
      {<section className="otc-book"><div className="otc-panel-title"><h2>Listings</h2><button className="arc-button" onClick={()=>openForm("sell")}>Sell USDC</button></div>
        <div className="otc-table-wrap"><table><thead><tr><th>Seller</th><th>Arc USDC</th><th>Premium</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{market?.listings.map(l=><tr key={l.id}><td><Link href={`/wallet/${l.seller}`}>{l.seller.slice(0,6)}…{l.seller.slice(-4)}</Link></td><td>{units(l.available)}</td><td>{pct(l.premiumBps)}</td><td><button className="otc-inline-button" disabled={l.seller.toLowerCase()===session?.walletAddress?.toLowerCase()} onClick={()=>openForm("buy",l.id)}>Buy ↗</button></td></tr>)}</tbody></table></div>
        {!market?.listings.length&&<div className="otc-empty"><strong>{!market?"Loading listings…":market.available?"No listings.":"Listings unavailable."}</strong><p>{market?.available?"Fund your wallet with Arc USDC to list it for sale.":"Unable to load listings. Try again."}</p></div>}
        <p className="otc-fine">Each fill delivers at least 10 Arc USDC. You can buy part of a listing.</p>
      </section>}
      <dialog ref={dialog} className="otc-modal" aria-labelledby="otc-form-title" onCancel={e=>{if(busy)e.preventDefault();}} onClose={()=>setFormOpen(false)}>
      {formOpen&&<section className="otc-form-panel" id="otc-order-form">
        <div className="otc-panel-title"><span>{tab==="sell"?"New listing":"Buy from listing"}</span><button className="otc-inline-button" type="button" disabled={busy} onClick={()=>setFormOpen(false)} aria-label="Close form">Close ×</button></div>
        <h2 id="otc-form-title">{tab==="buy"?`Base ${paymentAsset} → Arc USDC`:"List your Arc USDC"}</h2>
        {!session?.authenticated&&<p className="otc-notice"><a href="/api/auth/x/start?returnTo=/otc">Connect your account ↗</a> to create a listing or trade. Base actions are website only.</p>}
        {tab==="sell"&&pendingListing&&<p className="otc-notice">A listing request is awaiting confirmation. Retry uses its original amount, premium, and gas limit.</p>}
        <form onSubmit={async e=>{e.preventDefault();if(inFlight.current)return;if(tab==="buy"){const result=await run({action:"quote",listingId:selected,amount,paymentAsset});if(result)setQuote(result);}else{if(!pendingListing&&!listingPreview){const preview=await run({action:"list_preview",amount,premium});if(preview)setListingPreview(preview);return;}const submission=pendingListing??listingSubmission(crypto.randomUUID(),amount,premium,listingPreview!.gasReserveWei);try{if(!storageKey)throw new Error();sessionStorage.setItem(storageKey,JSON.stringify(submission));}catch{setNotice("Could not save the request for safe retry. No listing was submitted.");return;}setPendingListing(submission);const result=await run(submission);if(result){sessionStorage.removeItem(storageKey!);setPendingListing(null);setNotice("Listing confirmed. Check your wallet for its current balance and status.");setListingPreview(null);}}}}>
          {tab==="buy"&&<p className="otc-fine">Selected listing: {market?.listings.find(l=>l.id===selected)?`${units(market.listings.find(l=>l.id===selected)!.available)} USDC available · ${pct(market.listings.find(l=>l.id===selected)!.premiumBps)} premium`:"Listing unavailable"}</p>}
          <>{tab==="buy"&&<label>Pay with<select value={paymentAsset} disabled={busy} onChange={e=>{setPaymentAsset(e.target.value as "ETH"|"USDC");setQuote(null);}}><option value="ETH">Base ETH</option><option value="USDC">Base USDC</option></select><small>Native Base USDC only. Base ETH is required for gas.</small></label>}</>
          <label>{tab==="buy"?"Arc USDC to receive":"Arc USDC to list"}<div className="otc-input-unit"><input required inputMode="decimal" disabled={busy||(tab==="sell"&&!!pendingListing)} value={amount} onChange={e=>{setAmount(e.target.value);setQuote(null);setListingPreview(null);}} pattern="[0-9]+(\.[0-9]{1,6})?"/><span>USDC</span></div><small>Minimum 10 USDC. Gas is additional.</small></label>
          {tab==="sell"&&<><label>Your premium<div className="otc-input-unit"><input required inputMode="decimal" disabled={busy||!!pendingListing} value={premium} onChange={e=>{setPremium(e.target.value);setListingPreview(null);}} pattern="[0-9]+(\.[0-9]{1,2})?"/><span>%</span></div><small>0% to 10,000%. The buyer pays the service fee.</small></label><div className="otc-comparison"><span>Current lowest <b>{pct(market?.stats.lowestBps??null)}</b></span><span>Weighted average <b>{pct(market?.stats.averageBps??null)}</b></span></div><p className="otc-fine">The listed amount and a gas allowance for partial fills will be locked. Your other funds remain available. A balance of exactly 10 USDC cannot cover a 10 USDC listing plus gas.</p></>}
          {tab==="sell"&&listingPreview&&<div className="otc-comparison"><span>Gas allowance <b>{units(listingPreview.gasReserveWei,18)} USDC</b></span><span>Total to reserve <b>{units(listingPreview.requiredWei,18)} USDC</b></span></div>}
          {inputError&&<p className="otc-fine" role="status">{inputError}</p>}
          <button className="arc-button" disabled={busy||!(ready||(tab==="sell"&&pendingListing&&session?.authenticated))} type="submit">{busy?"Checking…":tab==="buy"?"Get exact quote":pendingListing?"Retry original listing":listingPreview?"Confirm listing":"Check amount & gas"}</button>
        </form>
        {quote&&<div className="otc-quote"><div className="otc-panel-title"><h3>Your quote</h3><span>{Math.max(0,Math.ceil((quote.expiresAt-now)/1000))}s left</span></div><dl><dt>You receive</dt><dd>{units(quote.amount)} Arc USDC</dd><dt>Premium</dt><dd>{pct(quote.premiumBps)}</dd><dt>Seller receives</dt><dd>{units(quote.sellerWei,quote.paymentAsset==="USDC"?6:18)} {quote.paymentAsset??"ETH"}</dd><dt>Service fee · 1%</dt><dd>{units(quote.feeWei,quote.paymentAsset==="USDC"?6:18)} {quote.paymentAsset??"ETH"}</dd><dt>Base gas allowance</dt><dd>{units((BigInt(quote.baseGasWei)+BigInt(quote.approvalGasWei??"0")).toString(),18)} ETH</dd><dt>Reserved for this purchase</dt><dd>{quote.paymentAsset==="USDC"?`${units(quote.totalWei)} USDC + ${units((BigInt(quote.baseGasWei)+BigInt(quote.approvalGasWei??"0")).toString(),18)} ETH gas`:`${units((BigInt(quote.totalWei)+BigInt(quote.baseGasWei)).toString(),18)} ETH`}</dd></dl><p className="otc-fine">The seller and service fee receive your selected Base asset. USDC uses an exact-amount approval before payment. The fee applies after the premium. Unused gas stays in your wallet. Base fees can vary. Arc payout follows verified Base payment.</p><button className="arc-button" disabled={busy||now>=quote.expiresAt||quote.status!=="quoted"} onClick={async()=>{const result=await run({action:"accept",orderId:quote.id});if(result){setQuote(null);setNotice(`Order recorded: ${result.status.replaceAll("_"," ")}. Follow it on your wallet page.`);}}}>Confirm purchase</button></div>}
        {notice&&<p className="otc-notice" role="status">{notice}</p>}
      </section>}
      </dialog>
    </div>
  </div>;
}
