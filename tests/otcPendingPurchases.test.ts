import { expect, it } from "vitest";
import { pendingPurchases } from "../lib/otc/pending-purchases";
import type { Order, RecordValue } from "../lib/otc/model";
const wallet="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const order=(id:string,status:Order["status"],other:Partial<Order>={}):Order=>({kind:"order",id,owner:"x:1",buyer:wallet,status,createdAt:1,...other} as Order);
it("restores accepted purchases only for the authenticated owner and wallet",()=>{
  const records:RecordValue[]=[order("pending","payment_pending"),order("submitted","payout_submitted",{createdAt:2}),order("quote","quoted"),order("done","completed"),order("expired","expired"),order("failed","payment_failed"),order("otherOwner","payment_pending",{owner:"x:2"}),order("otherWallet","payment_pending",{buyer:"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"})];
  expect(pendingPurchases(records,"x:1",wallet.toUpperCase()).map(o=>o.id)).toEqual(["submitted","pending"]);
  expect(pendingPurchases(records,"tg:1",wallet)).toEqual([]);
});
it("retains recoverable payout failures for progress tracking",()=>{
  expect(pendingPurchases([order("retry","payout_failed")],"x:1",wallet)).toHaveLength(1);
});
