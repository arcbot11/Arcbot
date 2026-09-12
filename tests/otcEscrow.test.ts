import { describe, it, expect } from "vitest";
import { serializeTransaction } from "viem";
import { createListing, createQuote, acceptQuote, cancelListing, locked, walletId, type Store, type RecordValue, type Listing, type Order, type Wallet, type Transaction } from "../lib/otc/model";
import { bindEscrow, escrowCall, escrowTxId, prepareEscrowStep, advanceEscrowState, retryEscrow, settlementSteps, type EscrowStep } from "../lib/otc/escrow-model";
import { signTransactionRecord, settled } from "../lib/otc/transactions";
import {escrowAccountName,legacyEscrowAccountName} from "../lib/otc/escrow-name";
import {cancelUnpaidPurchase} from "../lib/otc/cancel-purchase";
import {beginSigning} from "../lib/otc/unsigned-recovery";
const seller="0x1111111111111111111111111111111111111111",buyer="0x2222222222222222222222222222222222222222",escrow="0x3333333333333333333333333333333333333333",fee="0x4444444444444444444444444444444444444444";
const W=10n**18n,G=10n**15n,now=1800000000000;
class Memory implements Store{
  rows=new Map<string,RecordValue>();
  async get<T extends RecordValue>(id:string){return structuredClone(this.rows.get(id)??null) as T|null;}
  async put(r:RecordValue){this.rows.set(r.id,structuredClone(r));}
}
it("repairs only the legacy unprovisioned name and preserves funds and identity",async()=>{
 const store=new Memory(),id="listing:legacy";
 await createListing(store,{id,owner:"seller",seller,amount:"100",amountIncludesGas:true,escrow:{accountName:legacyEscrowAccountName(id),feeRecipient:fee},premium:"10",gasPerFillWei:G.toString(),balanceWei:(100n*W).toString(),block:"100"},now);
 const before=await store.get<Wallet>(walletId(5042,seller));
 await expect(bindEscrow(store,id,escrow,now,"forged-name")).rejects.toThrow();
 const repaired=await bindEscrow(store,id,escrow,now,escrowAccountName(id));
 expect(repaired.escrow?.accountName).toBe(escrowAccountName(id));expect(repaired.status).toBe("funding");
 expect(await store.get<Wallet>(walletId(5042,seller))).toEqual(before);
 await expect(bindEscrow(store,id,escrow,now,escrowAccountName(id))).resolves.toEqual(repaired);
 await expect(bindEscrow(store,id,buyer,now,escrowAccountName(id))).rejects.toThrow("immutable");
 await expect(bindEscrow(store,id,escrow,now,legacyEscrowAccountName(id))).rejects.toThrow();
});
async function setup(){
  const store=new Memory();
  await createListing(store,{id:"listing:escrow",owner:"seller",seller,amount:"100",amountIncludesGas:true,escrow:{accountName:"position-one",feeRecipient:fee},premium:"10",gasPerFillWei:G.toString(),balanceWei:(100n*W).toString(),block:"100"},now);
  const listing=await bindEscrow(store,"listing:escrow",escrow,now);return{store,listing};
}
async function complete(store:Memory,listing:Listing,step:EscrowStep,order?:Order,returnWei?:bigint,success=true){
  const call=await escrowCall(store,listing,step,order,returnWei);
  const unsigned=serializeTransaction({chainId:call.chainId,type:"eip1559",to:call.to,value:call.value,data:call.data,nonce:0,gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:0n});
  const tx=await prepareEscrowStep(store,{listingId:listing.id,orderId:order?.id,step,unsigned,gasWei:G.toString(),reserveWei:(call.value+G).toString(),balanceWei:(100n*W).toString(),block:"100"},now);
  await signTransactionRecord(store,tx.id,"test-raw","test-hash",now);await settled(store,tx.id,"100",success,now);return tx;
}
async function funded(){const f=await setup();await complete(f.store,f.listing,"fund");f.listing=await advanceEscrowState(f.store,f.listing.id,undefined,now) as Listing;return f;}
it("settles a self-purchase through the separate escrow, charges the fee, and unlocks once",async()=>{
 const {store,listing}=await funded();
 const quote=await createQuote(store,{id:"order:self",owner:"seller",buyer:seller,listingId:listing.id,amount:"10",ethUsdMicros:"2000000000",priceAt:now,baseGasWei:G.toString(),baseBalanceWei:(100n*W).toString(),baseBlock:"100",escrowGasBudgetWei:(3n*G).toString(),router:escrow,feeRecipient:fee},now);
 expect((await store.get<Listing>(listing.id))!.available).toBe(listing.available);
 const order=await acceptQuote(store,quote.id,"seller",{baseBalanceWei:(100n*W).toString(),baseBlock:"100",arcBalanceWei:(100n*W).toString(),arcBlock:"100"},now,true);
 expect(order.buyer).toBe(order.seller);expect(order.owner).toBe(order.sellerOwner);
 expect(order.serviceFeeBps).toBe(150);expect(BigInt(order.feeWei)).toBe((BigInt(order.sellerWei)*150n+9999n)/10000n);
 await expect(cancelListing(store,listing.id,"seller",now)).rejects.toThrow("locked");
 for(const step of settlementSteps(order)){
   const call=await escrowCall(store,listing,step,order,100n);
   expect(call.from.toLowerCase()).not.toBe(call.to.toLowerCase());
   if(step==="deposit")expect(call.from.toLowerCase()).toBe(seller);
   if(step==="arc"||step==="seller"||step==="return_gas")expect(call.to.toLowerCase()).toBe(seller);
   if(step==="fee")expect(call.to.toLowerCase()).toBe(fee);
   await complete(store,listing,step,order,100n);
   if(step!=="return_gas")await advanceEscrowState(store,listing.id,order.id,now);
 }
 await advanceEscrowState(store,listing.id,order.id,now,"500","100");
 const after=(await store.get<Listing>(listing.id))!;
 expect((await store.get<Order>(order.id))!.status).toBe("completed");
 expect(after.available).toBe((BigInt(listing.available)-10000000n).toString());expect(after.held).toBe("0");expect(after.pendingFills).toBe(0);
 expect((await store.get<Wallet>(walletId(8453,seller)))!.holds[order.id]).toBeUndefined();
 await advanceEscrowState(store,listing.id,order.id,now,"500","100");
 expect((await store.get<Listing>(listing.id))!.available).toBe(after.available);
 expect((await cancelListing(store,listing.id,"seller",now)).status).toBe("closing");
});
it("deducts a small return gas shortfall while retaining the lock until verification",async()=>{
  const {store,listing}=await funded(),closing=await cancelListing(store,listing.id,"seller",now);
  const principal=BigInt(closing.available)*10n**12n,gas=5n*G,value=principal-gas;
  const call=await escrowCall(store,closing,"return_arc",undefined,value);
  const unsigned=serializeTransaction({chainId:5042,type:"eip1559",to:call.to,value,gas:21000n,maxFeePerGas:1n});
  const tx=await prepareEscrowStep(store,{listingId:listing.id,step:"return_arc",unsigned,gasWei:gas.toString(),reserveWei:principal.toString(),balanceWei:principal.toString(),block:"100"},now);
  expect((await store.get<Listing>(listing.id))!.status).toBe("closing");
  expect(locked((await store.get<Wallet>(walletId(5042,escrow)))!)).toBe(principal);
  await signTransactionRecord(store,tx.id,"test-raw","test-hash",now);await settled(store,tx.id,"100",true,now);
  const done=await advanceEscrowState(store,listing.id,undefined,now,undefined,undefined,"0","100") as Listing;
  expect(done.escrow!.returnedWei).toBe(value.toString());expect(done.status).toBe("cancelled");
});
it("rejects a refund haircut above 0.01 USDC or unrelated to return gas",async()=>{
  const {store,listing}=await funded(),closing=await cancelListing(store,listing.id,"seller",now);
  const principal=BigInt(closing.available)*10n**12n;
  await expect(escrowCall(store,closing,"return_arc",undefined,principal-10n**16n-1n)).rejects.toThrow("gas allowance");
  const value=principal-5n*G;
  const unsigned=serializeTransaction({chainId:5042,type:"eip1559",to:seller,value,gas:21000n,maxFeePerGas:1n});
  await expect(prepareEscrowStep(store,{listingId:listing.id,step:"return_arc",unsigned,gasWei:G.toString(),reserveWei:(value+G).toString(),balanceWei:principal.toString(),block:"100"},now)).rejects.toThrow("Only return gas");
});
async function orderFor(store:Memory,listing:Listing,asset:"ETH"|"USDC"="ETH",amount="10",id="order:one"){
  const order=await createQuote(store,{id,owner:"buyer",buyer,listingId:listing.id,amount,paymentAsset:asset,ethUsdMicros:"2000000000",priceAt:now,baseGasWei:G.toString(),escrowGasBudgetWei:(3n*G).toString(),baseBalanceWei:W.toString(),baseUsdcBalance:"1000000000",baseBlock:"100",router:escrow,feeRecipient:fee},now);
  await acceptQuote(store,order.id,"buyer",{baseBalanceWei:W.toString(),baseUsdcBalance:"1000000000",baseBlock:"100",arcBalanceWei:(100n*W).toString(),arcBlock:"100"},now);
  return (await store.get<Order>(order.id))!;
}
it("cancels an accepted purchase with no deposit and restores only its reservations",async()=>{
 const {store,listing}=await funded(),order=await orderFor(store,listing);
 await cancelUnpaidPurchase(store,order.id,"buyer",now);
 expect((await store.get<Listing>(listing.id))!.available).toBe(listing.available);
 expect((await store.get<Listing>(listing.id))!.pendingFills).toBe(0);
 expect((await store.get<Wallet>(walletId(8453,buyer)))!.holds[order.id]).toBeUndefined();
 expect((await cancelUnpaidPurchase(store,order.id,"buyer",now)).status).toBe("payment_failed");
});
it.each([false,true])("cancellation and signing are mutually exclusive, signing first=%s",async signingFirst=>{
 const {store,listing}=await funded(),order=await orderFor(store,listing);
 const call=await escrowCall(store,listing,"deposit",order);
 const tx=await prepareEscrowStep(store,{listingId:listing.id,orderId:order.id,step:"deposit",unsigned:serializeTransaction({chainId:8453,type:"eip1559",to:call.to,value:call.value,data:call.data,nonce:0,gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:0n}),gasWei:G.toString(),reserveWei:(call.value+G).toString(),balanceWei:(100n*W).toString(),block:"100"},now);
 if(signingFirst){await beginSigning(store,tx.id,now);await expect(cancelUnpaidPurchase(store,order.id,"buyer",now+999999)).rejects.toThrow("signing");expect((await store.get<Listing>(listing.id))!.held).toBe(order.amount);}
 else {await cancelUnpaidPurchase(store,order.id,"seller",now);await expect(beginSigning(store,tx.id,now)).rejects.toThrow();expect((await store.get<Wallet>(walletId(8453,buyer)))!.activeTx).toBeUndefined();}
});
it("requires verified seller payment before Arc delivery for new seller-first orders",async()=>{
 const {store,listing}=await funded(),order=await orderFor(store,listing);order.escrow!.sellerFirst=true;await store.put(order);
 await complete(store,listing,"deposit",order);
 await expect(escrowCall(store,listing,"arc",order)).rejects.toThrow("preceding payout");
 await complete(store,listing,"seller",order);
 await expect(escrowCall(store,listing,"arc",order)).resolves.toMatchObject({to:buyer});
 expect(settlementSteps(order)).toEqual(["deposit","seller","arc","fee","return_gas"]);
});
it("blocks new Base USDC quotes before locking inventory",async()=>{
  const {store,listing}=await funded();
  const before=await store.get<Listing>(listing.id);
  await expect(orderFor(store,listing,"USDC")).rejects.toThrow("Unsupported Base payment asset");
  expect(await store.get<Listing>(listing.id)).toEqual(before);
});
it("new ETH orders have one combined deposit and reject a separate gas transfer",async()=>{
  const {store,listing}=await funded(),order=await orderFor(store,listing);
  expect(order.escrow?.version).toBe(2);
  expect(settlementSteps(order)).toEqual(["deposit","arc","seller","fee","return_gas"]);
  const w=(await store.get<Wallet>(walletId(8453,buyer)))!;
  expect(BigInt(w.holds[order.id])).toBe(BigInt(order.totalWei)+3n*G+G);
  await expect(escrowCall(store,listing,"gas",order)).rejects.toThrow("Invalid escrow step");
  const call=await escrowCall(store,listing,"deposit",order);
  expect(call.value).toBe(BigInt(order.totalWei)+3n*G);
});
it("existing accepted two-deposit orders keep their original amounts and steps",async()=>{
  const {store,listing}=await funded(),order=await orderFor(store,listing);
  order.escrow!.version=1;await store.put(order);
  const w=(await store.get<Wallet>(walletId(8453,buyer)))!;
  w.holds[order.id]=(BigInt(order.totalWei)+5n*G).toString();await store.put(w);
  expect(settlementSteps(order)[0]).toBe("gas");
  await complete(store,listing,"gas",order);
  expect((await escrowCall(store,listing,"deposit",order)).value).toBe(BigInt(order.totalWei));
  // Already accepted orders are idempotent even after payment options change.
  await expect(acceptQuote(store,order.id,"buyer",{baseBalanceWei:"0",baseBlock:"100",arcBalanceWei:"0",arcBlock:"100"},now)).resolves.toMatchObject({status:"payment_pending"});
});
it("repeated preparation reuses one exact deposit without reserving twice",async()=>{
 const {store,listing}=await funded(),order=await orderFor(store,listing);
 const call=await escrowCall(store,listing,"deposit",order);
 const unsigned=serializeTransaction({chainId:8453,type:"eip1559",to:call.to,value:call.value,data:call.data,nonce:1,gas:21000n,maxFeePerGas:1n});
 const input={listingId:listing.id,orderId:order.id,step:"deposit" as const,unsigned,gasWei:G.toString(),reserveWei:(call.value+G).toString(),balanceWei:W.toString(),block:"100"};
 const first=await prepareEscrowStep(store,input,now),holds=await store.get<Wallet>(walletId(8453,buyer));
 expect(await prepareEscrowStep(store,input,now+1)).toEqual(first);
 expect(await store.get<Wallet>(walletId(8453,buyer))).toEqual(holds);
 expect(await store.get(escrowTxId(listing,"gas",order))).toBeNull();
 await expect(escrowCall(store,listing,"arc",order)).rejects.toThrow("not verified");
});
describe("position CDP escrow",()=>{
  it("rejects buys below 10 and above the remaining inventory",async()=>{
    const {store,listing}=await funded();
    await expect(orderFor(store,listing,"ETH","9.999999")).rejects.toThrow("Minimum");
    await expect(orderFor(store,listing,"ETH","100")).rejects.toThrow("amount changed");
  });
  it("rejects an altered escrow recipient before reserving or signing",async()=>{
    const {store,listing}=await setup();
    const unsigned=serializeTransaction({chainId:5042,type:"eip1559",to:buyer,value:BigInt(listing.escrow!.fundingWei),gas:21000n,maxFeePerGas:1n});
    await expect(prepareEscrowStep(store,{listingId:listing.id,step:"fund",unsigned,gasWei:G.toString(),reserveWei:(100n*W).toString(),balanceWei:(100n*W).toString(),block:"100"},now)).rejects.toThrow("does not match");
    expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(100n*W);
  });
  it("closes a partial fill leaving under 10 only after settlement and returns that remainder",async()=>{
    const {store,listing}=await funded(),order=await orderFor(store,listing,"ETH","95");
    for(const step of settlementSteps(order)){await complete(store,listing,step,order,100n);if(step!=="return_gas")await advanceEscrowState(store,listing.id,order.id,now);}
    await advanceEscrowState(store,listing.id,order.id,now,"500","100");
    const closing=(await store.get<Listing>(listing.id))!;
    expect(closing.status).toBe("closing");expect(BigInt(closing.available)).toBeGreaterThan(0n);expect(BigInt(closing.available)).toBeLessThan(10000000n);
    await expect(orderFor(store,closing,"ETH","10","order:next")).rejects.toThrow("not available");
    await complete(store,closing,"return_arc",undefined,BigInt(closing.available)*10n**12n);
    await expect(advanceEscrowState(store,listing.id,undefined,now)).rejects.toThrow("balance is not verified");
    const closed=await advanceEscrowState(store,listing.id,undefined,now,undefined,undefined,"50","100") as Listing;
    expect(closed.status).toBe("filled");expect(closed.available).toBe("0");expect(closed.escrow?.gasRemainderWei).toBe("50");
    expect((await store.get<Wallet>(walletId(5042,escrow)))!.holds[`gas-credit:${listing.id}`]).toBe("50");
  });
  it("does not list unfunded positions and releases the seller wallet hold only after transfer",async()=>{
    const {store,listing}=await setup();expect(listing.status).toBe("funding");
    expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(100n*W);
    expect((await advanceEscrowState(store,listing.id,undefined,now)).status).toBe("funding");
    await expect(orderFor(store,listing)).rejects.toThrow("not available");
    await complete(store,listing,"fund");await advanceEscrowState(store,listing.id,undefined,now);
    expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(0n);
    expect(locked((await store.get<Wallet>(walletId(5042,escrow)))!)).toBe(99999n*10n**15n);
  });
  it("binds one separate wallet permanently",async()=>{
    const {store,listing}=await setup();await expect(bindEscrow(store,listing.id,seller,now)).rejects.toThrow("separate");
    await expect(bindEscrow(store,listing.id,buyer,now)).rejects.toThrow("immutable");
  });
  it("allows cancelling before funding begins but not after a verified deposit",async()=>{
    const first=await setup();
    expect((await cancelListing(first.store,first.listing.id,"seller",now)).status).toBe("cancelled");
    expect(locked((await first.store.get<Wallet>(walletId(5042,seller)))!)).toBe(0n);
    const second=await setup();await complete(second.store,second.listing,"fund");
    await expect(cancelListing(second.store,second.listing.id,"seller",now)).rejects.toThrow("funding transaction");
  });
  it.each(["ETH"] as const)("keeps partial %s fills locked until the combined deposit and all dispersals are verified",async asset=>{
    const {store,listing}=await funded(),order=await orderFor(store,listing,asset,"12.345678");
    expect(order.serviceFeeBps).toBe(150);
    expect(BigInt(order.feeWei)).toBe((BigInt(order.sellerWei)*150n+9999n)/10000n);
    expect(BigInt(order.totalWei)).toBe(BigInt(order.sellerWei)+BigInt(order.feeWei));
    await expect(escrowCall(store,listing,"arc",order)).rejects.toThrow("not verified");
    await expect(cancelListing(store,listing.id,"seller",now)).rejects.toThrow("locked");
    await expect(orderFor(store,listing,asset,"10","order:two")).rejects.toThrow("settling");
    for(const step of settlementSteps(order)){
      const call=await escrowCall(store,listing,step,order,100n);
      if(step==="deposit"){expect(call.from.toLowerCase()).toBe(buyer);expect(call.value).toBe(BigInt(order.totalWei)+BigInt(order.escrow!.gasBudgetWei));}
      if(step==="arc")expect(call.value).toBe(12345678n*10n**12n);
      if(step==="fee"&&asset==="ETH"){expect(call.to.toLowerCase()).toBe(fee);expect(call.value).toBe(BigInt(order.feeWei));}

      await complete(store,listing,step,order,100n);
      if(step!=="return_gas")await advanceEscrowState(store,listing.id,order.id,now);
    }
    await advanceEscrowState(store,listing.id,order.id,now,"500","100");
    const after=(await store.get<Listing>(listing.id))!;
    expect(after.available).toBe((BigInt(listing.available)-12345678n).toString());expect(after.pendingFills).toBe(0);expect(after.held).toBe("0");
    expect((await store.get<Order>(order.id))!.status).toBe("completed");
    expect((await store.get<Wallet>(walletId(8453,escrow)))!.holds[`gas-credit:${order.id}`]).toBe("500");
    await advanceEscrowState(store,listing.id,order.id,now,"500","100");
    expect((await store.get<Listing>(listing.id))!.available).toBe(after.available);
    const next=await orderFor(store,after,asset,"10","order:two");
    for(const step of settlementSteps(next).slice(0,-1))await complete(store,after,step,next);
    const call=await escrowCall(store,after,"return_gas",next,501n);
    const unsigned=serializeTransaction({chainId:8453,type:"eip1559",to:call.to,value:call.value,gas:21000n,maxFeePerGas:1n});
    // The second buyer cannot sweep even one wei from the first buyer's credit.
    await expect(prepareEscrowStep(store,{listingId:after.id,orderId:next.id,step:"return_gas",unsigned,gasWei:G.toString(),reserveWei:(501n+G).toString(),balanceWei:(G+1000n).toString(),block:"100"},now)).rejects.toThrow("existing reservations");
  });
  it("keeps principal in escrow during cancellation until its return is finalized",async()=>{
    const {store,listing}=await funded();const closing=await cancelListing(store,listing.id,"seller",now);
    expect(closing.status).toBe("closing");expect(closing.available).toBe(listing.available);
    await expect(escrowCall(store,closing,"return_arc",undefined,1n)).rejects.toThrow("principal");
    await complete(store,closing,"return_arc",undefined,BigInt(listing.available)*10n**12n);
    const final=await advanceEscrowState(store,listing.id,undefined,now,undefined,undefined,"50","100") as Listing;
    expect(final.status).toBe("cancelled");expect(final.escrow?.returnedWei).toBe((BigInt(listing.available)*10n**12n).toString());
  });
  it("never retries uncertain transactions, but can retry a verified revert",async()=>{
    const {store,listing}=await setup();await retryEscrow(store,listing.id,undefined,"seller",now);
    await complete(store,listing,"fund",undefined,undefined,false);
    const retried=await retryEscrow(store,listing.id,undefined,"seller",now) as Listing;
    expect(escrowTxId(retried,"fund")).not.toBe(escrowTxId(listing,"fund"));
    expect((await store.get<Transaction>(escrowTxId(listing,"fund")))!.status).toBe("reverted");
  });
});

it("a verified reverted combined deposit releases the listing and buyer holds exactly once",async()=>{
 const {store,listing}=await funded(),order=await orderFor(store,listing);
 const original=listing.available;
 await complete(store,listing,"deposit",order,undefined,false);
 expect(await store.get<Order>(order.id)).toMatchObject({status:"payment_failed"});
 expect(await store.get<Listing>(listing.id)).toMatchObject({available:original,held:"0",pendingFills:0});
 expect((await store.get<Listing>(listing.id))!.escrow!.settlementOrderId).toBeUndefined();
 expect(locked((await store.get<Wallet>(walletId(8453,buyer)))!)).toBe(0n);
 const tx=(await store.get<Transaction>(escrowTxId(listing,"deposit",order)))!;
 await settled(store,tx.id,"100",false,now+1);
 expect((await store.get<Listing>(listing.id))!.available).toBe(original);
 await expect(orderFor(store,listing,"ETH","10","order:after-failure")).resolves.toMatchObject({status:"payment_pending"});
});
it("Arc payout failure after a successful deposit retains listing protection",async()=>{
 const {store,listing}=await funded(),order=await orderFor(store,listing);
 await complete(store,listing,"deposit",order);
 await complete(store,listing,"arc",order,undefined,false);
 expect(await store.get<Listing>(listing.id)).toMatchObject({held:order.amount,pendingFills:1});
 await expect(cancelListing(store,listing.id,"seller",now)).rejects.toThrow("locked");
});
