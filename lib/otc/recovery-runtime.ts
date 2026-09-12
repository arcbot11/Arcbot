import {getAddress,parseTransaction,serializeTransaction,type Hex} from "viem";
import {arcConfigFromEnv} from "../arc/config";
import {baseConfigFromEnv} from "../base/config";
import {createBaseRpc} from "../base/rpc";
import type {BaseTransaction} from "../base/transfers";
import {repository} from "./repository";
import {balanceSnapshot,chainClient,advanceTransaction,verifyRaw} from "./runtime";
import {nativeSpend} from "./native-spend";
import {type Transaction,type Wallet,walletId} from "./model";
import {unsignedEnvelope,verifyExternalSignature} from './external-signature';
import {keccak256,recoverTransactionAddress} from 'viem';
import {expiredSwap} from './unsigned-recovery';

/** Explicit operator/owner authorization to retry the same signature, never a new payment. */
export async function resumePausedTransaction(id:string,owner:string,expectedHash:string){
  const repo=repository(),record=await repo.read<Transaction>({id});
  if(!record||record.owner!==owner||record.hash!==expectedHash||!record.raw||record.externalReplacement)throw Error('Signed request changed.');
  if(expiredSwap(record))throw Error('Trade expired. Reconcile or cancel its nonce instead of rebroadcasting.');
  if(await verifyRaw(record.raw as Hex,record.unsigned as Hex,record.wallet)!==expectedHash)throw Error('Signature mismatch.');
  await repo.command('resume_signed_broadcast',{id,owner,expectedHash});
  return advanceTransaction(id);
}

/** Operator supplies the maximum TOTAL native gas budget, not an extra fee. */
export async function replaceTransactionFees(id:string,maxGasWei:bigint){
  const repo=repository();let record=await repo.read<Transaction>({id});
  if(!record?.raw||!record.hash||!["signed","submitted"].includes(record.status))throw Error("Inspect the signed transaction before replacing its fees.");
  if(await verifyRaw(record.raw as Hex,record.unsigned as Hex,record.wallet)!==record.hash)throw Error("Stored signature hash mismatch.");
  const client=chainClient(record.chainId);
  const receipt=await client.getTransactionReceipt({hash:record.hash as Hex}).catch(error=>{if(error?.name==="TransactionReceiptNotFoundError")return null;throw error;});
  if(receipt)return advanceTransaction(id);
  const snapshot=await balanceSnapshot(record.chainId,record.wallet),old=parseTransaction(record.unsigned as Hex);
  if(old.type!=="eip1559"||snapshot.nonce!==old.nonce)throw Error("Nonce changed. Reconcile the mined transaction before replacing fees.");
  const fees=await client.estimateFeesPerGas({type:"eip1559",chain:null});
  const increase=(v:bigint)=>((v*1125n+999n)/1000n)+1n;
  const maxFeePerGas=fees.maxFeePerGas>increase(old.maxFeePerGas??0n)?fees.maxFeePerGas:increase(old.maxFeePerGas??0n);
  const maxPriorityFeePerGas=fees.maxPriorityFeePerGas>increase(old.maxPriorityFeePerGas??0n)?fees.maxPriorityFeePerGas:increase(old.maxPriorityFeePerGas??0n);
  const config=record.chainId===5042?arcConfigFromEnv():baseConfigFromEnv();
  if(maxFeePerGas>config.maxFeePerGas||maxPriorityFeePerGas>maxFeePerGas||!old.gas||old.gas>config.maxGas)throw Error("Replacement exceeds configured gas policy.");
  const tx={type:"eip1559" as const,chainId:record.chainId,to:getAddress(old.to!),value:old.value??0n,data:old.data??"0x",nonce:old.nonce,gas:old.gas,accessList:old.accessList,maxFeePerGas,maxPriorityFeePerGas};
  let gasWei=tx.gas*maxFeePerGas;
  if(record.chainId===8453){const base=baseConfigFromEnv(),extra=await createBaseRpc(base).extraFees(tx as BaseTransaction,BigInt(snapshot.block));if(extra.l1FeeUpperBoundWei<0n||extra.operatorFeeWei<0n)throw Error("Invalid Base fee estimate.");gasWei+=2n*(extra.l1FeeUpperBoundWei+extra.operatorFeeWei);if(gasWei>base.maxTotalFeeWei)throw Error("Replacement exceeds Base gas policy.");}
  if(maxGasWei<=0n||gasWei>maxGasWei)throw Error("Replacement exceeds the approved total gas budget.");
  const w=await repo.read<Wallet>({id:walletId(record.chainId,record.wallet)}),existing=BigInt(w?.holds[record.holdId]??"0"),required=nativeSpend(record.chainId,tx)+gasWei;
  // Keep the old hold if it was larger. No other listing or order may fund this replacement.
  record=await repo.command<Transaction>("replace_fees",{id,expectedHash:record.hash,unsigned:serializeTransaction(tx),reserveWei:(required>existing?required:existing).toString(),balanceWei:snapshot.balanceWei,block:snapshot.block});
  return advanceTransaction(record.id);
}

/** Read canonical finalized evidence for an operator-supplied mined hash. */
export async function reconcileTransactionNonce(id:string,hash:Hex):Promise<Transaction>{
  const repo=repository(),record=await repo.read<Transaction>({id});
  if(!record?.raw||!record.hash||!["signed","submitted"].includes(record.status))throw Error("A signed request is required for nonce reconciliation.");
  if((record.externalReplacement?await verifyExternalSignature(record):await verifyRaw(record.raw as Hex,record.unsigned as Hex,record.wallet))!==record.hash)throw Error("Stored signature hash mismatch.");
  if(record.hash===hash||record.previousSigned?.some(a=>a.hash===hash))return advanceTransaction(id);
  const client=chainClient(record.chainId),old=parseTransaction(record.unsigned as Hex);
  const [mined,receipt,finalized]=await Promise.all([client.getTransaction({hash}),client.getTransactionReceipt({hash}),client.getBlock({blockTag:"finalized"})]);
  if(!['success','reverted'].includes(receipt.status))throw Error('Conflicting transaction execution status is unavailable.');
  if((mined.chainId!==undefined&&mined.chainId!==record.chainId)||mined.from.toLowerCase()!==record.wallet.toLowerCase()||mined.nonce!==old.nonce||receipt.transactionHash!==hash||mined.blockHash!==receipt.blockHash||mined.blockNumber!==receipt.blockNumber||finalized.number===null||finalized.number<receipt.blockNumber)throw Error("Finalized conflicting nonce is not verified.");
  const [canonical,nonce,finalBlock]=await Promise.all([client.getBlock({blockNumber:receipt.blockNumber}),client.getTransactionCount({address:getAddress(record.wallet),blockNumber:finalized.number}),client.getBlock({blockNumber:finalized.number})]);
  if(canonical.hash!==receipt.blockHash||finalBlock.hash!==finalized.hash||nonce<=mined.nonce)throw Error("Nonce evidence changed or is incomplete.");
  const fields={...mined,to:mined.to??undefined,data:mined.input};
  const signature=mined.yParity!==undefined?{r:mined.r,s:mined.s,yParity:mined.yParity}:{r:mined.r,s:mined.s,v:mined.v!};
  const raw=serializeTransaction(fields as Parameters<typeof serializeTransaction>[0],signature);
  const unsigned=unsignedEnvelope(raw);
  if(keccak256(raw)!==hash||(await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase()!==record.wallet.toLowerCase())throw Error("Mined transaction signature mismatch.");
  const updated=await repo.command<Transaction>("reconcile_mined_nonce",{id,expectedHash:record.hash,unsigned,raw,hash,block:receipt.blockNumber.toString(),receiptSuccess:receipt.status==='success'});
  return updated.status==="submitted"?advanceTransaction(id):updated;
}

/** Binary search the finalized nonce transition, eight reads per pass; no indexer trust. */
export async function discoverConsumedNonce(record:Transaction):Promise<Transaction>{
  if(!record.raw||!record.hash)throw Error('Signed request required.');
  const verified=record.externalReplacement?await verifyExternalSignature(record):await verifyRaw(record.raw as Hex,record.unsigned as Hex,record.wallet);
  if(verified!==record.hash)throw Error('Stored signature mismatch.');
  const repo=repository(),client=chainClient(record.chainId),nonce=parseTransaction(record.unsigned as Hex).nonce!;
  let search=record.nonceSearch;
  if(search&&(await client.getBlock({blockNumber:BigInt(search.anchor)})).hash!==search.anchorHash)search=undefined;
  if(!search){
    const head=await client.getBlock({blockTag:'finalized'});
    if(head.number===null||!head.hash||await client.getTransactionCount({address:getAddress(record.wallet),blockNumber:head.number})<=nonce)throw Error('External transaction is awaiting finality. Original request remains unresolved.');
    search={low:'0',high:head.number.toString(),anchor:head.number.toString(),anchorHash:head.hash};
  }
  let low=BigInt(search.low),high=BigInt(search.high);
  for(let i=0;i<8&&low<high;i++){
    const middle=(low+high)/2n;
    const count=await client.getTransactionCount({address:getAddress(record.wallet),blockNumber:middle});
    if(count>nonce)high=middle;else low=middle+1n;
  }
  if((await client.getBlock({blockNumber:BigInt(search.anchor)})).hash!==search.anchorHash)throw Error('Nonce evidence changed.');
  await repo.command('nonce_search',{id:record.id,expectedHash:record.hash,search:{...search,low:low.toString(),high:high.toString()}});
  if(low!==high)throw Error('Checking the external transaction that used this nonce.');
  const block=await client.getBlock({blockNumber:low,includeTransactions:true});
  const mined=block.transactions?.find(t=>t.from.toLowerCase()===record.wallet.toLowerCase()&&t.nonce===nonce);
  if(!mined)throw Error('External nonce change needs transaction evidence.');
  return reconcileTransactionNonce(record.id,mined.hash);
}
