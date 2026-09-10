import { describe,it,expect,vi,afterEach } from "vitest";
import { type Store,type RecordValue,type Listing,type Order,type Wallet,type Transaction,createListing,createQuote,acceptQuote,cancelListing,finishOrder,locked,walletId,price,premium,usdc,marketStats } from "../lib/otc/model";
import { prepareTransaction,signTransactionRecord,submitted,settled,paymentCall,payoutCall } from "../lib/otc/transactions";
import { assertOutsideOtcWallet } from "../lib/otc/spend-guard";
import { verifyRaw } from "../lib/otc/runtime";
import { privateKeyToAccount } from "viem/accounts";
import { serializeTransaction,type Hex } from "viem";
import { encodeFunctionData } from "viem";
import { ARC_USDC } from "../lib/arc/config";
import { nativeSpend } from "../lib/otc/native-spend";
import { positionHistory } from "../lib/otc/position-history";
import { transferAbi } from "../lib/otc/token-delivery";

const seller="0x1111111111111111111111111111111111111111",buyer="0x2222222222222222222222222222222222222222";
const now=1_800_000_000_000, W=10n**18n, gas=10n**15n;
class Memory implements Store {
  rows=new Map<string,RecordValue>();
  async get<T extends RecordValue>(id:string){return structuredClone(this.rows.get(id)??null) as T|null;}
  async put(r:RecordValue){this.rows.set(r.id,structuredClone(r));}
  tail=Promise.resolve();
  atomic<T>(fn:()=>Promise<T>){const result=this.tail.then(async()=>{const backup=structuredClone(this.rows);try{return await fn();}catch(e){this.rows=backup;throw e;}});this.tail=result.then(()=>{},()=>{});return result;}
}
const listingInput=(extra={})=>({id:"listing:1",owner:"seller",seller,amount:"50",premium:"10",gasPerFillWei:gas.toString(),balanceWei:(100n*W).toString(),block:"100",...extra});
const quoteInput=(extra={})=>({id:"order:1",owner:"buyer",buyer,listingId:"listing:1",amount:"10",ethUsdMicros:"2000000000",priceAt:now,baseGasWei:gas.toString(),baseBalanceWei:W.toString(),baseBlock:"100",router:"0x3333333333333333333333333333333333333333",feeRecipient:"0x4444444444444444444444444444444444444444",...extra});
const snapshot={baseBalanceWei:W.toString(),baseBlock:"100",arcBalanceWei:(100n*W).toString(),arcBlock:"100"};
async function fixture(){const store=new Memory();await createListing(store,listingInput(),now);const order=await createQuote(store,quoteInput(),now);return{store,order};}
async function accept(store:Memory){return store.atomic(()=>acceptQuote(store,"order:1","buyer",snapshot,now));}
async function leg(store:Memory,which:"payment"|"payout"){
  const o=(await store.get<Order>("order:1"))!,payment=which==="payment";
  const tx=await store.atomic(()=>prepareTransaction(store,{id:`tx:${which}`,owner:payment?"buyer":"seller",wallet:payment?buyer:seller,chainId:payment?8453:5042,leg:which,orderId:o.id,unsigned:"test-unsigned",
    reserveWei:payment?(BigInt(o.totalWei)+gas).toString():(10n*W+gas).toString(),balanceWei:(100n*W).toString(),block:"100"},now));
  await signTransactionRecord(store,tx.id,"test-raw","test-hash",now);await submitted(store,tx.id,now);return tx;
}
afterEach(()=>vi.unstubAllEnvs());
describe("OTC exact pricing",()=>{
  it("applies premium first, then a 1% fee",()=>{
    expect(price(usdc("10"),premium("10"),2_000_000_000n)).toEqual({sellerWei:"5500000000000000",feeWei:"55000000000000",totalWei:"5555000000000000"});
  });
  it("allows 10,000%, with a 101x seller price",()=>{
    expect(BigInt(price(usdc("10"),premium("10000"),2_000_000_000n).sellerWei)).toBe(505000000000000000n);
    expect(()=>premium("10000.01")).toThrow();expect(()=>premium("-1")).toThrow();expect(()=>premium("1e3")).toThrow();
  });
  it("rejects subminimum and excess precision instead of rounding",()=>{
    for(const value of ["9.999999","10.0000001","1e2","-10","NaN"])expect(()=>usdc(value)).toThrow();
    expect(usdc("10.000001")).toBe(10_000_001n);
  });
  it("rounds ETH upwards and preserves the exact USDC output",()=>{
    const p=price(10_000_001n,123,3_123_456_789n);expect(BigInt(p.feeWei)).toBe((BigInt(p.sellerWei)+99n)/100n);
    expect(BigInt(p.totalWei)).toBe(BigInt(p.sellerWei)+BigInt(p.feeWei));
  });
});
describe("OTC reservations",()=>{
  it.each(["send", "burn", "buy", "sell", "swap"])("blocks %s from spending listed USDC, while allowing unreserved funds",async(operation)=>{
    const s=new Memory();await createListing(s,listingInput(),now);
    const leg=operation==="send"||operation==="burn"?"send":"swap";
    const spend=(amount:bigint)=>s.atomic(()=>prepareTransaction(s,{id:`${operation}:${amount}`,owner:"seller",wallet:seller,chainId:5042,leg,unsigned:"x",reserveWei:(amount+gas).toString(),balanceWei:(100n*W).toString(),block:"100"},now));
    await expect(spend(50n*W)).rejects.toThrow("reservations");
    await spend(10n*W);
    expect((await s.get<Wallet>(walletId(5042,seller)))!.holds["listing:1"]).toBe((50n*W+5n*gas).toString());
  });
  it("shares the same lock across native sends and ERC-20 USDC sends or burns",async()=>{
    for(const recipient of [buyer,"0x000000000000000000000000000000000000dead"] as const){
      const s=new Memory();await createListing(s,listingInput(),now);
      const data=encodeFunctionData({abi:transferAbi,functionName:"transfer",args:[recipient,50_000_000n]});
      const amount=nativeSpend(5042,{to:ARC_USDC,value:0n,data});
      expect(amount).toBe(50n*W);
      await expect(s.atomic(()=>prepareTransaction(s,{id:"erc20:send",owner:"seller",wallet:seller,chainId:5042,leg:"send",unsigned:"x",reserveWei:(amount+gas).toString(),balanceWei:(100n*W).toString(),block:"100"},now))).rejects.toThrow("reservations");
      expect(nativeSpend(8453,{to:ARC_USDC,value:0n,data})).toBe(0n);
      expect(nativeSpend(5042,{to:buyer,value:50n*W,data:"0x"})).toBe(amount);
    }
  });
  it("serializes listing creation against spending the same funds in either order",async()=>{
    for(const listingFirst of [true,false]){
      const s=new Memory();
      const list=()=>s.atomic(()=>createListing(s,listingInput({amount:"60"}),now));
      const send=()=>s.atomic(()=>prepareTransaction(s,{id:"send:race",owner:"seller",wallet:seller,chainId:5042,leg:"send",unsigned:"x",reserveWei:(60n*W+gas).toString(),balanceWei:(100n*W).toString(),block:"100"},now));
      const results=await Promise.allSettled((listingFirst?[list,send]:[send,list]).map(fn=>fn()));
      expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      expect(locked((await s.get<Wallet>(walletId(5042,seller)))!)).toBeLessThanOrEqual(100n*W);
    }
  });
  it("does not let an unfunded buyer reserve listing inventory",async()=>{
    const s=new Memory();await createListing(s,listingInput(),now);
    await expect(createQuote(s,quoteInput({baseBalanceWei:"0"}),now)).rejects.toThrow("Base ETH");
    expect((await s.get<Listing>("listing:1"))?.available).toBe("50000000");
  });
  it("rejects a $10 listing funded with exactly $10",async()=>{
    const s=new Memory();await expect(createListing(s,listingInput({amount:"10",balanceWei:(10n*W).toString()}),now)).rejects.toThrow("gas on top of 10");expect(s.rows.size).toBe(0);
  });
  it("reserves gas for every possible minimum fill",async()=>{
    const s=new Memory();await createListing(s,listingInput(),now);expect(locked((await s.get<Wallet>(walletId(5042,seller)))!)).toBe(50n*W+5n*gas);
  });
  it("serializes concurrent listings against the same balance",async()=>{
    const s=new Memory();const results=await Promise.allSettled([1,2].map(i=>s.atomic(()=>createListing(s,listingInput({id:`listing:${i}`,amount:"60"}),now))));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  });
  it("does not oversell concurrent partial fills",async()=>{
    const s=new Memory();await createListing(s,listingInput({amount:"15"}),now);
    const results=await Promise.allSettled([1,2].map(i=>s.atomic(()=>createQuote(s,quoteInput({id:`order:${i}`}),now))));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((await s.get<Listing>("listing:1"))?.held).toBe("10000000");
  });
  it("retains refundable inventory and all potential fill gas until quote expiry",async()=>{
    const s=new Memory();await createListing(s,listingInput({amount:"25"}),now);
    const order=await createQuote(s,quoteInput({amount:"20"}),now);
    expect(locked((await s.get<Wallet>(walletId(5042,seller)))!)).toBe(25n*W+2n*gas);
    await finishOrder(s,order,"expired",now+30_000);
    expect((await s.get<Listing>("listing:1"))?.available).toBe("25000000");
    expect(locked((await s.get<Wallet>(walletId(5042,seller)))!)).toBe(25n*W+2n*gas);
  });
  it("rejects a self trade",async()=>{const s=new Memory();await createListing(s,listingInput(),now);await expect(createQuote(s,quoteInput({buyer:seller}),now)).rejects.toThrow("own listing");});
  it("rejects stale prices and insufficient Base ETH including gas",async()=>{
    const{store}=await fixture();await expect(createQuote(store,quoteInput({id:"order:2",priceAt:now-30_001}),now)).rejects.toThrow("expired");
    await expect(store.atomic(()=>acceptQuote(store,"order:1","buyer",{...snapshot,baseBalanceWei:"5555000000000000"},now))).rejects.toThrow("including gas");
    expect((await store.get<Order>("order:1"))?.status).toBe("quoted");
  });
  it("rejects an expired quote and an incorrect owner",async()=>{
    const{store}=await fixture();await expect(acceptQuote(store,"order:1","other",snapshot,now)).rejects.toThrow("not found");
    await expect(acceptQuote(store,"order:1","buyer",snapshot,now+30_000)).rejects.toThrow("expired");
  });
  it("checks the seller's reserved USDC again before taking payment",async()=>{
    const{store}=await fixture();await expect(acceptQuote(store,"order:1","buyer",{...snapshot,arcBalanceWei:"1"},now)).rejects.toThrow("Seller balance");
  });
  it("cancel is blocked throughout settlement, preserving all listing funds",async()=>{
    const{store}=await fixture();await accept(store);await expect(cancelListing(store,"listing:1","seller",now)).rejects.toThrow("locked");
    const listing=(await store.get<Listing>("listing:1"))!;expect(listing.available).toBe("40000000");expect(listing.held).toBe("10000000");
    expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(50n*W+5n*gas);
    await expect(finishOrder(store,(await store.get<Order>("order:1"))!,"expired",now+60_000)).rejects.toThrow();
  });
  it("allows spending other funds, but never the reserved USDC",async()=>{
    const{store}=await fixture();
    await expect(store.atomic(()=>prepareTransaction(store,{id:"send:bad",owner:"seller",wallet:seller,chainId:5042,leg:"send",unsigned:"x",reserveWei:(51n*W).toString(),balanceWei:(100n*W).toString(),block:"100"},now))).rejects.toThrow("reservations");
    await store.atomic(()=>prepareTransaction(store,{id:"send:ok",owner:"seller",wallet:seller,chainId:5042,leg:"send",unsigned:"x",reserveWei:W.toString(),balanceWei:(100n*W).toString(),block:"100"},now));
    expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(51n*W+5n*gas);
    await expect(createListing(store,listingInput({id:"listing:another",amount:"10"}),now)).rejects.toThrow("pending");
  });
  it("gives amount-weighted comparison statistics",async()=>{
    const s=new Memory();const a=await createListing(s,listingInput({amount:"10",premium:"10"}),now);
    const b=await createListing(s,listingInput({id:"listing:2",amount:"30",premium:"20"}),now);
    expect(marketStats([a,b])).toMatchObject({lowestBps:1000,averageBps:1750,available:"40000000"});
    expect(marketStats([]).averageBps).toBe(null);
  });
});
describe("OTC durable settlement",()=>{
  it("blocks alternate executors when reservation storage is missing, even with OTC disabled",async()=>{
    vi.stubEnv("OTC_ENABLED","false");vi.stubEnv("OTC_SERVICE_SECRET","");
    await expect(assertOutsideOtcWallet(seller,5042)).rejects.toThrow("storage is not configured");
    await expect(assertOutsideOtcWallet(buyer,8453)).rejects.toThrow("storage is not configured");
  });
  it("cannot prepare a payout before verified Base payment",async()=>{const{store}=await fixture();await accept(store);await expect(leg(store,"payout")).rejects.toThrow("not authorized");});
  it("deduplicates acceptance and prepared transactions",async()=>{
    const{store}=await fixture();await accept(store);await accept(store);const o=(await store.get<Order>("order:1"))!;
    expect(locked((await store.get<Wallet>(walletId(8453,buyer)))!)).toBe(BigInt(o.totalWei)+gas);
    await leg(store,"payment");expect((await store.get<Wallet>(walletId(8453,buyer)))?.activeTx).toBe("tx:payment");
  });
  it("completes both legs exactly once and updates remaining inventory",async()=>{
    const{store,order}=await fixture();await accept(store);const payment=await leg(store,"payment");
    expect(payoutCall(order).value).toBe(10n*W);expect(paymentCall(order).value).toBe(BigInt(order.totalWei));
    await store.atomic(()=>settled(store,payment.id,"101",true,now));
    expect((await store.get<Order>(order.id))?.status).toBe("payment_finalized");
    await leg(store,"payout");await store.atomic(()=>settled(store,"tx:payout","102",true,now));await settled(store,"tx:payout","102",true,now);
    expect((await store.get<Order>(order.id))?.status).toBe("completed");
    expect((await store.get<Listing>("listing:1"))?.available).toBe("40000000");
    expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(40n*W+4n*gas);
  });
  it("restores inventory after a verified reverted Base payment",async()=>{
    const{store}=await fixture();await accept(store);await leg(store,"payment");await store.atomic(()=>settled(store,"tx:payment","101",false,now));
    expect((await store.get<Order>("order:1"))?.status).toBe("payment_failed");expect((await store.get<Listing>("listing:1"))?.available).toBe("50000000");
    expect(locked((await store.get<Wallet>(walletId(8453,buyer)))!)).toBe(0n);
  });
  it("keeps funds locked if Arc reverts after Base payment",async()=>{
    const{store}=await fixture();await accept(store);await leg(store,"payment");await settled(store,"tx:payment","101",true,now);await leg(store,"payout");await settled(store,"tx:payout","102",false,now);
    expect((await store.get<Order>("order:1"))?.status).toBe("payout_failed");expect((await store.get<Listing>("listing:1"))?.held).toBe("10000000");
    expect((await store.get<Wallet>(walletId(5042,seller)))?.holds["listing:1"]).toBeDefined();
  });
  it("never replaces a persisted signature",async()=>{
    const{store}=await fixture();await accept(store);await leg(store,"payment");await expect(signTransactionRecord(store,"tx:payment","different","hash",now)).rejects.toThrow("immutable");
    await expect(submitted(store,"no-job",now)).rejects.toThrow("Persist");
  });
  it("blocks old execution paths while website reservations are enabled",async()=>{vi.stubEnv("OTC_ENABLED","true");await expect(assertOutsideOtcWallet(seller,5042)).rejects.toThrow("website");await expect(assertOutsideOtcWallet(buyer,8453)).rejects.toThrow("website");});
  it("rejects a signer changing chain, recipient or value",async()=>{
    const account=privateKeyToAccount(`0x${"1".padStart(64,"0")}` as Hex);
    const tx={chainId:8453,type:"eip1559" as const,to:seller as `0x${string}`,value:1n,nonce:0,gas:21000n,maxFeePerGas:100n,maxPriorityFeePerGas:1n};
    const unsigned=serializeTransaction(tx),raw=await account.signTransaction(tx);
    await expect(verifyRaw(raw,unsigned,account.address)).resolves.toMatch(/^0x/);
    for(const changed of [{...tx,chainId:5042},{...tx,to:buyer as Hex},{...tx,value:2n}])await expect(verifyRaw(await account.signTransaction(changed),unsigned,account.address)).rejects.toThrow("different");
  });
});

describe("OTC position closure and history",()=>{
 it("returns dust and gas only after finalized payout and preserves sale proceeds",async()=>{
  const store=new Memory();await createListing(store,listingInput({amount:"15"}),now);await createQuote(store,quoteInput(),now);await accept(store);
  await leg(store,"payment");await settled(store,"tx:payment","101",true,now);
  await expect(cancelListing(store,"listing:1","seller",now)).rejects.toThrow("locked");
  await leg(store,"payout");expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(15n*W+gas);
  await settled(store,"tx:payout","102",true,now);
  const listing=(await store.get<Listing>("listing:1"))!,order=(await store.get<Order>("order:1"))!;
  expect(listing.status).toBe("filled");expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(0n);
  expect(positionHistory(listing,[order])).toMatchObject({sold:"10000000",returnedUsdc:"5000000",receivedEthWei:order.sellerWei,settlementLocked:false});
 });
 it("cancels an idle position and releases its principal and gas exactly once",async()=>{
  const s=new Memory();await createListing(s,listingInput(),now);const l=await cancelListing(s,"listing:1","seller",now);await cancelListing(s,l.id,"seller",now);
  expect(locked((await s.get<Wallet>(walletId(5042,seller)))!)).toBe(0n);expect(positionHistory(l,[])).toMatchObject({sold:"0",returnedUsdc:"50000000",canCancel:false});
 });
 it("blocks cancellation during a quoted fill and allows it after expiry",async()=>{
  const {store,order}=await fixture();await expect(cancelListing(store,"listing:1","seller",now)).rejects.toThrow("locked");await finishOrder(store,order,"expired",now+60000);await cancelListing(store,"listing:1","seller",now+60000);expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(0n);
 });
 it("retains dust and the settlement lock after payout failure",async()=>{
  const store=new Memory();await createListing(store,listingInput({amount:"15"}),now);await createQuote(store,quoteInput(),now);await accept(store);await leg(store,"payment");await settled(store,"tx:payment","101",true,now);await leg(store,"payout");await settled(store,"tx:payout","102",false,now);
  await expect(cancelListing(store,"listing:1","seller",now)).rejects.toThrow("locked");const l=(await store.get<Listing>("listing:1"))!,o=(await store.get<Order>("order:1"))!;
  expect(positionHistory(l,[o])).toMatchObject({sold:"0",returnedUsdc:null,settlementLocked:true,receivedEthWei:o.sellerWei});expect(locked((await store.get<Wallet>(walletId(5042,seller)))!)).toBe(15n*W+gas);
 });
});
