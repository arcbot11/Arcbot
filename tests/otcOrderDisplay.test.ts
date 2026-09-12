import { expect,it } from "vitest";
import { arcOrderReceived,otcOrderStatus } from "../lib/otc/order-display";
import type { Order,Transaction } from "../lib/otc/model";
const order={id:"order:test",status:"payout_submitted",escrow:{version:2}} as Order;
const tx={chainId:5042,status:"completed",hash:"0x123",blockNumber:"100",escrowRef:{orderId:order.id,step:"arc"}} as Transaction;
it("shows received only after verified Arc delivery even when later settlement is pending",()=>{
  expect(arcOrderReceived(order,[tx])).toBe(true);
  expect(otcOrderStatus({status:order.status,received:true})).toBe("Received");
  for(const changed of [{status:"submitted"},{hash:undefined},{blockNumber:undefined},{chainId:8453},{escrowRef:{orderId:"other",step:"arc"}}]){
    expect(arcOrderReceived(order,[{...tx,...changed} as Transaction])).toBe(false);
  }
});
it.each(["payment_pending","payment_submitted","payment_finalized","payout_submitted"])("shows %s as Pending without delivery",status=>{
  expect(otcOrderStatus({status})).toBe("Pending");
});
it("retains failures and completed legacy results",()=>{
  expect(otcOrderStatus({status:"payment_failed"})).toBe("Payment failed");
  expect(otcOrderStatus({status:"payout_failed"})).toBe("Payout failed");
  expect(otcOrderStatus({status:"completed"})).toBe("Received");
});
it("distinguishes blocked settlement from active waiting without hiding verified delivery",()=>{
  const note="Settlement blocked: insufficient funds for gas.";
  expect(otcOrderStatus({status:"payment_pending",note})).toBe("Needs attention");
  expect(otcOrderStatus({status:"payout_submitted",note,received:true})).toBe("Received");
  expect(otcOrderStatus({status:"payment_submitted",note:"Pending verification"})).toBe("Pending");
});
