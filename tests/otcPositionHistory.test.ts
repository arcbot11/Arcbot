import { expect,it } from "vitest";
import { positionHistory } from "../lib/otc/position-history";
import type { Listing,Order,Transaction } from "../lib/otc/model";
const listing={id:"listing:test",status:"active",available:"4993763",held:"10000000",pendingFills:1,escrow:{version:1}} as Listing;
const order={id:"order:test",listingId:listing.id,status:"payout_submitted",amount:"10000000",sellerWei:"123",paymentAsset:"ETH",escrow:{version:2}} as Order;
const tx={chainId:5042,status:"completed",hash:"hash",blockNumber:"100",escrowRef:{orderId:order.id,step:"arc"}} as Transaction;
it.each(["active","closing","filled","cancelled"] as const)("hides legacy setup notes on %s listings without changing stored data",status=>{
  const note="Escrow wallet setup is pending. Listing funds remain reserved in your wallet.";
  const record={...listing,status,escrow:{...listing.escrow!,note}};
  expect(positionHistory(record,[]).escrow?.note).toBeUndefined();
  expect(record.escrow.note).toBe(note);
});
it("preserves pending setup and actionable recovery messages",()=>{
  const note="Escrow wallet setup is pending. Listing funds remain reserved in your wallet.";
  expect(positionHistory({...listing,status:"funding",escrow:{...listing.escrow!,note}},[]).escrow?.note).toBe(note);
  const recovery="Add Arc USDC for payout gas.";
  expect(positionHistory({...listing,escrow:{...listing.escrow!,note:recovery}},[]).escrow?.note).toBe(recovery);
});
it("counts delivered USDC while the settlement lock remains and schedules dust closure",()=>{
  expect(positionHistory(listing,[order],undefined,[tx])).toMatchObject({sold:"10000000",pendingDelivery:"0",receivedEthWei:"0",closingAfterSettlement:true,settlementLocked:true,canCancel:false,returnedUsdc:null});
});
it("does not count submitted payouts or payments as sold",()=>{
  expect(positionHistory(listing,[{...order,sellerPaymentHash:"hash"}],undefined,[{...tx,status:"submitted"}])).toMatchObject({sold:"0",pendingDelivery:"10000000",receivedEthWei:"123",closingAfterSettlement:false});
});
it("does not double count completed delivery or close inventory above the minimum",()=>{
  expect(positionHistory({...listing,available:"29993196",held:"0",pendingFills:0},[{...order,status:"completed"}],undefined,[tx])).toMatchObject({sold:"10000000",pendingDelivery:"0",closingAfterSettlement:false});
});
