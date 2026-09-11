import { decodeFunctionData, parseAbi, parseTransaction, type Hex } from "viem";
import { type Store, type Transaction, wallet } from "./model";

const routerAbi=parseAbi(["function execute(bytes,bytes[],uint256)"]);
export function expiredSwap(record:Transaction,now=Date.now()){
  if(record.leg!=="swap")return false;
  try{const tx=parseTransaction(record.unsigned as Hex);const {args}=decodeFunctionData({abi:routerAbi,data:tx.data!});return args[2]<=BigInt(Math.floor(now/1000));}catch{return false;}
}
/** Atomic with cancellation. Once entered, even a timed-out CDP call remains locked. */
export async function beginSigning(store:Store,id:string,now:number){
  const tx=await store.get<Transaction>(id);
  if(!tx||tx.status!=="prepared")throw Error("Transaction is no longer awaiting a signature.");
  const w=await wallet(store,tx.chainId,tx.wallet,tx.owner,now);
  if(w.activeTx!==id)throw Error("Wallet transaction lease mismatch.");
  tx.signingStartedAt??=now;await store.put(tx);return tx;
}
export async function cancelUnsignedTrade(store:Store,id:string,now:number){
  const tx=await store.get<Transaction>(id);
  if(tx?.status==="cancelled")return tx;
  // Old records predate this durable signing fence; absence of raw bytes alone
  // cannot establish that a legacy signing request never reached CDP.
  if(!tx||tx.recoveryVersion!==1||tx.status!=="prepared"||tx.signingStartedAt!==undefined||tx.raw||tx.hash||tx.escrowRef||tx.orderId||!expiredSwap(tx,now))throw Error("Transaction cannot be safely cancelled.");
  const w=await wallet(store,tx.chainId,tx.wallet,tx.owner,now);
  if(w.activeTx!==id)throw Error("Wallet transaction lease mismatch.");
  delete w.activeTx;delete w.holds[tx.holdId];
  tx.status="cancelled";tx.note="Trade expired before signing. Funds released. Submit again for a fresh quote.";
  tx.updatedAt=w.updatedAt=now;await store.put(w);await store.put(tx);return tx;
}
