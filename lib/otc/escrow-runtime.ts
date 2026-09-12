import { OTC_DEPOSIT_WAIT_SECONDS } from "./deposit-confirmation";
import {BASE_DUST_WEI,BASE_RECOVERY_WEI,BASE_UNECONOMIC_REFUND_WEI} from "./gas-recovery";
import { CdpClient } from "@coinbase/cdp-sdk";
import { OTC_FEE_RECIPIENT } from "../project-config";
import { getAddress, parseTransaction, type Hex } from "viem";
import {escrowAccountName,legacyEscrowAccountName} from "./escrow-name";
export {escrowAccountName} from "./escrow-name";
import { arcConfigFromEnv } from "../arc/config";
import { baseConfigFromEnv } from "../base/config";
import { type Store, type Listing, type Order, type Transaction, type Wallet, type RecordValue, locked, walletId } from "./model";
import { repository } from "./repository";
import { advanceTransaction, balanceSnapshot, chainClient, prepareCall, walletTransferConfiguration } from "./runtime";
import { escrowCall, escrowRecords, escrowTxId, settlementSteps, type EscrowStep } from "./escrow-model";

export function escrowConfiguration(){
  walletTransferConfiguration(5042);walletTransferConfiguration(8453);
  return {feeRecipient:getAddress(OTC_FEE_RECIPIENT),arc:arcConfigFromEnv(),base:baseConfigFromEnv()};
}
const readStore=():Store=>({get:<T extends RecordValue>(id:string)=>repository().read<T|null>({id}),put:async()=>{throw Error("Read only");}});
export async function assertEscrowTransaction(record:Transaction){
  if(!record.escrowRef)throw new Error("Escrow transaction context missing.");
  const {listing,order}=await escrowRecords(readStore(),record.escrowRef.listingId,record.escrowRef.orderId),tx=parseTransaction(record.unsigned as Hex);
  if(record.id!==escrowTxId(listing,record.escrowRef.step as EscrowStep,order))throw new Error("Escrow attempt changed.");
  const call=await escrowCall(readStore(),listing,record.escrowRef.step as EscrowStep,order,tx.value??0n);
  if(record.wallet.toLowerCase()!==call.from.toLowerCase()||record.owner!==call.owner||tx.chainId!==call.chainId||tx.to?.toLowerCase()!==call.to.toLowerCase()||(tx.value??0n)!==call.value||(tx.data??"0x")!==call.data)throw new Error("Escrow signing authorization mismatch.");
  if(call.from.toLowerCase()!==listing.escrow!.address!.toLowerCase()&&!await repository().identity(record.owner,record.wallet))throw new Error("Escrow participant wallet is not active.");
}
export async function provisionEscrow(listing:Listing){
  const accountName=escrowAccountName(listing.id);
  const repair=listing.status==="funding"&&!listing.escrow?.address&&listing.escrow?.accountName===legacyEscrowAccountName(listing.id);
  if(!listing.escrow||listing.escrow.accountName!==accountName&&!repair)throw new Error("Escrow account name mismatch.");
  const cdp=new CdpClient({apiKeyId:process.env.CDP_API_KEY_ID,apiKeySecret:process.env.CDP_API_KEY_SECRET,walletSecret:process.env.CDP_WALLET_SECRET});
  const account=await cdp.evm.getOrCreateAccount({name:accountName});
  return repository().command<Listing>("escrow_bind",{id:listing.id,address:account.address,...(repair?{accountName}:{})});
}
async function runStep(listing:Listing,step:EscrowStep,order?:Order){
  const repo=repository();
  if(order)order=await repo.read<Order>({id:order.id});
  if(order?.status==="payment_failed")return false;
  const id=escrowTxId(listing,step,order);let record=await repo.read<Transaction|null>({id});
  if(record?.status==='cancelled'){
    if(record.nonceConflict&&['fund','deposit'].includes(step))await repo.command('cleanup_external_conflict',{id});
    return false;
  }
  if(record?.status==="reverted")throw new Error("Escrow transaction reverted. Retry settlement after checking balances.");
  if(!record){
    if(step==='fund'||step==='deposit'){
      const address=step==='fund'?listing.seller:order!.buyer,chain=step==='fund'?5042:8453;
      const snapshot=await balanceSnapshot(chain,address),w=await repo.read<Wallet|null>({id:walletId(chain,address)});
      if(w&&(BigInt(snapshot.balanceWei)<locked(w)||snapshot.nonce!==snapshot.pendingNonce)){
        await repo.command(step==='fund'?'abort_unfunded_listing':'abort_unfunded_purchase',{id:step==='fund'?listing.id:order!.id,owner:step==='fund'?listing.owner:order!.owner});
        return false;
      }
    }
    if(step==="return_arc"&&BigInt(listing.available)<=10_000n){
      const balance=await balanceSnapshot(5042,listing.escrow!.address!);
      const w=await repo.read<Wallet|null>({id:walletId(5042,listing.escrow!.address!)});
      const dust=BigInt(balance.balanceWei)-(w?locked(w)-BigInt(w.holds[listing.id]??"0"):0n);
      if(dust>=0n&&dust<=10n**16n){await repo.command("escrow_arc_dust",{listingId:listing.id,balanceWei:balance.balanceWei,block:balance.block});return false;}
    }
    if(step==="return_gas"&&order){
      if(order.escrow?.refundSkipped)return true;
      const balance=await balanceSnapshot(8453,listing.escrow!.address!);
      const w=await repo.read<Wallet|null>({id:walletId(8453,listing.escrow!.address!)});
      const dust=BigInt(balance.balanceWei)-(w?locked(w):0n);
      if(dust>=0n&&dust<=BASE_DUST_WEI){
        await repo.command("escrow_dust",{listingId:listing.id,orderId:order.id,balanceWei:balance.balanceWei,block:balance.block});return true;
      }
    }
    if(order&&["arc","seller","fee"].includes(step)){
      const recovery=step==="arc"?"arc_topup":"topup";
      if((recovery==="arc_topup"?order.escrow!.arcTopupWei:order.escrow!.topupWei)&&!await runStep(listing,recovery,order))return false;
    }
    // Do not collect the buyer's payment unless the funded position still covers all Arc reservations.
    if(order&&(step==="gas"||step==="deposit")){
      const arc=await balanceSnapshot(5042,listing.escrow!.address!),w=await repo.read<Wallet>({id:walletId(5042,listing.escrow!.address!)});
      if(!w||w.activeTx||BigInt(arc.balanceWei)<locked(w))throw new Error("Arc escrow inventory is not covered.");
    }
    const returning=step==="return_arc"||step==="return_gas";
    // Probe the cost first; a return sends only balance above other users' gas credits.
    const probe=returning?{chainId:step==="return_arc"?5042 as const:8453 as const,owner:listing.owner,from:getAddress(listing.escrow!.address!),to:getAddress(step==="return_arc"?listing.seller:order!.buyer),value:0n,data:"0x" as Hex}:await escrowCall(readStore(),listing,step,order);
    let prepared=await prepareCall(probe.chainId,probe,returning||step==="fund"||!!order&&["arc","seller","fee"].includes(step));
    if(step==="fund"&&BigInt(prepared.gasWei)>BigInt(listing.escrow!.fundingGasWei)){
      listing=await repo.command<Listing>("escrow_funding_gas",{listingId:listing.id,gasWei:prepared.gasWei});
      if(listing.status!=="funding")return false;
      prepared=await prepareCall(5042,await escrowCall(readStore(),listing,"fund"));
    }
    if(order&&["arc","seller","fee"].includes(step)){
      const w=await repo.read<Wallet|null>({id:walletId(probe.chainId,probe.from)});
      const free=BigInt(prepared.snapshot.balanceWei)-(w?locked(w):0n);
      const gas=BigInt(prepared.gasWei);
      const needed=step==="arc"?(gas>BigInt(order.arcGasWei)?gas-BigInt(order.arcGasWei):0n)
        :BigInt(step==="seller"?order.sellerWei:"0")+BigInt(order.feeWei)+gas*(step==="seller"?2n:1n);
      const shortfall=needed>free?needed-free:0n;
      if(shortfall>0n){
        const arc=step==="arc";
        const limit=BigInt((arc?order.escrow!.arcRecoveryLimitWei:order.escrow!.baseRecoveryLimitWei)??(arc?10n**16n:BASE_RECOVERY_WEI).toString());
        if(shortfall>limit)throw Error("Settlement gas exceeds the small recovery allowance.");
        order=await repo.command<Order>("escrow_topup",{listingId:listing.id,orderId:order.id,amount:shortfall.toString(),arc,expectedAttempt:order.escrow!.attempts?.[arc?"arc_topup":"topup"]??0});
        if(!await runStep(listing,arc?"arc_topup":"topup",order))return false;
        prepared=await prepareCall(probe.chainId,probe);
      }
    }
    if(returning){
      const w=await repo.read<Wallet|null>({id:walletId(probe.chainId,probe.from)});
      const others=w?locked(w)-BigInt(w.holds[listing.id]??"0"):0n;
      const refundGasMargin=step==="return_gas"?2n:1n;
      for(let attempt=0;attempt<3;attempt++){
        const value=BigInt(prepared.snapshot.balanceWei)-others-BigInt(prepared.gasWei)*refundGasMargin;
        if(value<=0n){
          const remainder=BigInt(prepared.snapshot.balanceWei)-others;
          if(step==="return_gas"&&order&&remainder>=0n&&remainder<=BASE_UNECONOMIC_REFUND_WEI){
            await repo.command("escrow_dust",{listingId:listing.id,orderId:order.id,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block,refundGasWei:prepared.gasWei});return true;
          }
          throw new Error("Escrow needs gas to return the remaining funds.");
        }
        const call=await escrowCall(readStore(),listing,step,order,value);
        try{
          const next=await prepareCall(call.chainId,call);
          const gasWei=BigInt(next.gasWei)*refundGasMargin,reserveWei=value+gasWei;
          if(reserveWei+others>BigInt(next.snapshot.balanceWei))throw new Error("Not enough funds for the amount and gas.");
          prepared={...next,gasWei:gasWei.toString(),reserveWei:reserveWei.toString()};break;
        }catch(error){
          if(attempt===2||!(error instanceof Error)||error.message!=="Not enough funds for the amount and gas.")throw error;
          // Recalculate only an unsigned refund. Never touch another owner's credits or a submitted transaction.
          prepared=await prepareCall(probe.chainId,probe,true);
        }
      }
    }
    record=await repo.command<Transaction>("escrow_prepare",{listingId:listing.id,...(order?{orderId:order.id}:{}),step,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,gasWei:prepared.gasWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
  }
  if(record.status!=="completed")await advanceTransaction(record.id);
  let latest=await repo.read<Transaction>({id});
  if(latest.status==="submitted"&&latest.hash){
    // Continue a promptly mined payout in this worker pass instead of waiting a minute per leg.
    const receipt=await chainClient(latest.chainId).waitForTransactionReceipt({hash:latest.hash as Hex,timeout:8000,pollingInterval:1000}).catch(()=>null);
    if(receipt){
      if(step==="deposit"){
        const block=await chainClient(8453).getBlock({blockNumber:receipt.blockNumber});
        // Keep this live worker pass through the short deposit window, avoiding
        // an extra minute waiting for the next scheduled recovery pass.
        const windowMs=Number(OTC_DEPOSIT_WAIT_SECONDS)*1000+1000;
        const remaining=Math.max(0,Math.min(windowMs,Number(block.timestamp)*1000+windowMs-Date.now()));
        if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
      }
      await advanceTransaction(id,true);latest=await repo.read<Transaction>({id});
    }
  }
  if(latest.status==="reverted"){
    if(step==="deposit"&&order&&(await repo.read<Order>({id:order.id})).status==="payment_failed")return false;
    throw new Error("Escrow transaction reverted. Retry settlement after checking balances.");
  }
  return latest.status==="completed";
}
export async function advanceEscrowPosition(id:string){
  const repo=repository();let listing=await repo.read<Listing>({id});
  if(!listing?.escrow||!["funding","closing"].includes(listing.status))return;
  if(!listing.escrow.address)listing=await provisionEscrow(listing);
  const step=listing.status==="funding"?"fund":"return_arc";
  if(await runStep(listing,step)){
    const balance=step==="return_arc"?await balanceSnapshot(5042,listing.escrow!.address!):undefined;
    await repo.command("escrow_advance",{listingId:id,...(balance?{arcBalanceWei:balance.balanceWei,arcBlock:balance.block}:{})});
  }
}
export async function advanceEscrowOrder(order:Order){
  if(!order.escrow||["quoted","completed","expired","payment_failed"].includes(order.status))return;
  const repo=repository();
  if(order.status==="payment_pending"&&Date.now()-order.createdAt>=120_000){
    // The mutation proves no signing ever started, atomically with begin_signing.
    // A signed or funded order remains locked and continues normal recovery.
    try{const result=await repo.command<Order|false>("expire_unpaid",{id:order.id});if(result&&result.status==="payment_failed")return;}catch{/* Not safely cancellable. */}
  }
  if(!await repo.command<boolean>("escrow_claim",{listingId:order.listingId,orderId:order.id}))return;
  const listing=await repo.read<Listing>({id:order.listingId});
  for(const step of settlementSteps(order)){
    let complete=false;
    for(let attempt=0;attempt<3;attempt++){
      try{complete=await runStep(listing,step,order);break;}
      catch(error){
        const message=error instanceof Error?error.message:"";
        if(step==="arc"||attempt===2||!/Receipt is not canonical|Base RPC block is unavailable|Block at number.*could not be found/i.test(message))throw error;
        // Re-read the durable step; never construct a replacement for a submitted transaction.
        await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
      }
    }
    if(!complete){
      if((await repo.read<Order>({id:order.id})).status==='payment_failed')return;
      await repo.command("escrow_advance",{listingId:listing.id,orderId:order.id});
      return;
    }
    if(step!=="return_gas")await repo.command("escrow_advance",{listingId:listing.id,orderId:order.id,progressOnly:true});
  }
  // A resumed order may already have every receipt, including its refund.
  // Finalize once with the balance evidence; an intermediate advance without it throws.
  const balance=await balanceSnapshot(8453,order.escrow.address);
  await repo.command("escrow_advance",{listingId:listing.id,orderId:order.id,baseBalanceWei:balance.balanceWei,baseBlock:balance.block});
}
