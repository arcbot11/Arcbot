import {describe,it,expect} from "vitest";
import {decodeFunctionData} from "viem";
import {BASE_USDC,baseUsdcAbi} from "../lib/base/usdc";
import {type Store,type RecordValue,type Wallet,type Order,type Listing,createListing,createQuote,acceptQuote,locked,lockedBaseUsdc,walletId,usdcPrice,finishOrder} from "../lib/otc/model";
import {approvalCall,paymentCall,PAYMENT_ABI,prepareTransaction,signTransactionRecord,submitted,settled} from "../lib/otc/transactions";
const seller="0x1111111111111111111111111111111111111111",buyer="0x2222222222222222222222222222222222222222",router="0x3333333333333333333333333333333333333333",fee="0x4444444444444444444444444444444444444444";
const now=1800000000000;
class Memory implements Store {
 rows=new Map<string,RecordValue>();
 async get<T extends RecordValue>(id:string){return structuredClone(this.rows.get(id)??null) as T|null;}
 async put(r:RecordValue){this.rows.set(r.id,structuredClone(r));}
}
const input={id:"order:usdc",owner:"buyer",buyer,listingId:"listing:usdc",amount:"10",ethUsdMicros:"1000000",priceAt:now,baseGasWei:"100",approvalGasWei:"100",baseBalanceWei:"200",baseUsdcBalance:"11110000",baseBlock:"100",router,feeRecipient:fee,paymentAsset:"USDC" as const};
const snapshot={baseBalanceWei:"200",baseBlock:"100",baseUsdcBalance:"11110000",arcBalanceWei:(100n*10n**18n).toString(),arcBlock:"100"};
async function fixture(){const s=new Memory();await createListing(s,{id:"listing:usdc",owner:"seller",seller,amount:"50",premium:"10",gasPerFillWei:"100",balanceWei:snapshot.arcBalanceWei,block:"100"},now);return s;}
// Recorded, already accepted legacy order; new USDC orders are disabled.
async function accepted(){
 const s=await fixture(),listing=(await s.get<Listing>(input.listingId))!;
 listing.available="40000000";listing.held="10000000";listing.pendingFills=1;await s.put(listing);
 await s.put({kind:"order",id:input.id,owner:"buyer",buyer,seller,sellerOwner:"seller",listingId:listing.id,paymentAsset:"USDC",approvalGasWei:"100",amount:"10000000",premiumBps:1000,ethUsdMicros:"1000000",priceAt:now,sellerWei:"11000000",feeWei:"110000",totalWei:"11110000",baseGasWei:"100",arcGasWei:"100",router,feeRecipient:fee,expiresAt:now+30000,status:"payment_pending",createdAt:now,updatedAt:now});
 await s.put({kind:"wallet",id:walletId(8453,buyer),owner:"buyer",address:buyer,chainId:8453,holds:{[input.id]:"200"},usdcHolds:{[input.id]:"11110000"},updatedAt:now});
 return s;
}
async function leg(s:Memory,kind:"approval"|"payment",success=true){const o=(await s.get<Order>(input.id))!;const id=`tx:${kind}`;await prepareTransaction(s,{id,owner:"buyer",wallet:buyer,chainId:8453,leg:kind,orderId:o.id,unsigned:"unsigned",reserveWei:"100",balanceWei:kind==="approval"?"200":"100",block:kind==="approval"?"100":"101"},now);await signTransactionRecord(s,id,"raw","hash",now);await submitted(s,id,now);await settled(s,id,kind==="approval"?"101":"102",success,now);}
describe("Base USDC OTC",()=>{
 it("prices six-decimal USDC with premium then 1% fee",()=>{expect(usdcPrice(10000000n,1000)).toEqual({sellerWei:"11000000",feeWei:"110000",totalWei:"11110000"});expect(usdcPrice(10000000n,1000000).sellerWei).toBe("1010000000");expect(usdcPrice(10000001n,1)).toEqual({sellerWei:"10001002",feeWei:"100011",totalWei:"10101013"});});
 it("rejects invalid premiums",()=>{expect(()=>usdcPrice(10000000n,-1)).toThrow();expect(()=>usdcPrice(10000000n,1000001)).toThrow();});
 it("rejects new USDC orders regardless of balances",async()=>{const s=await fixture();await expect(createQuote(s,input,now)).rejects.toThrow("Unsupported Base payment asset");});
 it("reserves exact USDC and two gas allowances",async()=>{const s=await accepted();const w=(await s.get<Wallet>(walletId(8453,buyer)))!;expect(locked(w)).toBe(200n);expect(lockedBaseUsdc(w)).toBe(11110000n);});
 it("blocks acceptance of previously quoted USDC orders",async()=>{const s=await accepted(),o=(await s.get<Order>(input.id))!;o.status="quoted";await s.put(o);await expect(acceptQuote(s,o.id,"buyer",snapshot,now)).rejects.toThrow("new ETH quote");});
 it("does not accept a duplicate legacy order or change its holds",async()=>{const s=await accepted(),w=await s.get<Wallet>(walletId(8453,buyer));await acceptQuote(s,input.id,"buyer",snapshot,now);expect(await s.get<Wallet>(walletId(8453,buyer))).toEqual(w);});
 it("only approves the canonical token and exact total",async()=>{const s=await accepted(),o=(await s.get<Order>(input.id))!;const a=approvalCall(o);expect(a.to).toBe(BASE_USDC);expect(a.value).toBe(0n);expect(decodeFunctionData({abi:baseUsdcAbi,data:a.data}).args).toEqual([router,11110000n]);const p=paymentCall(o);expect(p.value).toBe(0n);expect(decodeFunctionData({abi:PAYMENT_ABI,data:p.data}).functionName).toBe("payUsdc");});
 it("does not prepare payment before finalized approval",async()=>{const s=await accepted();await expect(leg(s,"payment")).rejects.toThrow("Approval must be finalized");});
 it("retains USDC and seller inventory after approval; releases gas budget for approval",async()=>{const s=await accepted();await leg(s,"approval");const w=(await s.get<Wallet>(walletId(8453,buyer)))!;expect(locked(w)).toBe(100n);expect(lockedBaseUsdc(w)).toBe(11110000n);expect((await s.get<Order>(input.id))?.status).toBe("payment_pending");expect(locked((await s.get<Wallet>(walletId(5042,seller)))!)).toBeGreaterThan(0n);});
 it("finalized payment releases buyer holds but keeps Arc funds until payout",async()=>{const s=await accepted();await leg(s,"approval");await leg(s,"payment");const w=(await s.get<Wallet>(walletId(8453,buyer)))!;expect(locked(w)).toBe(0n);expect(lockedBaseUsdc(w)).toBe(0n);expect((await s.get<Order>(input.id))?.status).toBe("payment_finalized");expect(locked((await s.get<Wallet>(walletId(5042,seller)))!)).toBeGreaterThan(0n);});
 it.each(["approval","payment"] as const)("reverted %s releases buyer holds",async kind=>{const s=await accepted();if(kind==="payment")await leg(s,"approval");await leg(s,kind,false);const w=(await s.get<Wallet>(walletId(8453,buyer)))!;expect(locked(w)).toBe(0n);expect(lockedBaseUsdc(w)).toBe(0n);expect((await s.get<Order>(input.id))?.status).toBe("payment_failed");});
 it("expiry cannot release an accepted USDC order",async()=>{const s=await accepted();await expect(finishOrder(s,(await s.get<Order>(input.id))!,"expired",now+60000)).rejects.toThrow("Only unsigned");});
 it("legacy orders without asset still encode ETH payment",async()=>{const s=await accepted(),o=(await s.get<Order>(input.id))!;delete o.paymentAsset;expect(paymentCall(o).value).toBe(BigInt(o.totalWei));expect(decodeFunctionData({abi:PAYMENT_ABI,data:paymentCall(o).data}).functionName).toBe("pay");});
});
