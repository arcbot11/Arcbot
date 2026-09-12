import {parseTransaction,type Hex} from "viem";
import {type Store,type Transaction,type Order,type Listing,wallet,locked,checkSnapshot} from "./model";
import { BASE_RECOVERY_WEI } from "./gas-recovery";
import { BASE_GAS_POLICY } from "../project-config";
import {nativeSpend} from "./native-spend";
import {abortUnfundedListing,abortUnfundedPurchase} from './external-spending';

export type SignedAttempt={unsigned:string;raw:string;hash:string;revision:number};
export const BASE_WITHDRAWAL_GAS_FLEX_WEI=10n**12n; // At most 0.000001 additional ETH per withdrawal.
export function withdrawalGasLimit(tx:Transaction){
  const parsed=parseTransaction(tx.unsigned as Hex);
  return BigInt(tx.initialGasReserveWei??((parsed.gas??0n)*(parsed.maxFeePerGas??0n)).toString())+BASE_WITHDRAWAL_GAS_FLEX_WEI;
}
/** Only the original sender's free ETH can cover a small withdrawal gas change. */
export async function extendBaseWithdrawalGas(store:Store,input:{id:string;expectedHash:string;gasWei:string;balanceWei:string;block:string},now:number){
  const tx=await store.get<Transaction>(input.id);
  if(!tx?.raw||tx.hash!==input.expectedHash||tx.chainId!==8453||tx.leg!=="send"||tx.escrowRef||tx.orderId||!["signed","submitted"].includes(tx.status))throw Error("Withdrawal gas recovery transaction changed.");
  const gas=BigInt(input.gasWei),parsed=parseTransaction(tx.unsigned as Hex);
  if(gas<=0n||gas>withdrawalGasLimit(tx)||gas>BigInt(BASE_GAS_POLICY.maxTotalFeeWei))throw Error("Withdrawal fee estimate exceeds the automatic recovery limit.");
  const w=await wallet(store,8453,tx.wallet,tx.owner,now);checkSnapshot({...w,activeTx:undefined},input.block);
  if(w.activeTx!==tx.id)throw Error("Wallet transaction lease mismatch.");
  const old=BigInt(w.holds[tx.holdId]??"0"),required=(parsed.value??0n)+gas;
  if(required<=old)return tx;
  if(BigInt(input.balanceWei)<locked(w)-old+required)throw Error("Not enough Base ETH for withdrawal gas.");
  w.holds[tx.holdId]=required.toString();w.updatedAt=now;tx.updatedAt=now;delete tx.note;
  await store.put(w);await store.put(tx);return tx;
}
/** Increase only the gas hold; preserve the signed bytes, nonce, amount and recipient. */
export async function extendEscrowBaseGas(store:Store,input:{id:string;expectedHash:string;gasWei:string;balanceWei:string;block:string},now:number){
  const tx=await store.get<Transaction>(input.id);
  if(!tx?.raw||tx.hash!==input.expectedHash||tx.chainId!==8453||!["signed","submitted"].includes(tx.status)
    ||!tx.escrowRef?.orderId||!["deposit","seller","fee"].includes(tx.escrowRef.step))throw Error("Escrow gas recovery transaction changed.");
  const order=await store.get<Order>(tx.escrowRef.orderId),listing=await store.get<Listing>(tx.escrowRef.listingId);
  if(!order?.escrow||!listing?.escrow||order.listingId!==listing.id||["quoted","expired","completed","payment_failed"].includes(order.status))throw Error("Escrow order is not settling.");
  if(listing.escrow.settlementOrderId!==order.id)throw Error("Escrow settlement lock changed.");
  const parsed=parseTransaction(tx.unsigned as Hex),gas=BigInt(input.gasWei);
  const limit=BigInt(order.baseGasWei)+BigInt(order.escrow.baseRecoveryLimitWei??BASE_RECOVERY_WEI.toString());
  if(gas<=0n||gas>limit||gas>BigInt(BASE_GAS_POLICY.maxTotalFeeWei))throw Error("Gas exceeds the escrow allowance.");
  const w=await wallet(store,8453,tx.wallet,tx.owner,now);checkSnapshot({...w,activeTx:undefined},input.block);
  if(w.activeTx!==tx.id)throw Error("Wallet transaction lease mismatch.");
  const old=BigInt(w.holds[tx.holdId]??"0"),required=(parsed.value??0n)+gas;
  if(required<=old)return tx;
  if(BigInt(input.balanceWei)<locked(w)-old+required)throw Error("Not enough funds for the amount and gas.");
  w.holds[tx.holdId]=required.toString();w.updatedAt=now;
  tx.updatedAt=now;delete tx.note;
  await store.put(w);await store.put(tx);return tx;
}
export function sameCall(a:string,b:string){const x=parseTransaction(a as Hex),y=parseTransaction(b as Hex);return (x.chainId===y.chainId||y.type==='legacy'&&y.chainId===undefined)&&x.nonce===y.nonce&&x.to?.toLowerCase()===y.to?.toLowerCase()&&(x.data??"0x")===(y.data??"0x")&&(x.value??0n)===(y.value??0n);}
export function sameIntent(a:string,b:string){
  const x=parseTransaction(a as Hex),y=parseTransaction(b as Hex);
  return x.type==="eip1559"&&y.type==="eip1559"&&x.chainId===y.chainId&&x.nonce===y.nonce&&x.to?.toLowerCase()===y.to?.toLowerCase()&&(x.data??"0x")===(y.data??"0x")&&(x.value??0n)===(y.value??0n)&&x.gas===y.gas&&JSON.stringify(x.accessList??[])===JSON.stringify(y.accessList??[]);
}
/** A fee-only replacement retains every signed attempt and the same nonce. */
export async function prepareReplacement(store:Store,input:{id:string;expectedHash:string;unsigned:string;reserveWei:string;balanceWei:string;block:string},now:number){
  const tx=await store.get<Transaction>(input.id);
  if(!tx||!["signed","submitted"].includes(tx.status)||!tx.raw||!tx.hash||tx.hash!==input.expectedHash||!sameIntent(tx.unsigned,input.unsigned))throw Error("Replacement transaction changed. Inspect the current request.");
  const before=parseTransaction(tx.unsigned as Hex),after=parseTransaction(input.unsigned as Hex);
  if((after.maxFeePerGas??0n)<((before.maxFeePerGas??0n)*1125n+999n)/1000n||(after.maxPriorityFeePerGas??0n)<((before.maxPriorityFeePerGas??0n)*1125n+999n)/1000n||(after.maxFeePerGas??0n)<=(before.maxFeePerGas??0n))throw Error("Replacement fees must increase by at least 12.5%.");
  if((tx.previousSigned?.length??0)>=5)throw Error("Replacement limit reached. Operator reconciliation required.");
  const w=await wallet(store,tx.chainId,tx.wallet,tx.owner,now);checkSnapshot({...w,activeTx:undefined},input.block);
  if(w.activeTx!==tx.id)throw Error("Wallet transaction lease mismatch.");
  const old=BigInt(w.holds[tx.holdId]??"0"),reserve=BigInt(input.reserveWei);
  if(reserve<old||reserve<nativeSpend(tx.chainId,after)+(after.gas??0n)*(after.maxFeePerGas??0n)||BigInt(input.balanceWei)<locked(w)-old+reserve)throw Error("Replacement gas is not covered by available funds.");
  w.holds[tx.holdId]=reserve.toString();w.updatedAt=now;
  tx.previousSigned=[...(tx.previousSigned??[]),{unsigned:tx.unsigned,raw:tx.raw,hash:tx.hash,revision:tx.signingRevision??0}];
  tx.signingRevision=(tx.signingRevision??0)+1;tx.unsigned=input.unsigned;delete tx.raw;delete tx.hash;
  // This mutation is the durable signing fence for the operator-authorized bytes.
  tx.signingStartedAt=now;tx.status="prepared";tx.updatedAt=now;delete tx.broadcastPausedAt;
  await store.put(w);await store.put(tx);return tx;
}
export async function selectMinedAttempt(store:Store,id:string,hash:string,now:number){
  const tx=await store.get<Transaction>(id);
  if(!tx)throw Error("Transaction missing.");
  if(tx.hash===hash)return tx;
  if(["completed","reverted","cancelled"].includes(tx.status))throw Error("Transaction already resolved.");
  const attempt=tx.previousSigned?.find(a=>a.hash===hash);
  if(!attempt||!sameIntent(tx.unsigned,attempt.unsigned))throw Error("Unrecognized replacement receipt.");
  if(tx.raw&&tx.hash&&!tx.previousSigned!.some(a=>a.hash===tx.hash))tx.previousSigned!.push({unsigned:tx.unsigned,raw:tx.raw,hash:tx.hash,revision:tx.signingRevision??0});
  tx.unsigned=attempt.unsigned;tx.raw=attempt.raw;tx.hash=attempt.hash;tx.status="submitted";tx.updatedAt=now;
  await store.put(tx);return tx;
}

/** Private worker supplies finalized nonce evidence, never merely a pending nonce. */
export async function reconcileMinedNonce(store:Store,input:{id:string;expectedHash:string;unsigned:string;raw:string;hash:string;block:string;receiptSuccess?:boolean},now:number){
  const tx=await store.get<Transaction>(input.id);
  if(!tx?.raw||!tx.hash||tx.hash!==input.expectedHash||!["signed","submitted"].includes(tx.status))throw Error("Nonce recovery changed. Inspect the current request.");
  const original=parseTransaction(tx.unsigned as Hex),other=parseTransaction(input.unsigned as Hex);
  if((original.chainId!==other.chainId&&!(other.type==='legacy'&&other.chainId===undefined))||original.nonce!==other.nonce||tx.hash===input.hash)throw Error("Not a conflicting nonce.");
  if(sameCall(tx.unsigned,input.unsigned)){
    tx.previousSigned=[...(tx.previousSigned??[]),{unsigned:tx.unsigned,raw:tx.raw,hash:tx.hash,revision:tx.signingRevision??0}];
    tx.unsigned=input.unsigned;tx.raw=input.raw;tx.hash=input.hash;tx.status="submitted";tx.updatedAt=now;
    tx.externalReplacement=true;
    await store.put(tx);return tx; // Normal receipt, finality and delivery verification still required.
  }
  // A changed payment to the escrow may still have moved money. Keep it under
  // reconciliation rather than calling it unfunded or collecting a second deposit.
  if(input.receiptSuccess!==false&&tx.escrowRef&&['fund','deposit'].includes(tx.escrowRef.step)&&other.to?.toLowerCase()===original.to?.toLowerCase())throw Error('External transaction may have funded escrow with different terms. Reconciliation is required.');
  if(tx.orderId)throw Error("Legacy OTC nonce conflict requires manual reconciliation.");
  const w=await wallet(store,tx.chainId,tx.wallet,tx.owner,now);checkSnapshot({...w,activeTx:undefined},input.block);
  if(w.activeTx!==tx.id)throw Error("Wallet transaction lease mismatch.");
  const hold=BigInt(w.holds[tx.holdId]??"0");delete w.holds[tx.holdId];delete w.activeTx;
  if(w.usdcHolds)delete w.usdcHolds[tx.holdId];
  if(tx.escrowRef?.sourceHold)w.holds[tx.escrowRef.sourceHold]=(BigInt(w.holds[tx.escrowRef.sourceHold]??"0")+hold).toString();
  tx.nonceConflict={hash:input.hash,block:input.block};tx.status="cancelled";tx.note="A different finalized transaction consumed this nonce. Original request cannot execute.";tx.updatedAt=w.updatedAt=now;w.lastSettledBlock=input.block;
  await store.put(w);await store.put(tx);return tx;
}

export async function cleanupExternalConflict(store:Store,id:string,now:number){
  const tx=await store.get<Transaction>(id);
  if(!tx||tx.status!=='cancelled'||!tx.nonceConflict)throw Error('External conflict is not reconciled.');
  if(tx.escrowRef?.step==='fund')await abortUnfundedListing(store,tx.escrowRef.listingId,tx.owner,now);
  if(tx.escrowRef?.step==='deposit'&&tx.escrowRef.orderId)await abortUnfundedPurchase(store,tx.escrowRef.orderId,tx.owner,now);
  return tx;
}
export async function saveNonceSearch(store:Store,input:{id:string;expectedHash:string;search:NonNullable<Transaction['nonceSearch']>},now:number){
  const tx=await store.get<Transaction>(input.id);
  if(!tx?.raw||tx.hash!==input.expectedHash||!['signed','submitted'].includes(tx.status))throw Error('Nonce search request changed.');
  const s=input.search;
  if(![s.low,s.high,s.anchor].every(n=>/^\d+$/.test(n))||BigInt(s.low)>BigInt(s.high)||BigInt(s.high)>BigInt(s.anchor)||!/^0x[0-9a-f]{64}$/i.test(s.anchorHash))throw Error('Invalid nonce search bounds.');
  tx.nonceSearch=s;tx.updatedAt=now;await store.put(tx);return tx;
}
/** Pausing stops our broadcasts, never the executability of already signed bytes. */
export async function pauseSignedBroadcast(store:Store,input:{id:string;expectedHash:string},now:number){
  const tx=await store.get<Transaction>(input.id);
  if(!tx?.raw||tx.hash!==input.expectedHash||!['signed','submitted'].includes(tx.status))throw Error('Signed request changed.');
  tx.broadcastPausedAt??=now;tx.note='Signed transaction is underfunded. Bot broadcasts are paused. It is not cancelled and may execute if funds return. Resolve this request before submitting another.';
  tx.updatedAt=now;await store.put(tx);return tx;
}
export async function resumeSignedBroadcast(store:Store,input:{id:string;expectedHash:string;owner:string},now:number){
  const tx=await store.get<Transaction>(input.id);
  if(!tx?.raw||tx.hash!==input.expectedHash||tx.owner!==input.owner||tx.externalReplacement||!['signed','submitted'].includes(tx.status))throw Error('Signed request changed.');
  const w=await wallet(store,tx.chainId,tx.wallet,tx.owner,now);
  if(w.activeTx!==tx.id)throw Error('Wallet transaction lease mismatch.');
  delete tx.broadcastPausedAt;delete tx.note;tx.updatedAt=now;await store.put(tx);return tx;
}
