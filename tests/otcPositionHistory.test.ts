import { expect,it } from "vitest";
import { positionHistory } from "../lib/otc/position-history";
import type { Listing,Order,Transaction } from "../lib/otc/model";
const listing={id:"listing:test",status:"active",available:"4993763",held:"10000000",pendingFills:1,escrow:{version:1}} as Listing;
const order={id:"order:test",listingId:listing.id,status:"payout_submitted",amount:"10000000",sellerWei:"123",paymentAsset:"ETH",escrow:{version:2}} as Order;
const tx={chainId:5042,status:"completed",hash:"hash",blockNumber:"100",escrowRef:{orderId:order.id,step:"arc"}} as Transaction;
it("counts delivered USDC while the settlement lock remains and schedules dust closure",()=>{
  expect(positionHistory(listing,[order],undefined,[tx])).toMatchObject({sold:"10000000",pendingDelivery:"0",receivedEthWei:"0",closingAfterSettlement:true,settlementLocked:true,canCancel:false,returnedUsdc:null});
});
it("does not count submitted payouts or payments as sold",()=>{
  expect(positionHistory(listing,[{...order,sellerPaymentHash:"hash"}],undefined,[{...tx,status:"submitted"}])).toMatchObject({sold:"0",pendingDelivery:"10000000",receivedEthWei:"123",closingAfterSettlement:false});
});
it("does not double count completed delivery or close inventory above the minimum",()=>{
  expect(positionHistory({...listing,available:"29993196",held:"0",pendingFills:0},[{...order,status:"completed"}],undefined,[tx])).toMatchObject({sold:"10000000",pendingDelivery:"0",closingAfterSettlement:false});
});
