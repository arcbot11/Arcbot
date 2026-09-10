import { CdpClient } from "@coinbase/cdp-sdk";
import { OTC_FEE_RECIPIENT } from "../project-config";
import { getAddress, parseTransaction, type Hex } from "viem";
import {escrowAccountName,legacyEscrowAccountName} from "./escrow-name";
export {escrowAccountName} from "./escrow-name";
import { arcConfigFromEnv } from "../arc/config";
import { baseConfigFromEnv } from "../base/config";
import { type Store, type Listing, type Order, type Transaction, type Wallet, type RecordValue, locked, walletId } from "./model";
import { repository } from "./repository";
import { advanceTransaction, balanceSnapshot, prepareCall, walletTransferConfiguration } from "./runtime";
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
  const repo=repository(),id=escrowTxId(listing,step,order);let record=await repo.read<Transaction|null>({id});
  if(record?.status==="reverted")throw new Error("Escrow transaction reverted. Retry settlement after checking balances.");
  if(!record){
    // Do not collect the buyer's payment unless the funded position still covers all Arc reservations.
    if(order&&(step==="gas"||step==="deposit")){
      const arc=await balanceSnapshot(5042,listing.escrow!.address!),w=await repo.read<Wallet>({id:walletId(5042,listing.escrow!.address!)});
      if(!w||w.activeTx||BigInt(arc.balanceWei)<locked(w))throw new Error("Arc escrow inventory is not covered.");
    }
    const returning=step==="return_arc"||step==="return_gas";
    // Probe the cost first; a return sends only balance above other users' gas credits.
    const probe=returning?{chainId:step==="return_arc"?5042 as const:8453 as const,owner:listing.owner,from:getAddress(listing.escrow!.address!),to:getAddress(step==="return_arc"?listing.seller:order!.buyer),value:0n,data:"0x" as Hex}:await escrowCall(readStore(),listing,step,order);
    let prepared=await prepareCall(probe.chainId,probe);
    if(returning){
      const w=await repo.read<Wallet|null>({id:walletId(probe.chainId,probe.from)});
      const others=w?locked(w)-BigInt(w.holds[listing.id]??"0"):0n;
      const value=BigInt(prepared.snapshot.balanceWei)-others-BigInt(prepared.gasWei);
      if(value<=0n)throw new Error("Escrow needs gas to return the remaining funds.");
      const call=await escrowCall(readStore(),listing,step,order,value);
      prepared=await prepareCall(call.chainId,call);
    }
    record=await repo.command<Transaction>("escrow_prepare",{listingId:listing.id,...(order?{orderId:order.id}:{}),step,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,gasWei:prepared.gasWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
  }
  if(record.status!=="completed")await advanceTransaction(record.id);
  const latest=await repo.read<Transaction>({id});
  if(latest.status==="reverted")throw new Error("Escrow transaction reverted. Retry settlement after checking balances.");
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
  const repo=repository(),listing=await repo.read<Listing>({id:order.listingId});
  for(const step of settlementSteps(order)){
    if(!await runStep(listing,step,order))return;
    if(step!=="return_gas")await repo.command("escrow_advance",{listingId:listing.id,orderId:order.id});
  }
  const balance=await balanceSnapshot(8453,order.escrow.address);
  await repo.command("escrow_advance",{listingId:listing.id,orderId:order.id,baseBalanceWei:balance.balanceWei,baseBlock:balance.block});
}
