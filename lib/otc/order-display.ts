import type { Order, Transaction } from "./model";

export function arcOrderReceived(order:Order,transactions:Transaction[]){
  return order.status==="completed"||transactions.some(tx=>
    tx.chainId===5042&&tx.status==="completed"&&!!tx.hash&&!!tx.blockNumber&&
    (order.escrow?tx.escrowRef?.orderId===order.id&&tx.escrowRef.step==="arc":tx.orderId===order.id&&tx.leg==="payout"));
}
export function otcOrderStatus(order:{status:string;received?:boolean;note?:string}){
  if(order.received||order.status==="completed")return "Received";
  if(order.status==="payment_failed")return "Payment failed";
  if(order.status==="payout_failed")return "Payout failed";
  if(order.note&&/Settlement (?:blocked|paused)|Transaction needs wallet recovery/i.test(order.note))return "Needs attention";
  return "Pending";
}
