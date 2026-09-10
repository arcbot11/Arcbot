import { describe, it, expect } from "vitest";
import { serializeTransaction, decodeFunctionData, parseAbi } from "viem";
import { createListing, createQuote, acceptQuote, cancelListing, locked, walletId, type Store, type RecordValue, type Listing, type Order, type Wallet, type Transaction } from "../lib/otc/model";
import { bindEscrow, escrowCall, escrowTxId, prepareEscrowStep, advanceEscrowState, retryEscrow, orderSteps, type EscrowStep } from "../lib/otc/escrow-model";
import { signTransactionRecord, settled } from "../lib/otc/transactions";
const seller="0x1111111111111111111111111111111111111111",buyer="0x2222222222222222222222222222222222222222",escrow="0x3333333333333333333333333333333333333333",fee="0x4444444444444444444444444444444444444444";
const W=10n**18n,G=10n**15n,now=1800000000000;
class Memory implements Store{
  rows=new Map<string,RecordValue>();
  async get<T extends RecordValue>(id:string){return structuredClone(this.rows.get(id)??null) as T|null;}
  async put(r:RecordValue){this.rows.set(r.id,structuredClone(r));}
}
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
async function orderFor(store:Memory,listing:Listing,asset:"ETH"|"USDC"="ETH",amount="10",id="order:one"){
  const order=await createQuote(store,{id,owner:"buyer",buyer,listingId:listing.id,amount,paymentAsset:asset,ethUsdMicros:"2000000000",priceAt:now,baseGasWei:G.toString(),escrowGasBudgetWei:(3n*G).toString(),baseBalanceWei:W.toString(),baseUsdcBalance:"1000000000",baseBlock:"100",router:escrow,feeRecipient:fee},now);
  await acceptQuote(store,order.id,"buyer",{baseBalanceWei:W.toString(),baseUsdcBalance:"1000000000",baseBlock:"100",arcBalanceWei:(100n*W).toString(),arcBlock:"100"},now);
  return (await store.get<Order>(order.id))!;
}
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
    for(const step of orderSteps){await complete(store,listing,step,order,100n);if(step!=="return_gas")await advanceEscrowState(store,listing.id,order.id,now);}
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
  it.each(["ETH","USDC"] as const)("keeps partial %s fills locked until both deposits and all dispersals are verified",async asset=>{
    const {store,listing}=await funded(),order=await orderFor(store,listing,asset,"12.345678");
    await expect(escrowCall(store,listing,"arc",order)).rejects.toThrow("not verified");
    await expect(cancelListing(store,listing.id,"seller",now)).rejects.toThrow("locked");
    await expect(orderFor(store,listing,asset,"10","order:two")).rejects.toThrow("settling");
    for(const step of orderSteps){
      const call=await escrowCall(store,listing,step,order,100n);
      if(step==="gas"||step==="deposit")expect(call.from.toLowerCase()).toBe(buyer);
      if(step==="arc")expect(call.value).toBe(12345678n*10n**12n);
      if(asset==="USDC"&&step==="deposit")expect(decodeFunctionData({abi:parseAbi(["function transfer(address,uint256) returns(bool)"]),data:call.data}).args).toEqual([escrow,BigInt(order.totalWei)]);
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
    for(const step of orderSteps.slice(0,-1))await complete(store,after,step,next);
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
    const {store,listing}=await setup();await expect(retryEscrow(store,listing.id,undefined,"seller",now)).rejects.toThrow("No verified");
    await complete(store,listing,"fund",undefined,undefined,false);
    const retried=await retryEscrow(store,listing.id,undefined,"seller",now) as Listing;
    expect(escrowTxId(retried,"fund")).not.toBe(escrowTxId(listing,"fund"));
    expect((await store.get<Transaction>(escrowTxId(listing,"fund")))!.status).toBe("reverted");
  });
});
