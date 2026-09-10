import { encodeFunctionData, getAddress, parseAbi, parseTransaction, type Hex } from "viem";
import { BASE_USDC } from "../base/usdc";
import { type Store, type Listing, type Order, type Transaction, wallet, locked, updateListingHold, finishOrder, paymentAsset } from "./model";
import { prepareTransaction } from "./transactions";


const transferAbi=parseAbi(["function transfer(address,uint256) returns(bool)"]);
export type EscrowStep="fund"|"gas"|"deposit"|"arc"|"seller"|"fee"|"return_arc"|"return_gas";
export const orderSteps:EscrowStep[]=["gas","deposit","arc","seller","fee","return_gas"];
export function escrowTxId(listing:Listing,step:EscrowStep,order?:Order){
  const attempt=(order?.escrow??listing.escrow)?.attempts?.[step]??0;
  return `escrow:${order?.id??listing.id}:${step}:${attempt}`;
}
export async function escrowRecords(store:Store,listingId:string,orderId?:string){
  const listing=await store.get<Listing>(listingId),order=orderId?await store.get<Order>(orderId):undefined;
  if(!listing||listing.kind!=="listing"||!listing.escrow)throw new Error("Escrow position missing.");
  if(orderId&&(!order||order.kind!=="order"||!order.escrow||order.listingId!==listing.id||order.escrow.address!==listing.escrow.address))throw new Error("Escrow order mismatch.");
  return {listing,order:order??undefined};
}
export async function completedStep(store:Store,listing:Listing,step:EscrowStep,order?:Order){
  const tx=await store.get<Transaction>(escrowTxId(listing,step,order));
  return tx?.status==="completed"&&tx.hash&&tx.blockNumber?tx:null;
}
/** Immutable recipients and order amounts; no caller-supplied payout destinations. */
export async function escrowCall(store:Store,listing:Listing,step:EscrowStep,order?:Order,returnWei?:bigint){
  const escrow=listing.escrow;
  if(!escrow?.address)throw new Error("Escrow wallet is not provisioned.");
  if(order){
    if(["quoted","expired","payment_failed","completed"].includes(order.status))throw new Error("Order is not settling.");
    const index=orderSteps.indexOf(step);
    if(index<0)throw new Error("Invalid escrow step.");
    for(const prior of orderSteps.slice(0,index))if(!await completedStep(store,listing,prior,order))throw new Error("Escrow deposit or preceding payout is not verified.");
    if(!await completedStep(store,listing,"fund"))throw new Error("Arc escrow deposit is not verified.");
  }else if(step==="fund"){
    if(listing.status!=="funding")throw new Error("Position is not funding.");
  }else{
    if(step!=="return_arc"||listing.status!=="closing"||listing.pendingFills||BigInt(listing.held)>0n)throw new Error("Position cannot return funds during settlement.");
    if(returnWei===undefined||returnWei<0n||(step==="return_arc"&&returnWei<BigInt(listing.available)*10n**12n))throw new Error("Escrow return does not cover remaining principal.");
  }
  const chainId=step==="fund"||step==="arc"||step==="return_arc"?5042 as const:8453 as const;
  const from=step==="fund"?listing.seller:(step==="gas"||step==="deposit")?order!.buyer:escrow.address;
  const owner=(step==="gas"||step==="deposit")?order!.owner:listing.owner;
  const recipient=step==="fund"||step==="gas"||step==="deposit"?escrow.address:step==="arc"?order!.buyer:step==="fee"?order!.feeRecipient:step==="return_gas"?order!.buyer:listing.seller;
  const amount=step==="fund"?BigInt(escrow.fundingWei):step==="gas"?BigInt(order!.escrow!.gasBudgetWei):step==="deposit"?BigInt(order!.totalWei):step==="arc"?BigInt(order!.amount)*10n**12n:step==="seller"?BigInt(order!.sellerWei):step==="fee"?BigInt(order!.feeWei):returnWei!;
  const token=!!order&&["deposit","seller","fee"].includes(step)&&paymentAsset(order)==="USDC";
  return {chainId,owner,from:getAddress(from),to:token?BASE_USDC:getAddress(recipient),value:token?0n:amount,data:token?encodeFunctionData({abi:transferAbi,functionName:"transfer",args:[getAddress(recipient),amount]}):"0x" as Hex};
}

export type EscrowPrepare={listingId:string;orderId?:string;step:EscrowStep;unsigned:Hex;reserveWei:string;gasWei:string;balanceWei:string;block:string};
export async function prepareEscrowStep(store:Store,input:EscrowPrepare,now:number){
  const {listing,order}=await escrowRecords(store,input.listingId,input.orderId),id=escrowTxId(listing,input.step,order);
  const prior=await store.get<Transaction>(id);if(prior)return prior;
  const tx=parseTransaction(input.unsigned),call=await escrowCall(store,listing,input.step,order,tx.value??0n);
  if(tx.chainId!==call.chainId||tx.to?.toLowerCase()!==call.to.toLowerCase()||(tx.value??0n)!==call.value||(tx.data??"0x")!==call.data)throw new Error("Escrow transaction does not match its step.");
  if(BigInt(input.gasWei)<=0n||BigInt(input.reserveWei)!==call.value+BigInt(input.gasWei))throw new Error("Invalid escrow reservation.");
  const gasLimit=input.step==="fund"?listing.escrow!.fundingGasWei:input.step==="arc"?order!.arcGasWei:input.step==="return_arc"?listing.escrow!.closeGasWei:order?.baseGasWei;
  if(gasLimit&&BigInt(input.gasWei)>BigInt(gasLimit))throw new Error("Gas exceeds the escrow allowance.");
  const w=await wallet(store,call.chainId,call.from,call.owner,now);
  if(w.activeTx)throw new Error("A wallet transaction is pending.");
  const holdId=input.step==="fund"||input.step==="arc"||input.step==="return_arc"?listing.id:(input.step==="deposit"||input.step==="gas")?order!.id:null;
  if(holdId){
    const held=BigInt(w.holds[holdId]??"0");
    if(!["return_arc"].includes(input.step)&&held<BigInt(input.reserveWei))throw new Error("Escrow funds are not reserved.");
    if(input.step==="fund"||input.step==="return_arc")delete w.holds[holdId];
    else w.holds[holdId]=(held-BigInt(input.reserveWei)).toString();
    await store.put(w);
  }
  const record=await prepareTransaction(store,{id,owner:call.owner,wallet:call.from,chainId:call.chainId,leg:"send",unsigned:input.unsigned,reserveWei:input.reserveWei,balanceWei:input.balanceWei,block:input.block},now);
  record.escrowRef={listingId:listing.id,...(order?{orderId:order.id}:{}),step:input.step,...(holdId?{sourceHold:holdId,reserveWei:input.reserveWei}:{})};await store.put(record);return record;
}
export async function bindEscrow(store:Store,id:string,address:string,now:number){
  const {listing}=await escrowRecords(store,id);const normalized=getAddress(address);
  if(normalized.toLowerCase()===listing.seller.toLowerCase()||/^0x0{40}$/i.test(normalized))throw new Error("Escrow must be a separate wallet.");
  if(listing.escrow!.address&&listing.escrow!.address!==normalized)throw new Error("Escrow wallet binding is immutable.");
  listing.escrow!.address=normalized;listing.updatedAt=now;await store.put(listing);return listing;
}
export async function advanceEscrowState(store:Store,listingId:string,orderId:string|undefined,now:number,baseBalanceWei?:string,baseBlock?:string,arcBalanceWei?:string,arcBlock?:string){
  const {listing,order}=await escrowRecords(store,listingId,orderId);
  if(order&&["completed","expired","payment_failed"].includes(order.status))return order;
  if(!order){
    if(listing.status==="funding"&&await completedStep(store,listing,"fund")){listing.status="active";await updateListingHold(store,listing,now);}
    if(listing.status==="closing"){
      const arc=await completedStep(store,listing,"return_arc");
      if(arc){
        if(arcBalanceWei===undefined||!arcBlock)throw new Error("Final Arc escrow balance is not verified.");
        const w=await wallet(store,5042,listing.escrow!.address!,listing.owner,now);
        if(w.activeTx||(w.lastSettledBlock&&BigInt(arcBlock)<BigInt(w.lastSettledBlock)))throw new Error("Arc escrow gas balance is pending verification.");
        const remainder=BigInt(arcBalanceWei)-locked(w);
        if(remainder<0n)throw new Error("Arc escrow gas credits are not covered.");
        listing.escrow!.gasRemainderWei=remainder.toString();w.holds[`gas-credit:${listing.id}`]=remainder.toString();await store.put(w);
        listing.escrow!.returnedWei=(parseTransaction(arc.unsigned as Hex).value??0n).toString();listing.available="0";listing.status=listing.escrow!.closeReason??"filled";delete listing.escrow!.note;await updateListingHold(store,listing,now);
      }
    }
    return listing;
  }
  const deposit=await completedStep(store,listing,"deposit",order),arc=await completedStep(store,listing,"arc",order),seller=await completedStep(store,listing,"seller",order),fee=await completedStep(store,listing,"fee",order);
  if(deposit){order.paymentHash=deposit.hash;order.status=arc?"payout_submitted":"payment_finalized";}
  if(arc)order.payoutHash=arc.hash;
  if(seller)order.sellerPaymentHash=seller.hash;
  if(fee)order.serviceFeeHash=fee.hash;
  order.updatedAt=now;await store.put(order);
  const refund=await completedStep(store,listing,"return_gas",order);
  if(deposit&&arc&&seller&&fee&&refund){
    if(!baseBalanceWei||!baseBlock)throw new Error("Final escrow balance is not verified.");
    const w=await wallet(store,8453,order.escrow!.address,listing.owner,now);
    if(w.activeTx||(w.lastSettledBlock&&BigInt(baseBlock)<BigInt(w.lastSettledBlock)))throw new Error("Escrow gas balance is pending verification.");
    if(order.escrow!.gasRemainderWei===undefined){const remainder=BigInt(baseBalanceWei)-locked(w);if(remainder<0n)throw new Error("Escrow gas credits are not covered.");order.escrow!.gasRemainderWei=remainder.toString();w.holds[`gas-credit:${order.id}`]=remainder.toString();await store.put(w);}
    order.gasRefundHash=refund.hash;await finishOrder(store,order,"completed",now);
  }
  return order;
}
export async function retryEscrow(store:Store,listingId:string,orderId:string|undefined,owner:string,now:number){
  const {listing,order}=await escrowRecords(store,listingId,orderId);
  if(owner!==listing.owner&&owner!==order?.owner)throw new Error("Escrow owner mismatch.");
  for(const step of order?orderSteps:listing.status==="funding"?["fund" as const]:["return_arc" as const]){
    const tx=await store.get<Transaction>(escrowTxId(listing,step,order));
    if(tx?.status==="reverted"&&tx.hash&&tx.blockNumber){if(tx.escrowRef?.sourceHold&&tx.escrowRef.reserveWei){const w=await wallet(store,tx.chainId,tx.wallet,tx.owner,now);w.holds[tx.escrowRef.sourceHold]=(BigInt(w.holds[tx.escrowRef.sourceHold]??"0")+BigInt(tx.escrowRef.reserveWei)).toString();await store.put(w);}const record=order??listing,e=record.escrow!;e.attempts={...e.attempts,[step]:(e.attempts?.[step]??0)+1};record.updatedAt=now;await store.put(record);return record;}
    if(!tx||tx.status!=="completed")break;
  }
  throw new Error("No verified reverted escrow transaction to retry.");
}
