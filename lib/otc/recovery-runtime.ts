import {getAddress,parseTransaction,serializeTransaction,type Hex} from "viem";
import {arcConfigFromEnv} from "../arc/config";
import {baseConfigFromEnv} from "../base/config";
import {createBaseRpc} from "../base/rpc";
import type {BaseTransaction} from "../base/transfers";
import {repository} from "./repository";
import {balanceSnapshot,chainClient,advanceTransaction,verifyRaw} from "./runtime";
import {nativeSpend} from "./native-spend";
import {type Transaction,type Wallet,walletId} from "./model";

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
export async function reconcileTransactionNonce(id:string,hash:Hex){
  const repo=repository(),record=await repo.read<Transaction>({id});
  if(!record?.raw||!record.hash||!["signed","submitted"].includes(record.status))throw Error("A signed request is required for nonce reconciliation.");
  if(await verifyRaw(record.raw as Hex,record.unsigned as Hex,record.wallet)!==record.hash)throw Error("Stored signature hash mismatch.");
  if(record.hash===hash||record.previousSigned?.some(a=>a.hash===hash))return advanceTransaction(id);
  const client=chainClient(record.chainId),old=parseTransaction(record.unsigned as Hex);
  const [mined,receipt,finalized]=await Promise.all([client.getTransaction({hash}),client.getTransactionReceipt({hash}),client.getBlock({blockTag:"finalized"})]);
  if(mined.type!=="eip1559"||mined.chainId!==record.chainId||mined.from.toLowerCase()!==record.wallet.toLowerCase()||mined.nonce!==old.nonce||receipt.transactionHash!==hash||mined.blockHash!==receipt.blockHash||mined.blockNumber!==receipt.blockNumber||finalized.number===null||finalized.number<receipt.blockNumber)throw Error("Finalized conflicting nonce is not verified.");
  const [canonical,nonce,finalBlock]=await Promise.all([client.getBlock({blockNumber:receipt.blockNumber}),client.getTransactionCount({address:getAddress(record.wallet),blockNumber:finalized.number}),client.getBlock({blockNumber:finalized.number})]);
  if(canonical.hash!==receipt.blockHash||finalBlock.hash!==finalized.hash||nonce<=mined.nonce)throw Error("Nonce evidence changed or is incomplete.");
  const fields={type:"eip1559" as const,chainId:mined.chainId,to:mined.to??undefined,value:mined.value,data:mined.input,nonce:mined.nonce,gas:mined.gas,maxFeePerGas:mined.maxFeePerGas,maxPriorityFeePerGas:mined.maxPriorityFeePerGas,accessList:mined.accessList};
  const unsigned=serializeTransaction(fields),raw=serializeTransaction(fields,{r:mined.r,s:mined.s,yParity:mined.yParity!});
  if(await verifyRaw(raw,unsigned,record.wallet)!==hash)throw Error("Mined transaction signature mismatch.");
  const updated=await repo.command<Transaction>("reconcile_mined_nonce",{id,expectedHash:record.hash,unsigned,raw,hash,block:receipt.blockNumber.toString()});
  return updated.status==="submitted"?advanceTransaction(id):updated;
}
