import {recoverRewardRequest} from "../lib/launches/reward-recovery";
import {holderCursor,skipHolderPage,prepareHolderBatch} from "../lib/launches/holder-cursor";
import { pendingPurchases as filterPendingPurchases, PENDING_PURCHASE_STATUSES } from "../lib/otc/pending-purchases";
import {retainGasDust,retainArcDust,repriceFunding,requestGasTopup,claimSettlement,authorizeGasRecovery} from "../lib/otc/gas-recovery";
import {assertNoKeyExport} from "./lib/walletExportGuard";
import {walletExportIndexes} from "./lib/walletExportIndexes";
import {acquireOperatorLease,releaseOperatorLease} from "../lib/otc/operator-lease";
import {beginSigning,cancelUnsignedTrade} from "../lib/otc/unsigned-recovery";
import {assertLaunchAuthorization} from "../lib/launches/execution-checks";
import {prepareReplacement,selectMinedAttempt,reconcileMinedNonce,extendEscrowBaseGas,extendBaseWithdrawalGas,cleanupExternalConflict,saveNonceSearch,pauseSignedBroadcast,resumeSignedBroadcast} from "../lib/otc/signed-recovery";
import {abortChangedRequest,abortUnfundedListing,abortUnfundedPurchase} from '../lib/otc/external-spending';
import { bindEscrow, prepareEscrowStep, advanceEscrowState, retryEscrow } from "../lib/otc/escrow-model";
import { publicMarket } from "../lib/otc/public-market";
import { soldTotal } from "../lib/otc/sold-total";
import {cancelUnpaidPurchase,canCancelUnpaidPurchase} from "../lib/otc/cancel-purchase";
import type { QueryCtx,MutationCtx } from "./_generated/server";
import {internal} from "./_generated/api";
import type { Transaction } from "../lib/otc/model";
import { otcWorkerUrl } from "../lib/project-config";
import { mutation, query, action, internalAction,internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {recoveryTerminal,recoveryDelay,RECOVERY_LEASE_MS,BROADCAST_INTERVAL_MS} from '../lib/otc/recovery-policy';
import {rememberToken} from './lib/tokenInventory';
import {updateListingTotals} from './lib/listingTotals';
import {parseTransaction,type Hex} from 'viem';
import {tokenTransfer} from '../lib/otc/token-delivery';
import { createListing, createQuote, acceptQuote, cancelListing, finishOrder, type Store, type RecordValue, type Order, type Listing } from "../lib/otc/model";
import { prepareTransaction, rejectBridge, signTransactionRecord, submitted, settled, retryPayout } from "../lib/otc/transactions";

function authorize(secret: string) {
  if (!process.env.OTC_SERVICE_SECRET || secret !== process.env.OTC_SERVICE_SECRET) throw new Error("OTC service authorization failed.");
}
async function creditSale(ctx:MutationCtx,order:Order){
  if(await ctx.db.query("otcSales").withIndex("by_order",q=>q.eq("orderId",order.id)).unique())return;
  const stats=await ctx.db.query("otcMarketStats").withIndex("by_key",q=>q.eq("key","total")).unique();
  if(!stats)throw Error("Market statistics are not initialized.");
  await ctx.db.insert("otcSales",{orderId:order.id,amount:order.amount});
  await ctx.db.patch(stats._id,{soldUsdc:(BigInt(stats.soldUsdc)+BigInt(order.amount)).toString()});
}
export const backfillSales=internalMutation({args:{cursor:v.union(v.string(),v.null())},handler:async(ctx,args)=>{
  let stats=await ctx.db.query("otcMarketStats").withIndex("by_key",q=>q.eq("key","total")).unique();
  if(!stats){const id=await ctx.db.insert("otcMarketStats",{key:"total",soldUsdc:"0",ready:false});stats=(await ctx.db.get(id))!;}
  const page=await ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","order")).paginate({cursor:args.cursor,numItems:100});
  for(const row of page.page){const order=JSON.parse(row.json) as Order;
    const sold=await soldTotal([order],async id=>{const tx=await ctx.db.query("otcRecords").withIndex("by_key",q=>q.eq("key",id)).unique();return tx?JSON.parse(tx.json) as Transaction:null;});
    if(BigInt(sold)>0n)await creditSale(ctx,order);
  }
  if(page.isDone)await ctx.db.patch(stats._id,{ready:true});
  else await ctx.scheduler.runAfter(0,internal.otc.backfillSales,{cursor:page.continueCursor});
}});
export const ensureStats=internalMutation({args:{},handler:async(ctx)=>{
  if(await ctx.db.query("otcMarketStats").withIndex("by_key",q=>q.eq("key","total")).unique())return;
  await ctx.db.insert("otcMarketStats",{key:"total",soldUsdc:"0",ready:false});
  await ctx.scheduler.runAfter(0,internal.otc.backfillSales,{cursor:null});
}});
export const identity = query({args:{secret:v.string(),owner:v.string(),address:v.string()},handler:async(ctx,args)=>{
  authorize(args.secret);
  if (/^tg:\d{1,30}$/.test(args.owner)) {
    const wallet = await ctx.db.query("telegramNativeWallets").withIndex("by_user", q => q.eq("telegramUserId", args.owner.slice(3))).unique();
    return Boolean(wallet && wallet.address.toLowerCase() === args.address.toLowerCase());
  }
  const records=await ctx.db.query("cryptoWallets").withIndex("by_owner_x_user_id",q=>q.eq("ownerXUserId",args.owner)).collect();
  return records.some(wallet=>wallet.status==="active"&&wallet.address.toLowerCase()===args.address.toLowerCase());
}});
export const command = mutation({
  args: { secret: v.string(), command: v.string(), json: v.string() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    if (args.json.length > 32_768) throw new Error("OTC request too large.");
    const input = JSON.parse(args.json), now = Date.now();
    if(!await ctx.db.query("otcMarketStats").withIndex("by_key",q=>q.eq("key","total")).unique()){
      await ctx.db.insert("otcMarketStats",{key:"total",soldUsdc:"0",ready:false});
      await ctx.scheduler.runAfter(0,internal.otc.backfillSales,{cursor:null});
    }
    const store: Store = {
      get: async <T extends RecordValue>(id: string) => {
        const row = await ctx.db.query("otcRecords").withIndex("by_key", q=>q.eq("key",id)).unique();
        return row ? JSON.parse(row.json) as T : null;
      },
      put: async record => {
        const row = await ctx.db.query("otcRecords").withIndex("by_key", q=>q.eq("key",record.id)).unique();
        if(record.kind==='transaction'){
          const previous=row?JSON.parse(row.json) as Transaction:null;
          record.progressAt=previous?.progressAt??record.createdAt;
          if(!previous||previous.status!==record.status||previous.signingStartedAt!==record.signingStartedAt||previous.hash!==record.hash||previous.broadcastAcknowledgedAt!==record.broadcastAcknowledgedAt||previous.blockNumber!==record.blockNumber)record.progressAt=now;
          if(!recoveryTerminal(record.status)&&!await ctx.db.query('transactionRecovery').withIndex('by_key',q=>q.eq('key',record.id)).unique()){
            await ctx.db.insert('transactionRecovery',{key:record.id,attempt:0,dueAt:now+5000});
            await ctx.scheduler.runAfter(5000,internal.otc.recoverTransaction,{id:record.id});
          }
        }
        if(record.kind==="wallet"&&(record.activeTx||Object.values(record.holds).some(amount=>BigInt(amount)>0n)||Object.values(record.usdcHolds??{}).some(amount=>BigInt(amount)>0n)))await assertNoKeyExport(ctx,record.address);
        if(record.kind==="transaction"&&record.signingStartedAt!==undefined){
          const previous=row?JSON.parse(row.json) as Transaction:null;
          if(!previous?.signingStartedAt||previous.unsigned!==record.unsigned)await assertNoKeyExport(ctx,record.wallet);
        }
        const value = { key: record.id, kind: record.kind, owner: record.owner, ...walletExportIndexes(record), ...(record.kind === "order" ? { counterparty: record.sellerOwner } : {}),
          status: "status" in record ? record.status : "wallet", updatedAt: now, json: JSON.stringify(record) };
        if (row) await ctx.db.replace(row._id, value); else await ctx.db.insert("otcRecords",value);
        if(record.kind==="order"&&record.status==="completed")await creditSale(ctx,record);
        if(record.kind==='order')await updateListingTotals(ctx,record);
        if(record.kind==="transaction"&&record.status==="completed"&&record.hash&&record.blockNumber){
          if(record.swapOutput){
            await rememberToken(ctx,record.chainId,record.swapOutput.recipient??record.wallet,record.swapOutput.token);
            if(record.swapOutput.inputToken)await rememberToken(ctx,record.chainId,record.wallet,record.swapOutput.inputToken);
          }
          if(record.leg==='send'){
            const parsed=parseTransaction(record.unsigned as Hex),transfer=parsed.data?.startsWith('0xa9059cbb')?tokenTransfer(parsed.data,parsed.value):null;
            if(transfer&&parsed.to){await rememberToken(ctx,record.chainId,record.wallet,parsed.to);await rememberToken(ctx,record.chainId,transfer.recipient,parsed.to);}
          }
          const id=record.escrowRef?.step==="arc"?record.escrowRef.orderId:record.leg==="payout"?record.orderId:undefined;
          if(id){const order=await store.get<Order>(id);if(order){await creditSale(ctx,order);await updateListingTotals(ctx,order);}}
        }
      },
    };
    switch(args.command) {
      case 'recovery_acquire': {
        const tx=await store.get<Transaction>(input.id);
        if(!tx||recoveryTerminal(tx.status))return false;
        const row=await ctx.db.query('transactionRecovery').withIndex('by_key',q=>q.eq('key',input.id)).unique();
        if(row&&(row.leaseUntil??0)>now)return false;
        if(row)await ctx.db.patch(row._id,{lease:input.lease,leaseUntil:now+RECOVERY_LEASE_MS});
        else {
          await ctx.db.insert('transactionRecovery',{key:input.id,attempt:0,dueAt:now+5000,lease:input.lease,leaseUntil:now+RECOVERY_LEASE_MS});
          await ctx.scheduler.runAfter(5000,internal.otc.recoverTransaction,{id:input.id});
        }
        return true;
      }
      case 'recovery_release': {
        const row=await ctx.db.query('transactionRecovery').withIndex('by_key',q=>q.eq('key',input.id)).unique();
        if(row&&row.lease===input.lease)await ctx.db.patch(row._id,{lease:undefined,leaseUntil:undefined});
        return null;
      }
      case "operator_acquire": return acquireOperatorLease(store,input,now);
      case "operator_release": return releaseOperatorLease(store,input,now);
      case "escrow_arc_dust": return retainArcDust(store,input.listingId,input.balanceWei,input.block,now);
      case "escrow_funding_gas": return repriceFunding(store,input.listingId,input.gasWei,now);
      case "escrow_claim": return claimSettlement(store,input.listingId,input.orderId,now);
      case "escrow_dust": return retainGasDust(store,input.listingId,input.orderId,input.balanceWei,input.block,now,input.refundGasWei);
      case "escrow_topup": return requestGasTopup(store,input.listingId,input.orderId,input.amount,now,input.arc===true,input.expectedAttempt);
      case "escrow_gas_allowance": return authorizeGasRecovery(store,input.listingId,input.orderId,input.owner,input.limitWei,input.arc===true,now);
      case "begin_signing": {
        const tx = await store.get<import("../lib/otc/model").Transaction>(input.id);
        if(tx?.leg === "launch" && tx.signingStartedAt === undefined){
          const row=await ctx.db.query("launchRuns").withIndex("by_owner_request",q=>q.eq("owner",tx.owner).eq("requestId",tx.launchStep?.requestId??"")).unique();
          const run=row?JSON.parse(row.json) as import("../lib/launches/execution-types").LaunchRun:null;
          let valid=!!run&&run.status==="running"&&run.address.toLowerCase()===tx.wallet.toLowerCase()&&run.steps[tx.launchStep!.index]===tx.id;
          if(run){try{assertLaunchAuthorization(run,now);}catch{valid=false;}}
          if(!valid)return cancelUnsignedTrade(store,input.id,now,tx.owner);
        }
        if (tx?.sourceRequestId && !tx.signingStartedAt) {
          const request = await ctx.db.query("walletRequests").withIndex("by_request_id", q => q.eq("requestId", tx.sourceRequestId!)).unique();
          if (request?.source === "telegram") {
            const update = request.telegramUpdateId ? await ctx.db.query("telegramUpdates").withIndex("by_update_id", q => q.eq("updateId", request.telegramUpdateId!)).unique() : null;
            const link = update?.boundLinkId ? await ctx.db.get(update.boundLinkId) : null;
            // Atomic with unlink: a revoked Telegram link cannot start signing.
            // Already-started signatures are recovered using their original bytes.
            if (!link || update?.walletTransitionBlocked || link.revokedAt || link.ownerXUserId !== tx.owner || link.telegramUserId !== update?.telegramUserId || link.telegramChatId !== update?.telegramChatId)
              return cancelUnsignedTrade(store, input.id, now, tx.owner);
          }
        }
        return beginSigning(store,input.id,now);
      }
      case "replace_fees": return prepareReplacement(store,input,now);
      case "extend_escrow_base_gas": return extendEscrowBaseGas(store,input,now);
      case "extend_base_withdrawal_gas": return extendBaseWithdrawalGas(store,input,now);
      case "select_mined_attempt": return selectMinedAttempt(store,input.id,input.hash,now);
      case "reconcile_mined_nonce": {
        const tx=await reconcileMinedNonce(store,input,now);
        if(tx.status==='cancelled'&&tx.escrowRef&&['fund','deposit'].includes(tx.escrowRef.step))await cleanupExternalConflict(store,tx.id,now);
        return tx;
      }
      case "nonce_search": return saveNonceSearch(store,input,now);
      case "pause_signed_broadcast": return pauseSignedBroadcast(store,input,now);
      case "resume_signed_broadcast": return resumeSignedBroadcast(store,input,now);
      case "cleanup_external_conflict": return cleanupExternalConflict(store,input.id,now);
      case "cancel_unsigned_trade": return cancelUnsignedTrade(store,input.id,now,input.owner);
      case "abort_changed_request": return abortChangedRequest(store,input.id,input.reason,now);
      case "abort_unfunded_listing": return abortUnfundedListing(store,input.id,input.owner,now);
      case "abort_unfunded_purchase": return abortUnfundedPurchase(store,input.id,input.owner,now);
      case "escrow_bind": return bindEscrow(store,input.id,input.address,now,input.accountName);
      case "escrow_prepare": return prepareEscrowStep(store,input,now);
      case "escrow_advance": return advanceEscrowState(store,input.listingId,input.orderId,now,input.baseBalanceWei,input.baseBlock,input.arcBalanceWei,input.arcBlock,input.progressOnly===true);
      case "escrow_retry": return retryEscrow(store,input.listingId,input.orderId,input.owner,now);
      case "escrow_listing": {
        if (!input.escrow?.accountName || !input.escrow?.feeRecipient || input.amountIncludesGas !== true) throw new Error("Escrow listing configuration missing.");
        return createListing(store,input,now);
      }
      case "listing": return createListing(store,input,now);
      case "quote": {
        const open = await ctx.db.query("otcRecords").withIndex("by_owner",q=>q.eq("owner",input.owner).eq("kind","order")).filter(q=>q.eq(q.field("status"),"quoted")).collect();
        for (const row of open) {
          const order = JSON.parse(row.json) as Order;
          if (order.id === input.id) return order;
          if (order.listingReserved === false) {
            order.status = "expired"; order.updatedAt = now; delete order.note;
            await store.put(order); continue;
          }
          if (order.expiresAt > now) throw new Error("You already have a quote. Confirm it or wait for it to expire.");
          await finishOrder(store,order,"expired",now);
        }
        return createQuote(store,input,now);
      }
      case "accept": return acceptQuote(store,input.id,input.owner,input.snapshot,now,true);
      case "cancel_purchase": return cancelUnpaidPurchase(store,input.id,input.owner,now);
      case "purchase_status": {
        const order=await store.get<Order>(input.id);
        if(!order||order.owner!==input.owner)throw Error("Order not found.");
        if(order.status==="quoted"&&now>=order.expiresAt)return finishOrder(store,order,"expired",now);
        return {...order,canCancelUnpaid:await canCancelUnpaidPurchase(store,order.id,input.owner,now)};
      }
      case "expire_unpaid": {
        const order=await store.get<Order>(input.id);
        if(!order||now-order.createdAt<120_000)return false;
        return cancelUnpaidPurchase(store,input.id,order.owner,now);
      }
      case "cancel": {
        const listing=await store.get<Listing>(input.id);
        if(listing&&listing.owner===input.owner&&listing.escrow?.settlementOrderId)await cancelUnpaidPurchase(store,listing.escrow.settlementOrderId,input.owner,now);
        return cancelListing(store,input.id,input.owner,now);
      }
      case "expire": {
        const order = await store.get<Order>(input.id);
        if (!order) throw new Error("Order missing.");
        return finishOrder(store,order,"expired",now);
      }
      case "reward_recover": return recoverRewardRequest(store,input,now);
      case "holder_cursor": return holderCursor(store,input.token,now);
      case "holder_skip": return skipHolderPage(store,input.token,input.revision,input.nextOffset,now);
      case "holder_prepare": return prepareHolderBatch(store,input.transaction,input.revision,input.nextOffset,now);
      case "prepare": return prepareTransaction(store,input,now);
      case "bridge_reject": return rejectBridge(store,input,now);
      case "sign": return signTransactionRecord(store,input.id,input.raw,input.hash,now,input.unsigned);
      case "submitted": {
        if(input.lease){
          const row=await ctx.db.query('transactionRecovery').withIndex('by_key',q=>q.eq('key',input.id)).unique();
          if(row?.lease!==input.lease)throw Error('Recovery attempt changed. The saved transaction will be reconciled.');
        }
        const tx=await store.get<Transaction>(input.id);
        if(tx?.lastBroadcastAt&&now-tx.lastBroadcastAt<BROADCAST_INTERVAL_MS)throw Error('Broadcast retry is already scheduled.');
        return submitted(store,input.id,now);
      }
      case "broadcast_ack": {
        const tx=await store.get<Transaction>(input.id);
        if(!tx||tx.hash!==input.hash)throw Error("Broadcast acknowledgement changed.");
        tx.broadcastAcknowledgedAt=now;await store.put(tx);return tx;
      }
      case "settled": return settled(store,input.id,input.block,input.success,now,input.settlement,input.expectedHash);
      case "retry_payout": return retryPayout(store,input,now);
      case "touch": {
        const record=await store.get<RecordValue>(input.id);
        if(record){record.updatedAt=now;await store.put(record);} return null;
      }
      case "note": {
        const record = await store.get<RecordValue>(input.id);
        if (!record || !["order","transaction","listing"].includes(record.kind)) throw new Error("Record missing.");
        if(record.kind==="listing"&&record.escrow)record.escrow.note=String(input.note).slice(0,240);else if(record.kind==="order"||record.kind==="transaction")record.note = String(input.note).slice(0,240); record.updatedAt = now; await store.put(record); return null;
      }
      default: throw new Error("Unknown OTC command.");
    }
  },
});

async function readMarket(ctx:QueryCtx){
  const [listings,stats]=await Promise.all([
    ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","listing").eq("status","active")).collect(),
    ctx.db.query("otcMarketStats").withIndex("by_key",q=>q.eq("key","total")).unique(),
  ]);
  const market=publicMarket(listings.map(row=>JSON.parse(row.json) as Listing),stats?.soldUsdc??"0");
  return {...market,stats:{...market.stats,soldUsdc:stats?.ready?stats.soldUsdc:undefined}};
}
export const pendingPurchases = query({
  args: { secret:v.string(), owner:v.string(), wallet:v.string() },
  handler: async(ctx,args)=>{
    authorize(args.secret);
    const rows=(await Promise.all(PENDING_PURCHASE_STATUSES.map(status=>ctx.db.query("otcRecords")
      .withIndex("by_owner_status",q=>q.eq("owner",args.owner).eq("kind","order").eq("status",status)).collect()))).flat();
    return filterPendingPurchases(rows.map(row=>JSON.parse(row.json)),args.owner,args.wallet);
  },
});
export const read = query({
  args: { secret: v.string(), id: v.optional(v.string()), owner: v.optional(v.string()), work: v.optional(v.boolean()) },
  handler: async (ctx,args) => {
    authorize(args.secret);
    if (args.id) {
      const row = await ctx.db.query("otcRecords").withIndex("by_key",q=>q.eq("key",args.id!)).unique();
      return row ? JSON.parse(row.json) : null;
    }
    if (args.owner) {
      const [owned, received] = await Promise.all([
        ctx.db.query("otcRecords").withIndex("by_owner",q=>q.eq("owner",args.owner!)).collect(),
        ctx.db.query("otcRecords").withIndex("by_counterparty",q=>q.eq("counterparty",args.owner!)).collect(),
      ]);
      return [...new Map([...owned,...received].map(r=>[r.key,JSON.parse(r.json)])).values()];
    }
    if (args.work) {
      const statuses = ["quoted","payment_pending","payment_submitted","payment_finalized","payout_submitted"];
      const rows = (await Promise.all(statuses.map(status=>ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","order").eq("status",status)).order("asc").take(50)))).flat();
      const txs = (await Promise.all(["prepared","signed","submitted"].map(status=>ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","transaction").eq("status",status)).take(50)))).flat();
      const positions=(await Promise.all(["funding","closing"].map(status=>ctx.db.query("otcRecords").withIndex("by_kind_status",q=>q.eq("kind","listing").eq("status",status)).take(50)))).flat();
      return [...rows,...txs,...positions].map(r=>JSON.parse(r.json));
    }
    return readMarket(ctx);
  },
});

// Browsers subscribe only to this public projection. Private queries still require the service secret.
export const market = query({args:{},handler:async(ctx)=>{
  return readMarket(ctx);
}});

// Schedule this internal service endpoint in the deployment's scheduler. It does not depend on a browser remaining open.
export const wakeWorker = action({
  args: { secret: v.string() }, handler: async (_ctx,args) => {
    authorize(args.secret);
    const url = otcWorkerUrl();
    if (!url || !url.startsWith("https://")) throw new Error("OTC worker URL is not configured.");
    const response = await fetch(url,{ method:"POST",headers:{authorization:`Bearer ${args.secret}`} });
    if (!response.ok) throw new Error("OTC settlement worker failed.");
    return { ok:true };
  },
});

export const tick = internalAction({args:{},handler:async(ctx)=>{
  await ctx.runMutation(internal.walletData.ensure,{});
  await ctx.runMutation(internal.otc.ensureStats,{});
  const secret=process.env.OTC_SERVICE_SECRET;
  if(!secret)return;
  const url=otcWorkerUrl();
  if(!secret||!url||!url.startsWith("https://"))throw new Error("Wallet worker configuration missing.");
  const response=await fetch(url,{method:"POST",headers:{authorization:`Bearer ${secret}`}});
  if(!response.ok)throw new Error("OTC worker failed. Inspect pending jobs and worker logs.");
  const result=await response.json();
  if(result.failed>0)throw new Error(`OTC worker: ${result.failed} failed jobs; ${result.processed} processed.`);
}});

// One durable chain of retries per transaction. Scheduling does not depend on
// the website response, and the minute sweep remains a separate safety net.
export const rescheduleTransaction=internalMutation({args:{id:v.string()},handler:async(ctx,{id})=>{
  const job=await ctx.db.query('transactionRecovery').withIndex('by_key',q=>q.eq('key',id)).unique();
  if(!job)return;
  const row=await ctx.db.query('otcRecords').withIndex('by_key',q=>q.eq('key',id)).unique();
  if(!row||recoveryTerminal(row.status)){await ctx.db.delete(job._id);return;}
  const delay=recoveryDelay(job.attempt);
  await ctx.db.patch(job._id,{attempt:job.attempt+1,dueAt:Date.now()+delay});
  await ctx.scheduler.runAfter(delay,internal.otc.recoverTransaction,{id});
}});
export const recoverTransaction=internalAction({args:{id:v.string()},handler:async(ctx,{id})=>{
  try{
    const secret=process.env.OTC_SERVICE_SECRET,url=new URL(otcWorkerUrl());
    if(!secret||url.protocol!=='https:')throw Error('Recovery configuration missing.');
    url.searchParams.set('transaction',id);
    const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(65_000)});
    if(!response.ok)console.warn('transaction_recovery_retry',{id,status:response.status});
  }catch{console.warn('transaction_recovery_retry',{id,category:'worker_unavailable'});}
  finally{await ctx.runMutation(internal.otc.rescheduleTransaction,{id});}
}});
