import type { Order, Transaction } from "./model";
import { arcOrderReceived } from "./order-display";

/** Face-value USDC delivered, once per order, including partial/self purchases.
 * Premium, fees, open quotes and listing refunds are not sales volume.
 */
export async function soldTotal(orders:Order[],readTransaction:(id:string)=>Promise<Transaction|null>){
  let total=0n;
  for(const order of new Map(orders.map(order=>[order.id,order])).values()){
    if(["quoted","expired","payment_failed"].includes(order.status))continue;
    if(order.status==="completed"){total+=BigInt(order.amount);continue;}
    const id=order.escrow?`escrow:${order.id}:arc:${order.escrow.attempts?.arc??0}`:`tx:${order.id}:payout${order.payoutAttempt?`:${order.payoutAttempt}`:""}`;
    const tx=await readTransaction(id);
    if(tx&&arcOrderReceived(order,[tx]))total+=BigInt(order.amount);
  }
  return total.toString();
}
