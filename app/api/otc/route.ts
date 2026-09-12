import { getAddress, zeroAddress } from "viem";
import { settlementSteps } from "@/lib/otc/escrow-model";
import {neverSigned} from "@/lib/otc/unsigned-recovery";
import { escrowBaseGasBudget } from "@/lib/otc/base-gas-budget";
import { escrowConfiguration, escrowAccountName, advanceEscrowPosition } from "@/lib/otc/escrow-runtime";
import { assertListingRetry } from "@/lib/otc/listing-submission";
import { arcWalletBalance } from "@/lib/arc/wallet-balance";
import { listingPreview } from "@/lib/otc/listing-preview";
import { positionHistory } from "@/lib/otc/position-history";
import { transactionHistory } from "@/lib/otc/transaction-history";
import { arcOrderReceived } from "@/lib/otc/order-display";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { boundedJson } from "@/lib/bounded-json";
import { repository } from "@/lib/otc/repository";
import { balanceSnapshot, verifyRouter, ethPrice, prepareCall, advanceOrder, baseUsdcBalance, chainClient } from "@/lib/otc/runtime";
import { json, webFailure, websiteSession, WebError } from "@/lib/otc/http";
import { SERVICE_FEE_BPS, type Transaction, type Listing, type Order, type RecordValue, type Wallet, locked, paymentAsset, walletId, usdc, price } from "@/lib/otc/model";
import { payoutCall } from "@/lib/otc/transactions";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const amount=z.string().max(30), id=z.string().regex(/^[A-Za-z0-9:_-]{8,120}$/);
const bodySchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("list_preview"),amount,premium:z.string().max(12)}).strict(),
  z.object({action:z.literal("list"),requestId:id,amount,premium:z.string().max(12),maxGasReserveWei:z.string().regex(/^[1-9][0-9]{0,77}$/)}).strict(),
  z.object({action:z.literal("quote"),listingId:id,amount,paymentAsset:z.literal("ETH").default("ETH")}).strict(),
  z.object({action:z.literal("quote_preview"),listingId:id,amount}).strict(),
  z.object({action:z.literal("accept"),orderId:id}).strict(),
  z.object({action:z.literal("cancel"),listingId:id}).strict(),
  z.object({action:z.literal("retry_escrow"),listingId:id,orderId:id.optional()}).strict(),
  z.object({action:z.literal("retry_payout"),orderId:id,attempt:z.number().int().min(0)}).strict(),
]);
export async function GET(request:NextRequest) {
  if(request.nextUrl.searchParams.get("scope")==="wallet"){
    try {
      const session=await websiteSession(request),repo=repository();
      const records=await repo.read<RecordValue[]>({owner:session.owner});
      const listingReservedWei=records.reduce((sum,r)=>r.kind==="listing"&&r.owner===session.owner&&r.seller.toLowerCase()===session.walletAddress.toLowerCase()
        ?sum+(BigInt(r.available)+BigInt(r.held))*10n**12n:sum,0n).toString();
      const snapshots=await Promise.allSettled([arcWalletBalance(session.walletAddress),balanceSnapshot(8453,session.walletAddress)]);
      const balances=[5042,8453].map((chain,index)=>{
        const w=records.find(r=>r.kind==="wallet"&&r.id===walletId(chain as 5042|8453,session.walletAddress)) as Wallet|undefined;
        const result=snapshots[index]; const balance=result.status==="fulfilled"?BigInt(result.value.balanceWei):null;
        const held=w?locked(w):0n;
        return {chainId:chain,listingReservedWei:chain===5042?listingReservedWei:"0",balanceWei:balance?.toString()??null,lockedWei:held.toString(),availableWei:balance===null?null:(balance>held?balance-held:0n).toString(),pending:Boolean(w?.activeTx),error:result.status==="rejected"?`${chain===5042?"Arc":"Base"} balance unavailable. Retry shortly.`:null};
      });
      const retryAvailable=async(record:Order|Listing)=>{
        if(!record.escrow||["quoted","completed","expired","payment_failed","active","filled","cancelled"].includes(record.status))return false;
        const steps=record.kind==="order"?settlementSteps(record).flatMap(step=>[...(step==="arc"&&record.escrow?.arcTopupWei?["arc_topup"]:[]),...(step==="seller"&&record.escrow?.topupWei?["topup"]:[]),step]):[record.status==="funding"?"fund":"return_arc"];
        const txs=await Promise.all(steps.map(step=>repo.read<Transaction|null>({id:'escrow:'+record.id+':'+step+':'+(record.escrow!.attempts?.[step]??0)})));
        const next=txs.find(tx=>!tx||tx.status!=="completed");
        return !next||neverSigned(next)||Boolean(next.status==="reverted"&&next.hash&&next.blockNumber)||Boolean(next.status==="cancelled"&&next.nonceConflict);
      };
      const orders=await Promise.all(records.filter(r=>r.kind==="order"&&r.status!=="expired"&&r.status!=="quoted").map(async r=>{
        const o=r as Order; return {received:arcOrderReceived(o,records.filter((r):r is Transaction=>r.kind==="transaction")),listingId:o.listingId,canRetry:await retryAvailable(o),escrowAddress:o.escrow?.address,gasRemainderWei:o.escrow?.gasRemainderWei,sellerPaymentHash:o.sellerPaymentHash,serviceFeeHash:o.serviceFeeHash,gasRefundHash:o.gasRefundHash,payoutAttempt:o.payoutAttempt??0,paymentAsset:paymentAsset(o),approvalHash:o.approvalHash,id:o.id,amount:o.amount,premiumBps:o.premiumBps,totalWei:o.totalWei,feeWei:o.feeWei,status:o.status,paymentHash:o.paymentHash,payoutHash:o.payoutHash,note:o.note,createdAt:o.createdAt,side:o.owner===session.owner?"buy":"sell"};
      }));
      const transactions=records.filter((r):r is Transaction=>r.kind==="transaction"&&r.leg!=="allowance"&&r.leg!=="approval").map(transactionHistory);
      const listings=await Promise.all(records.filter((r):r is Listing=>r.kind==="listing").map(async listing=>({...positionHistory(listing,
        records.filter((r):r is Order=>r.kind==="order"), records.find((r):r is Wallet=>r.kind==="wallet"&&r.id===walletId(5042,listing.status==="funding"?listing.seller:listing.escrow?.address??listing.seller)),records.filter((r):r is Transaction=>r.kind==="transaction")),canRetry:await retryAvailable(listing)})));
      return json({walletAddress:session.walletAddress,balances,orders,transactions,listings});
    } catch(error){return webFailure(error);}
  }
  let enabled=false;
  try{escrowConfiguration();enabled=true;}catch{/* Configuration is deliberately separate from public browsing. */}
  try{
    const market=await repository().read<{listings:unknown[];stats:unknown}>();
    return json({...market,available:true,enabled});
  }catch{return json({listings:[],stats:{count:0,available:"0",lowestBps:null,averageBps:null},available:false,enabled:false});}
}
export async function POST(request:NextRequest) {
  try{
    const session=await websiteSession(request,true),body=bodySchema.parse(await boundedJson(request,4096));
    const repo=repository();
    if(body.action==="retry_escrow"){const r=await repo.command("escrow_retry",{listingId:body.listingId,orderId:body.orderId,owner:session.owner});return json(r);}
    if(body.action==="cancel"){const r=await repo.command("cancel",{id:body.listingId,owner:session.owner});return json(r);}
    if(body.action==="retry_payout"){
      const order=await repo.read<Order|null>({id:body.orderId});
      if(!order||order.sellerOwner!==session.owner||order.seller.toLowerCase()!==session.walletAddress.toLowerCase())throw new WebError("Order not found.",404);
      const prepared=await prepareCall(5042,payoutCall(order));
      if(BigInt(prepared.gasWei)>BigInt(order.arcGasWei))throw new WebError("Gas exceeded the original payout allowance. Retry when fees fall.");
      const result=await repo.command<Order>("retry_payout",{id:order.id,owner:session.owner,attempt:body.attempt,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
      try{await advanceOrder(order.id);}catch{/* Durable retry is picked up by the worker. */}
      return json(publicOrder(result));
    }
    if(body.action==="list"){
      const prior=await repo.read<Listing|null>({id:`listing:${session.owner}:${body.requestId}`});
      if(prior){assertListingRetry(prior,body.amount,body.premium,session.walletAddress);return json(prior);}
    }
    const context=body.action==="quote"||body.action==="quote_preview"?await repo.read<Listing|null>({id:body.listingId}):body.action==="accept"?await repo.read<Order|null>({id:body.orderId}):null;
    const config=context?.escrow||body.action==="list"||body.action==="list_preview"?{...escrowConfiguration(),router:context?.escrow?.address?getAddress(context.escrow.address):zeroAddress}:await verifyRouter();
    if(body.action==="list_preview") return json(await listingPreview(session.walletAddress,body.amount,body.premium));
    if(body.action==="list"){
      const prior=await repo.read<Listing|null>({id:`listing:${session.owner}:${body.requestId}`});
      if(prior){assertListingRetry(prior,body.amount,body.premium,session.walletAddress);return json(prior);}
      const preview=await listingPreview(session.walletAddress,body.amount,body.premium);
      if(BigInt(preview.gasReserveWei)>BigInt(body.maxGasReserveWei))throw new WebError("Gas changed. Review the listing again.");
      const snapshot=preview.snapshot;
      if(snapshot.nonce!==snapshot.pendingNonce)throw new WebError("Wallet has a pending transaction.");
      const listing=await repo.command<Listing>("escrow_listing",{id:`listing:${session.owner}:${body.requestId}`,owner:session.owner,seller:session.walletAddress,
        amount:body.amount,amountIncludesGas:true,escrow:{accountName:escrowAccountName(`listing:${session.owner}:${body.requestId}`),feeRecipient:config.feeRecipient},premium:body.premium,gasPerFillWei:preview.gasPerFillWei,balanceWei:snapshot.balanceWei,block:snapshot.block});
      try{await advanceEscrowPosition(listing.id);}catch{/* The worker resumes the durable funding request. */}
      return json(await repo.read<Listing>({id:listing.id}));
    }
    if(body.action==="quote"||body.action==="quote_preview"){
      const listing=await repo.read<Listing|null>({id:body.listingId});
      if(!listing||listing.kind!=="listing")throw new WebError("Listing not found.",404);
      const amount=usdc(body.amount);
      if(listing.status!=="active"||amount>BigInt(listing.available))throw new WebError("This listing no longer has that much USDC available. Enter a smaller amount.");
      const rate=await ethPrice();
      if(!listing.escrow?.address||listing.escrow.feeRecipient.toLowerCase()!==config.feeRecipient.toLowerCase())throw new WebError("Listing escrow configuration changed.");
      const cost=price(amount,listing.premiumBps,BigInt(rate.ethUsdMicros),SERVICE_FEE_BPS);
      const from=getAddress(session.walletAddress),to=getAddress(listing.escrow.address);
      // One validated native-transfer estimate includes Base L1/operator fees.
      // All settlement recipients must be EOAs; there is no calldata or contract execution.
      const payment=await prepareCall(8453,{from,to,value:BigInt(cost.totalWei),data:"0x"});
      const destinations=[getAddress(listing.seller),getAddress(listing.escrow.feeRecipient),from,to];
      const client=chainClient(8453);
      const codes=await Promise.all(destinations.map(address=>client.getCode({address,blockNumber:BigInt(payment.snapshot.block)})));
      if(codes.some(code=>code&&code!=="0x"))throw new WebError("OTC settlement requires standard EVM wallets.");
      const estimate=BigInt(payment.gasWei),gas=escrowBaseGasBudget([estimate,estimate,estimate],config.base.maxTotalFeeWei);
      const perTransfer=gas.perTransferWei;
      const funding=await repo.read<Wallet|null>({id:walletId(8453,session.walletAddress)});
      const required=BigInt(cost.totalWei)+gas.settlementWei+perTransfer;
      if(BigInt(payment.snapshot.balanceWei)-(funding?locked(funding):0n)<required)throw new WebError("Not enough available Base ETH for the amount, premium, 1.5% fee, and gas.");
      if(body.action==="quote_preview")return json({totalCostWei:required.toString()});
      // Durable quote reservation checks payment + settlement gas + deposit gas together.
      return json(publicOrder(await repo.command<Order>("quote",{id:`order:${randomUUID()}`,owner:session.owner,buyer:session.walletAddress,listingId:listing.id,amount:body.amount,paymentAsset:"ETH",...rate,baseGasWei:perTransfer.toString(),escrowGasBudgetWei:gas.settlementWei.toString(),baseBalanceWei:payment.snapshot.balanceWei,baseBlock:payment.snapshot.block,router:listing.escrow.address,feeRecipient:listing.escrow.feeRecipient})));
    }
    const order=await repo.read<Order|null>({id:body.orderId});
    if(!order||order.kind!=="order"||order.owner!==session.owner)throw new WebError("Order not found.",404);
    if(order.status!=="quoted")return json(publicOrder(order));
    if(paymentAsset(order)!=="ETH"||order.escrow&&order.escrow.version!==2)throw new WebError("Payment options changed. Request a new ETH quote.");
    if(order.router.toLowerCase()!==config.router.toLowerCase()||order.feeRecipient.toLowerCase()!==config.feeRecipient.toLowerCase())throw new WebError("Quote configuration changed. Request a new quote.");
    if(order.escrow){
      const [base,arc]=await Promise.all([balanceSnapshot(8453,session.walletAddress),balanceSnapshot(5042,order.escrow.address)]);
      if(base.nonce!==base.pendingNonce||arc.nonce!==arc.pendingNonce)throw new WebError("Wallet has a pending transaction.");
      await repo.command("accept",{id:order.id,owner:session.owner,snapshot:{baseBalanceWei:base.balanceWei,baseBlock:base.block,arcBalanceWei:arc.balanceWei,arcBlock:arc.block,...(paymentAsset(order)==="USDC"?{baseUsdcBalance:await baseUsdcBalance(session.walletAddress,base.block)}:{})}});
      try{await advanceOrder(order.id);}catch{await repo.command("note",{id:order.id,note:"Escrow settlement is waiting for verification. Funds remain held."});}
      return json(publicOrder(await repo.read<Order>({id:order.id})));
    }
    const [base,arc]=await Promise.all([balanceSnapshot(8453,session.walletAddress),prepareCall(5042,payoutCall(order))]);
    if(base.nonce!==base.pendingNonce||BigInt(arc.gasWei)>BigInt(order.arcGasWei))throw new WebError("Wallet has a pending transaction or insufficient gas reserve.");
    const funding = paymentAsset(order) === "USDC" ? {baseUsdcBalance: await baseUsdcBalance(session.walletAddress,base.block)} : {};
    const accepted=await repo.command<Order>("accept",{id:order.id,owner:session.owner,snapshot:{...funding,baseBalanceWei:base.balanceWei,baseBlock:base.block,arcBalanceWei:arc.snapshot.balanceWei,arcBlock:arc.snapshot.block}});
    // A failure after acceptance does not undo the durable order or release its inventory.
    try{await advanceOrder(order.id);}catch{await repo.command("note",{id:order.id,note:"Order accepted. Settlement is waiting for verification. Funds remain reserved."});}
    return json(publicOrder(await repo.read<Order>({id:accepted.id})));
  }catch(error){return webFailure(error);}
}

function publicOrder(order:Order){
  const {id,amount,premiumBps,sellerWei,feeWei,totalWei,baseGasWei,expiresAt,status,paymentHash,payoutHash,note}=order;
  return {serviceFeeBps:order.serviceFeeBps??100,escrowAddress:order.escrow?.address,escrowVersion:order.escrow?.version,escrowGasBudgetWei:order.escrow?.gasBudgetWei,gasRemainderWei:order.escrow?.gasRemainderWei,sellerPaymentHash:order.sellerPaymentHash,serviceFeeHash:order.serviceFeeHash,gasRefundHash:order.gasRefundHash,paymentAsset:paymentAsset(order),approvalGasWei:order.approvalGasWei??"0",approvalHash:order.approvalHash,id,amount,premiumBps,sellerWei,feeWei,totalWei,baseGasWei,expiresAt,status,paymentHash,payoutHash,note};
}
