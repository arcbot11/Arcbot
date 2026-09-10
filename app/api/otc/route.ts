import { assertListingRetry } from "@/lib/otc/listing-submission";
import { listingPreview } from "@/lib/otc/listing-preview";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { boundedJson } from "@/lib/bounded-json";
import { repository } from "@/lib/otc/repository";
import { balanceSnapshot, otcConfiguration, verifyRouter, ethPrice, prepareCall, advanceOrder } from "@/lib/otc/runtime";
import { json, webFailure, websiteSession, WebError } from "@/lib/otc/http";
import { type Listing, type Order, type RecordValue, type Wallet, locked, walletId, usdc, price } from "@/lib/otc/model";
import { payoutCall, paymentCall } from "@/lib/otc/transactions";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const amount=z.string().max(30), id=z.string().regex(/^[A-Za-z0-9:_-]{8,120}$/);
const bodySchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("list_preview"),amount,premium:z.string().max(12)}).strict(),
  z.object({action:z.literal("list"),requestId:id,amount,premium:z.string().max(12),maxGasReserveWei:z.string().regex(/^[1-9][0-9]{0,77}$/)}).strict(),
  z.object({action:z.literal("quote"),listingId:id,amount}).strict(),
  z.object({action:z.literal("accept"),orderId:id}).strict(),
  z.object({action:z.literal("cancel"),listingId:id}).strict(),
]);
export async function GET(request:NextRequest) {
  if(request.nextUrl.searchParams.get("scope")==="wallet"){
    try {
      const session=await websiteSession(request),repo=repository();
      const records=await repo.read<RecordValue[]>({owner:session.xUserId});
      const snapshots=await Promise.allSettled([balanceSnapshot(5042,session.walletAddress),balanceSnapshot(8453,session.walletAddress)]);
      const balances=[5042,8453].map((chain,index)=>{
        const w=records.find(r=>r.kind==="wallet"&&r.id===walletId(chain as 5042|8453,session.walletAddress)) as Wallet|undefined;
        const result=snapshots[index]; const balance=result.status==="fulfilled"?BigInt(result.value.balanceWei):null;
        const held=w?locked(w):0n;
        return {chainId:chain,balanceWei:balance?.toString()??null,lockedWei:held.toString(),availableWei:balance===null?null:(balance>held?balance-held:0n).toString(),pending:Boolean(w?.activeTx)};
      });
      const orders=records.filter(r=>r.kind==="order").map(r=>{
        const o=r as Order; return {id:o.id,amount:o.amount,premiumBps:o.premiumBps,totalWei:o.totalWei,feeWei:o.feeWei,status:o.status,paymentHash:o.paymentHash,payoutHash:o.payoutHash,note:o.note,createdAt:o.createdAt,side:o.owner===session.xUserId?"buy":"sell"};
      });
      const transactions=records.filter(r=>r.kind==="transaction").map(r=>{if(r.kind!=="transaction")throw new Error("Unexpected record");return {id:r.id,chainId:r.chainId,leg:r.leg,status:r.status,hash:r.hash,note:r.note,createdAt:r.createdAt};});
      return json({walletAddress:session.walletAddress,balances,orders,transactions,listings:records.filter(r=>r.kind==="listing")});
    } catch(error){return webFailure(error);}
  }
  let enabled=false;
  try{otcConfiguration();enabled=true;}catch{/* Configuration is deliberately separate from public browsing. */}
  try{
    const market=await repository().read<{listings:unknown[];stats:unknown}>();
    return json({...market,available:true,enabled});
  }catch{return json({listings:[],stats:{count:0,available:"0",lowestBps:null,averageBps:null},available:false,enabled:false});}
}
export async function POST(request:NextRequest) {
  try{
    const session=await websiteSession(request,true),body=bodySchema.parse(await boundedJson(request,4096));
    const repo=repository();
    if(body.action==="cancel")return json(await repo.command("cancel",{id:body.listingId,owner:session.xUserId}));
    if(body.action==="list"){
      const prior=await repo.read<Listing|null>({id:`listing:${session.xUserId}:${body.requestId}`});
      if(prior){assertListingRetry(prior,body.amount,body.premium,session.walletAddress);return json(prior);}
    }
    const config=await verifyRouter();
    if(body.action==="list_preview") return json(await listingPreview(session.walletAddress,body.amount,body.premium));
    if(body.action==="list"){
      const prior=await repo.read<Listing|null>({id:`listing:${session.xUserId}:${body.requestId}`});
      if(prior){assertListingRetry(prior,body.amount,body.premium,session.walletAddress);return json(prior);}
      const preview=await listingPreview(session.walletAddress,body.amount,body.premium);
      if(BigInt(preview.gasReserveWei)>BigInt(body.maxGasReserveWei))throw new WebError("Gas changed. Review the listing again.");
      const snapshot=preview.snapshot;
      if(snapshot.nonce!==snapshot.pendingNonce)throw new WebError("Wallet has a pending transaction.");
      return json(await repo.command("listing",{id:`listing:${session.xUserId}:${body.requestId}`,owner:session.xUserId,seller:session.walletAddress,
        amount:body.amount,premium:body.premium,gasPerFillWei:preview.gasPerFillWei,balanceWei:snapshot.balanceWei,block:snapshot.block}));
    }
    if(body.action==="quote"){
      const listing=await repo.read<Listing|null>({id:body.listingId});
      if(!listing||listing.kind!=="listing")throw new WebError("Listing not found.",404);
      const amount=usdc(body.amount),rate=await ethPrice();
      const cost=price(amount,listing.premiumBps,BigInt(rate.ethUsdMicros));
      const quoteId=`order:${randomUUID()}`;
      const payment=await prepareCall(8453,paymentCall({id:quoteId,buyer:session.walletAddress,seller:listing.seller,amount:amount.toString(),router:config.router,...cost}));
      const buffered=(BigInt(payment.gasWei)*125n+99n)/100n;
      const gas=buffered<config.base.maxTotalFeeWei?buffered:config.base.maxTotalFeeWei;
      return json(publicOrder(await repo.command<Order>("quote",{id:quoteId,owner:session.xUserId,buyer:session.walletAddress,listingId:body.listingId,
        amount:body.amount,...rate,baseGasWei:gas.toString(),baseBalanceWei:payment.snapshot.balanceWei,baseBlock:payment.snapshot.block,router:config.router,feeRecipient:config.feeRecipient,...cost})));
    }
    const order=await repo.read<Order|null>({id:body.orderId});
    if(!order||order.kind!=="order"||order.owner!==session.xUserId)throw new WebError("Order not found.",404);
    if(order.status!=="quoted")return json(publicOrder(order));
    if(order.router.toLowerCase()!==config.router.toLowerCase()||order.feeRecipient.toLowerCase()!==config.feeRecipient.toLowerCase())throw new WebError("Quote configuration changed. Request a new quote.");
    const [base,arc]=await Promise.all([balanceSnapshot(8453,session.walletAddress),prepareCall(5042,payoutCall(order))]);
    if(base.nonce!==base.pendingNonce||BigInt(arc.gasWei)>BigInt(order.arcGasWei))throw new WebError("Wallet has a pending transaction or insufficient gas reserve.");
    const accepted=await repo.command<Order>("accept",{id:order.id,owner:session.xUserId,snapshot:{baseBalanceWei:base.balanceWei,baseBlock:base.block,arcBalanceWei:arc.snapshot.balanceWei,arcBlock:arc.snapshot.block}});
    // A failure after acceptance does not undo the durable order or release its inventory.
    try{await advanceOrder(order.id);}catch{await repo.command("note",{id:order.id,note:"Order accepted. Settlement is waiting for verification. Funds remain reserved."});}
    return json(publicOrder(await repo.read<Order>({id:accepted.id})));
  }catch(error){return webFailure(error);}
}

function publicOrder(order:Order){
  const {id,amount,premiumBps,sellerWei,feeWei,totalWei,baseGasWei,expiresAt,status,paymentHash,payoutHash,note}=order;
  return {id,amount,premiumBps,sellerWei,feeWei,totalWei,baseGasWei,expiresAt,status,paymentHash,payoutHash,note};
}
