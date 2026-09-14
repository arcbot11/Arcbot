import {NextRequest} from 'next/server';
import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
import {websiteSession,json,webFailure,WebError} from '@/lib/otc/http';
import {repository} from '@/lib/otc/repository';
import {arcWalletBalance} from '@/lib/arc/wallet-balance';
import {balanceSnapshot,baseUsdcBalance} from '@/lib/otc/runtime';
import {locked,walletId,type Wallet,type Transaction,type Listing,type Order,MIN_USDC} from '@/lib/otc/model';
import {transactionHistory,transactionStatus} from '@/lib/otc/transaction-history';
import {positionHistory} from '@/lib/otc/position-history';
import {arcOrderReceived} from '@/lib/otc/order-display';
import {neverSigned} from '@/lib/otc/unsigned-recovery';
import {unpaidPurchaseCandidate} from '@/lib/otc/cancel-purchase';
import {settlementSteps} from '@/lib/otc/escrow-model';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
type Summary={wallets:(Wallet|null)[];active:ReturnType<typeof transactionStatus>[]};
type Total={id:string;sold:string;deliveredPending:string;receivedEthWei:string;receivedUsdcUnits:string};
type Page={records:(Listing|Order|Transaction)[];totals:Total[];isDone:boolean;cursor:string};
const summaries=new Map<string,Promise<Summary>>();
async function readSummary(client:ConvexHttpClient,secret:string,owner:string,address:string){
  const key=JSON.stringify([secret,owner,address.toLowerCase()]);
  const existing=summaries.get(key);if(existing)return existing;
  const pending=(client.query(makeFunctionReference<'query'>('walletData:summary'),{secret,owner,address}) as Promise<Summary>).finally(()=>{if(summaries.get(key)===pending)summaries.delete(key);});
  summaries.set(key,pending);return pending;
}
export async function GET(request:NextRequest){
  try{
    const session=await websiteSession(request),repo=repository();
    const client=new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!),secret=process.env.OTC_SERVICE_SECRET!;
    const part=request.nextUrl.searchParams.get('part')??'summary';
    const summary=await readSummary(client,secret,session.owner,session.walletAddress);
    if(part==='summary')return json({walletAddress:session.walletAddress,active:summary.active});
    if(part==='arc'||part==='base'){
      const chain=part==='arc'?5042:8453,w=summary.wallets.find(w=>w?.chainId===chain),held=w?locked(w):0n;
      const snapshot=await (chain===5042?arcWalletBalance(session.walletAddress):balanceSnapshot(8453,session.walletAddress)).catch(()=>null);
      const balance=snapshot?BigInt(snapshot.balanceWei):null;
      const balances=[{chainId:chain,observedAt:balance===null?null:Date.now(),balanceWei:balance?.toString()??null,lockedWei:held.toString(),availableWei:balance===null?null:(balance>held?balance-held:0n).toString(),balanceDeficitWei:balance!==null&&held>balance?(held-balance).toString():'0',pending:!!w?.activeTx,error:snapshot?null:`${chain===5042?'Arc':'Base'} balance could not refresh.`}];
      return json({walletAddress:session.walletAddress,balances});
    }
    if(part==='base-usdc'){
      const w=summary.wallets.find(w=>w?.chainId===8453),held=Object.values(w?.usdcHolds??{}).reduce((a,b)=>a+BigInt(b),0n);
      const raw=await balanceSnapshot(8453,session.walletAddress).then(s=>baseUsdcBalance(session.walletAddress,s.block)).catch(()=>null);
      return json({walletAddress:session.walletAddress,baseUsdc:{observedAt:raw===null?null:Date.now(),balance:raw,locked:held.toString(),available:raw===null?null:(BigInt(raw)>held?BigInt(raw)-held:0n).toString()}});
    }
    if(!['listings','orders','transactions'].includes(part))throw new WebError('Invalid wallet section.');
    const kind=part==='listings'?'listing':part==='orders'?'order':'transaction';
    const encoded=request.nextUrl.searchParams.get('cursor');
    if(encoded&&encoded.length>12000)throw new WebError('Invalid page.');
    const cursors:{owned?:string;received?:string;ownedDone?:boolean;receivedDone?:boolean}=encoded?JSON.parse(Buffer.from(encoded,'base64url').toString()):{};
    const page=async(received:boolean):Promise<Page>=>{
      if(received?cursors.receivedDone:cursors.ownedDone)return {records:[],totals:[],isDone:true,cursor:''};
      return client.query(makeFunctionReference<'query'>('walletData:history'),{secret,owner:session.owner,kind,received,paginationOpts:{numItems:20,cursor:(received?cursors.received:cursors.owned)??null}});
    };
    const [owned,received]=await Promise.all([page(false),kind==='order'?page(true):Promise.resolve({records:[],totals:[],isDone:true,cursor:''} as Page)]);
    const records=[...new Map([...owned.records,...received.records].map(r=>[r.id,r])).values()];
    const more=!owned.isDone||!received.isDone;
    const cursor=more?Buffer.from(JSON.stringify({owned:owned.cursor,received:received.cursor,ownedDone:owned.isDone,receivedDone:received.isDone})).toString('base64url'):null;
    const evidence=async(record:Order|Listing)=>{
      const steps=record.kind==='order'?[...new Set(['deposit','arc','seller','fee','return_gas',...settlementSteps(record),'arc_topup','topup'])]:['fund','return_arc'];
      return (await Promise.all(steps.map(step=>repo.read<Transaction|null>({id:`escrow:${record.id}:${step}:${record.escrow?.attempts?.[step]??0}`})))).filter((t):t is Transaction=>!!t&&t.kind==='transaction'&&(record.kind==='order'?t.escrowRef?.orderId===record.id:t.escrowRef?.listingId===record.id));
    };
    const retryAvailable=(record:Order|Listing,txs:Transaction[])=>{
      if(!record.escrow||['quoted','completed','expired','payment_failed','active','filled','cancelled'].includes(record.status))return false;
      const steps=record.kind==='order'?settlementSteps(record).flatMap(step=>[...(step==='arc'&&record.escrow?.arcTopupWei?['arc_topup']:[]),...(step==='seller'&&record.escrow?.topupWei?['topup']:[]),step]):[record.status==='funding'?'fund':'return_arc'];
      const next=steps.map(step=>txs.find(t=>t.escrowRef?.step===step)).find(t=>!t||t.status!=='completed');
      return !next||neverSigned(next)||!!(next.status==='reverted'&&next.hash&&next.blockNumber)||!!(next.status==='cancelled'&&next.nonceConflict);
    };
    let items:unknown[];
    if(kind==='transaction')items=records.filter((r):r is Transaction=>r.kind==='transaction'&&!['allowance','approval'].includes(r.leg)).map(transactionHistory);
    else if(kind==='order')items=await Promise.all(records.filter((r):r is Order=>r.kind==='order'&&!['expired','quoted'].includes(r.status)).map(async o=>{
      const txs=await evidence(o),received=arcOrderReceived(o,txs);
      return {id:o.id,listingId:o.listingId,amount:o.amount,premiumBps:o.premiumBps,feeWei:o.feeWei,totalWei:o.totalWei,paymentAsset:o.paymentAsset??'ETH',status:o.status,received,createdAt:o.createdAt,updatedAt:Math.max(o.createdAt,...txs.map(t=>t.progressAt??t.createdAt)),side:o.owner===session.owner?'buy':'sell',paymentHash:o.paymentHash??txs.find(t=>t.escrowRef?.step==='deposit'&&t.status==='completed')?.hash,payoutHash:o.payoutHash??txs.find(t=>t.escrowRef?.step==='arc'&&t.status==='completed')?.hash,note:o.status==='completed'?undefined:o.note,canCancelUnpaid:unpaidPurchaseCandidate(o,txs),canRetry:retryAvailable(o,txs)};
    }));
    else items=await Promise.all(records.filter((r):r is Listing=>r.kind==='listing').map(async l=>{
      const txs=await evidence(l),wallet=l.escrow?.address&&l.status!=='funding'?await repo.read<Wallet|null>({id:walletId(5042,l.escrow.address)})??undefined:summary.wallets.find(w=>w?.chainId===5042)??undefined;
      const history=positionHistory(l,[],wallet,txs),total=owned.totals.find(t=>t.id===l.id);
      const sold=total?.sold??'0',pendingDelivery=(BigInt(l.held)-BigInt(total?.deliveredPending??'0'));
      const settlementOrder=l.status==='active'&&l.escrow?.settlementOrderId?await repo.read<Order|null>({id:l.escrow?.settlementOrderId}):null;
      const canCancelUnpaid=!!settlementOrder&&settlementOrder.kind==='order'&&settlementOrder.listingId===l.id&&unpaidPurchaseCandidate(settlementOrder,await evidence(settlementOrder));
      const returned=history.returnedUsdc===null?null:BigInt(history.returnedUsdc)-BigInt(sold);
      return {id:l.id,available:l.available,held:l.held,premiumBps:l.premiumBps,status:l.status,sold,pendingDelivery:(pendingDelivery>0n?pendingDelivery:0n).toString(),closingAfterSettlement:l.status==='active'&&BigInt(sold)>0n&&BigInt(l.available)<MIN_USDC,receivedEthWei:total?.receivedEthWei??'0',receivedUsdcUnits:total?.receivedUsdcUnits??'0',returnedUsdc:l.escrow?.returnedWei?(BigInt(l.escrow.returnedWei)/10n**12n).toString():returned!==null&&returned>=0n?returned.toString():null,settlementLocked:history.settlementLocked,canCancel:history.canCancel||canCancelUnpaid,canRetry:retryAvailable(l,txs),...(history.escrow?.note?{escrow:{note:history.escrow.note}}:{})};
    }));
    return json({walletAddress:session.walletAddress,[part]:items,cursor});
  }catch(error){return webFailure(error);}
}
