import type { Store, Transaction, Wallet } from "../otc/model";
import { locked, walletId } from "../otc/model";
import { parseTransaction, type Hex } from "viem";
import { FEE_EXECUTOR, FEE_EXECUTOR_OWNER, assertFeeGasBudget } from "./policy";
import { assertSponsoredTransaction } from "./calls";
import { feeTxId, finalizedFeeGas, phases, type FeeControl, type FeeJob } from "./jobs";
export async function authorizeFeeTransaction(store:Store,tx:Pick<Transaction,"id"|"owner"|"wallet"|"chainId"|"leg"|"creatorClaim"|"unsigned"|"orderId"|"sourceRequestId"|"escrowRef">,now:number,balanceWei?:bigint) {
  if(tx.owner!==FEE_EXECUTOR_OWNER && tx.wallet.toLowerCase()!==FEE_EXECUTOR.toLowerCase() && !tx.creatorClaim?.sponsored)return;
  assertSponsoredTransaction(tx);
  const terms=tx.creatorClaim!.sponsored!;
  const [job,control]=await Promise.all([store.get<FeeJob>(terms.jobId),store.get<FeeControl>("fee:control")]);
  if(!control?.enabled||!job||job.status!=="running"||!job.active||job.token.toLowerCase()!==tx.creatorClaim!.token.toLowerCase()||feeTxId(job.id,job.phase)!==tx.id||phases[job.phase]!==terms.phase)throw Error("Fee job authorization changed.");
  // Expiry never abandons a signed transaction; only fresh signing is gated here.
  if(now-job.createdAt>3_600_000)throw Error("Fee job authorization expired.");
  const prior=await Promise.all(job.steps.flatMap(s=>s.txId?[store.get<Transaction>(s.txId)]:[]));
  if(prior.some(t=>!t))throw Error("Fee transaction journal missing.");
  const parsed=parseTransaction(tx.unsigned as Hex),maximumCallWei=(parsed.gas??0n)*(parsed.maxFeePerGas??0n);
  const w=await store.get<Wallet>(walletId(5042,FEE_EXECUTOR));
  assertFeeGasBudget({balanceWei:balanceWei??10n**30n,otherReservedWei:w?locked(w)-BigInt(w.holds[tx.id]??"0"):0n,spentWei:finalizedFeeGas(prior as Transaction[]),maximumCallWei,calls:prior.length});
}
