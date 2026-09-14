import {v} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';
import {query,internalMutation} from './_generated/server';
import {internal} from './_generated/api';
import type {Listing,Order,Transaction,Wallet} from '../lib/otc/model';
import {walletId} from '../lib/otc/model';
import {transactionStatus} from '../lib/otc/transaction-history';
import {rememberToken} from './lib/tokenInventory';
import {updateListingTotals} from './lib/listingTotals';
import {parseTransaction,type Hex} from 'viem';
import {tokenTransfer} from '../lib/otc/token-delivery';
const auth=(secret:string)=>{if(!process.env.OTC_SERVICE_SECRET||secret!==process.env.OTC_SERVICE_SECRET)throw Error('Unauthorized.');};
export const summary=query({args:{secret:v.string(),owner:v.string(),address:v.string()},handler:async(ctx,a)=>{
  auth(a.secret);
  const wallets=await Promise.all(([5042,8453] as const).map(async chain=>{
    const row=await ctx.db.query('otcRecords').withIndex('by_key',q=>q.eq('key',walletId(chain,a.address))).unique();
    const wallet=row?JSON.parse(row.json) as Wallet:null;
    if(wallet&&(wallet.owner!==a.owner||wallet.address.toLowerCase()!==a.address.toLowerCase()))throw Error('Wallet ownership changed.');
    return wallet;
  }));
  const active=await Promise.all(wallets.flatMap(w=>w?.activeTx?[w.activeTx]:[]).map(async id=>{
    const row=await ctx.db.query('otcRecords').withIndex('by_key',q=>q.eq('key',id)).unique();
    const tx=row?JSON.parse(row.json) as Transaction:null;
    return tx&&tx.owner===a.owner&&tx.wallet.toLowerCase()===a.address.toLowerCase()?transactionStatus(tx):null;
  }));
  return {wallets,active:active.filter(Boolean)};
}});
export const history=query({args:{secret:v.string(),owner:v.string(),kind:v.union(v.literal('listing'),v.literal('order'),v.literal('transaction')),received:v.boolean(),paginationOpts:paginationOptsValidator},handler:async(ctx,a)=>{
  auth(a.secret);
  if(a.kind==='listing'){
    const migration=await ctx.db.query('walletDataMigration').withIndex('by_key',q=>q.eq('key','v1')).unique();
    if(!migration?.ready)throw Error('Listing history is updating. Try again shortly.');
  }
  if(a.paginationOpts.numItems>25)throw Error('Page too large.');
  const source=a.received?ctx.db.query('otcRecords').withIndex('by_counterparty',q=>q.eq('counterparty',a.owner).eq('kind',a.kind)):ctx.db.query('otcRecords').withIndex('by_owner',q=>q.eq('owner',a.owner).eq('kind',a.kind));
  const result=await source.order('desc').paginate(a.paginationOpts);
  const records=result.page.map(row=>JSON.parse(row.json) as Listing|Order|Transaction);
  if(a.kind==='listing'&&!a.paginationOpts.cursor){
    const open=(await Promise.all(['active','funding','closing'].map(status=>ctx.db.query('otcRecords').withIndex('by_owner_status',q=>q.eq('owner',a.owner).eq('kind','listing').eq('status',status)).order('desc').take(25)))).flat();
    for(const row of open)if(!records.some(r=>r.id===row.key))records.push(JSON.parse(row.json) as Listing);
  }
  const totals=await Promise.all(records.filter((r):r is Listing=>r.kind==='listing').map(async r=>{
    const total=await ctx.db.query('otcListingTotals').withIndex('by_listing',q=>q.eq('listingId',r.id)).unique();
    return {id:r.id,sold:total?.sold??'0',deliveredPending:total?.deliveredPending??'0',receivedEthWei:total?.receivedEthWei??'0',receivedUsdcUnits:total?.receivedUsdcUnits??'0'};
  }));
  return {records,totals,isDone:result.isDone,cursor:result.continueCursor};
}});
export const knownTokens=query({args:{secret:v.string(),owner:v.string(),address:v.string()},handler:async(ctx,a)=>{
  auth(a.secret);
  // The inventory handles older and external holdings. This bounded bridge
  // covers a newly completed trade before the one-time migration finishes.
  const rows=await ctx.db.query('otcRecords').withIndex('by_owner',q=>q.eq('owner',a.owner).eq('kind','transaction')).order('desc').take(30);
  return [...new Set(rows.flatMap(row=>{const tx=JSON.parse(row.json) as Transaction;return tx.wallet.toLowerCase()===a.address.toLowerCase()&&tx.chainId===5042?[tx.swapOutput?.token,tx.swapOutput?.inputToken].filter((t):t is string=>!!t):[];}))];
}});
export const ensure=internalMutation({args:{},handler:async(ctx)=>{
  if(await ctx.db.query('walletDataMigration').withIndex('by_key',q=>q.eq('key','v1')).unique())return;
  await ctx.db.insert('walletDataMigration',{key:'v1',ready:false});
  await ctx.scheduler.runAfter(0,internal.walletData.backfill,{cursor:null});
}});
export const backfill=internalMutation({args:{cursor:v.union(v.string(),v.null())},handler:async(ctx,a)=>{
  const page=await ctx.db.query('otcRecords').paginate({cursor:a.cursor,numItems:100});
  for(const row of page.page){
    if(row.kind==='order')await updateListingTotals(ctx,JSON.parse(row.json) as Order);
    if(row.kind!=='transaction'||row.status!=='completed')continue;
    const tx=JSON.parse(row.json) as Transaction;
    if(tx.swapOutput){await rememberToken(ctx,tx.chainId,tx.swapOutput.recipient??tx.wallet,tx.swapOutput.token);if(tx.swapOutput.inputToken)await rememberToken(ctx,tx.chainId,tx.wallet,tx.swapOutput.inputToken);}
    if(tx.leg==='send')try{const parsed=parseTransaction(tx.unsigned as Hex);if(parsed.to&&parsed.data?.startsWith('0xa9059cbb')){const t=tokenTransfer(parsed.data,parsed.value)!;await rememberToken(ctx,tx.chainId,tx.wallet,parsed.to);await rememberToken(ctx,tx.chainId,t.recipient,parsed.to);}}catch{/* Unknown historical calldata is not a holding. */}
  }
  if(!page.isDone)await ctx.scheduler.runAfter(0,internal.walletData.backfill,{cursor:page.continueCursor});
  else{const row=await ctx.db.query('walletDataMigration').withIndex('by_key',q=>q.eq('key','v1')).unique();if(row)await ctx.db.patch(row._id,{ready:true});}
}});
