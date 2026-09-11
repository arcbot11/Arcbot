import {describe,it,expect} from "vitest";
import {encodeFunctionData,serializeTransaction} from "viem";
import {type Store,type RecordValue,type Transaction,type Listing,type Order,type Wallet,walletId} from "../lib/otc/model";
import {beginSigning,cancelUnsignedTrade} from "../lib/otc/unsigned-recovery";
import {retainGasDust,requestGasTopup,claimSettlement,repriceFunding,BASE_DUST_WEI,authorizeGasRecovery} from "../lib/otc/gas-recovery";
import {advanceEscrowState,escrowTxId,escrowCall,retryEscrow} from "../lib/otc/escrow-model";
import {routerAbi} from "../lib/arc/routing";

const seller="0x1111111111111111111111111111111111111111",buyer="0x2222222222222222222222222222222222222222",escrow="0x3333333333333333333333333333333333333333";
function memory(){const rows=new Map<string,RecordValue>();return {rows,store:{get:async<T extends RecordValue>(id:string)=>structuredClone(rows.get(id)??null) as T|null,put:async(v:RecordValue)=>{rows.set(v.id,structuredClone(v));}} satisfies Store};}
function trade(){
 const db=memory(),id="trade:test",now=1_800_000_000_000;
 const tx:Transaction={kind:"transaction",id,owner:"seller",wallet:seller,chainId:5042,leg:"swap",holdId:id,status:"prepared",recoveryVersion:1,createdAt:now-200000,updatedAt:now-200000,unsigned:serializeTransaction({type:"eip1559",chainId:5042,to:escrow,gas:21000n,maxFeePerGas:1n,nonce:0,data:encodeFunctionData({abi:routerAbi,functionName:"execute",args:["0x",[],BigInt(now/1000-1)]})})};
 const w:Wallet={kind:"wallet",id:walletId(5042,seller),owner:"seller",address:seller,chainId:5042,activeTx:id,holds:{[id]:"100","another-listing":"999"},updatedAt:now};
 db.rows.set(id,tx);db.rows.set(w.id,w);return {...db,tx,w,now};
}
describe("unsigned recovery signing fence",()=>{
 it("releases only the expired trade hold, idempotently",async()=>{const d=trade();await cancelUnsignedTrade(d.store,d.tx.id,d.now);await cancelUnsignedTrade(d.store,d.tx.id,d.now);expect(await d.store.get(d.w.id)).toMatchObject({holds:{"another-listing":"999"}});expect((await d.store.get<Wallet>(d.w.id))!.activeTx).toBeUndefined();await expect(beginSigning(d.store,d.tx.id,d.now)).rejects.toThrow();});
 it.each(["started","legacy","signed"])("retains %s requests even after deadline",async mode=>{const d=trade();if(mode==="started")await beginSigning(d.store,d.tx.id,d.now);if(mode==="legacy"){delete d.tx.recoveryVersion;d.rows.set(d.tx.id,d.tx);}if(mode==="signed"){d.tx.raw="0x12";d.rows.set(d.tx.id,d.tx);}await expect(cancelUnsignedTrade(d.store,d.tx.id,d.now)).rejects.toThrow("safely");expect((await d.store.get<Wallet>(d.w.id))!.activeTx).toBe(d.tx.id);});
 it("cannot cancel a fresh trade",async()=>{const d=trade();await expect(cancelUnsignedTrade(d.store,d.tx.id,d.now-300000)).rejects.toThrow();});
});
function position(){
 const d=memory();const listing:Listing={kind:"listing",id:"listing:test",owner:"seller",seller,premiumBps:0,available:"0",held:"10000000",pendingFills:1,gasPerFillWei:"1000",status:"active",createdAt:1,updatedAt:1,escrow:{version:1,address:escrow,accountName:"test",fundingWei:"10000000000000000000",fundingGasWei:"1000",closeGasWei:"1000",feeRecipient:seller}};
 const order:Order={kind:"order",id:"order:test",owner:"buyer",buyer,seller,sellerOwner:"seller",listingId:listing.id,escrow:{version:2,address:escrow,gasBudgetWei:"3000"},amount:"10000000",premiumBps:0,ethUsdMicros:"2000000000",priceAt:1,sellerWei:"5000000000000000",feeWei:"75000000000000",totalWei:"5075000000000000",baseGasWei:"1000",arcGasWei:"1000",router:escrow,feeRecipient:seller,expiresAt:30001,status:"payout_submitted",createdAt:1,updatedAt:1};
 d.rows.set(listing.id,listing);d.rows.set(order.id,order);
 for(const step of ["fund","deposit","arc","seller","fee"] as const){const id=escrowTxId(listing,step,step==="fund"?undefined:order);d.rows.set(id,{...trade().tx,id,leg:"send",status:"completed",hash:"0xabc",blockNumber:"100"});}
 const w:Wallet={kind:"wallet",id:walletId(8453,escrow),owner:"seller",address:escrow,chainId:8453,holds:{"gas-credit:other":"77"},lastSettledBlock:"100",updatedAt:1};d.rows.set(w.id,w);return {...d,listing,order,w};
}
describe("escrow dust and bounded gas recovery",()=>{
 it('allows another completed top-up only within the cumulative allowance',async()=>{const d=position();const o=(await requestGasTopup(d.store,d.listing.id,d.order.id,'500',2))!;const id=escrowTxId(d.listing,'topup',o);d.rows.set(id,{...trade().tx,id,status:'completed',hash:'proof',blockNumber:'100'});const next=await requestGasTopup(d.store,d.listing.id,d.order.id,'600',3,false,0);expect(next.escrow).toMatchObject({topupWei:'600',topupSpentWei:'500',attempts:{topup:1}});await requestGasTopup(d.store,d.listing.id,d.order.id,'600',4,false,0);expect((await d.store.get<Order>(d.order.id))!.escrow!.attempts!.topup).toBe(1);});
 it('never spends above the cumulative automatic top-up allowance',async()=>{const d=position();const o=await requestGasTopup(d.store,d.listing.id,d.order.id,BASE_DUST_WEI.toString(),2);const id=escrowTxId(d.listing,'topup',o);d.rows.set(id,{...trade().tx,id,status:'completed',hash:'proof',blockNumber:'100'});await expect(requestGasTopup(d.store,d.listing.id,d.order.id,'1',3,false,0)).rejects.toThrow('allowance');});
 it('requires the actual gas payer to authorize a larger bounded allowance',async()=>{const d=position();await expect(authorizeGasRecovery(d.store,d.listing.id,d.order.id,'seller',(BASE_DUST_WEI*2n).toString(),false,2)).rejects.toThrow('payer');await authorizeGasRecovery(d.store,d.listing.id,d.order.id,'buyer',(BASE_DUST_WEI*2n).toString(),false,2);expect((await d.store.get<Order>(d.order.id))!.escrow!.baseRecoveryLimitWei).toBe((BASE_DUST_WEI*2n).toString());await expect(authorizeGasRecovery(d.store,d.listing.id,d.order.id,'buyer',(BASE_DUST_WEI*11n).toString(),false,2)).rejects.toThrow('policy');});
 it('can resume a step which failed before a transaction was prepared',async()=>{const d=position();d.rows.delete(escrowTxId(d.listing,'seller',d.order));expect((await retryEscrow(d.store,d.listing.id,d.order.id,'buyer',4)).updatedAt).toBe(4);expect(d.rows.has(escrowTxId(d.listing,'seller',d.order))).toBe(false);});
 it('resets only an unsigned escrow step and restores its source reservation',async()=>{const d=position(),id=escrowTxId(d.listing,'arc',d.order);const tx={...trade().tx,id,leg:'send' as const,wallet:escrow,holdId:id,escrowRef:{listingId:d.listing.id,orderId:d.order.id,step:'arc',sourceHold:d.listing.id,reserveWei:'1000'}};d.rows.set(id,tx);const w:Wallet={...d.w,id:walletId(5042,escrow),chainId:5042,activeTx:id,holds:{[id]:'1000',[d.listing.id]:'2000',other:'77'}};d.rows.set(w.id,w);const next=await retryEscrow(d.store,d.listing.id,d.order.id,'seller',3) as Order;expect(next.escrow!.attempts!.arc).toBe(1);expect(await d.store.get(w.id)).toMatchObject({holds:{[d.listing.id]:'3000',other:'77'}});expect((await d.store.get<Wallet>(w.id))!.activeTx).toBeUndefined();expect((await d.store.get<Transaction>(id))!.status).toBe('cancelled');});
 it("finishes paid orders with retained dust, releasing the listing and preserving other credits",async()=>{const d=position();await claimSettlement(d.store,d.listing.id,d.order.id,2);await retainGasDust(d.store,d.listing.id,d.order.id,"100","101",3);await advanceEscrowState(d.store,d.listing.id,d.order.id,4,"100","101");expect(await d.store.get(d.order.id)).toMatchObject({status:"completed",escrow:{refundSkipped:true,gasRemainderWei:"23"}});expect(await d.store.get(d.w.id)).toMatchObject({holds:{"gas-credit:other":"77","gas-credit:order:test":"23"}});const l=await d.store.get<Listing>(d.listing.id);expect(l!.pendingFills).toBe(0);expect(l!.escrow!.settlementOrderId).toBeUndefined();});
 it.each(["unpaid","large","pending-refund","stale"])("does not discard %s funds",async mode=>{const d=position();if(mode==="unpaid")d.rows.delete(escrowTxId(d.listing,"seller",d.order));if(mode==="pending-refund")d.rows.set(escrowTxId(d.listing,"return_gas",d.order),{...trade().tx,id:escrowTxId(d.listing,"return_gas",d.order)});await expect(retainGasDust(d.store,d.listing.id,d.order.id,mode==="large"?(BASE_DUST_WEI+78n).toString():"100",mode==="stale"?"99":"101",4)).rejects.toThrow();});
 it("queues another buyer behind the active settlement",async()=>{const d=position();const other={...d.order,id:"order:other"};d.rows.set(other.id,other);expect(await claimSettlement(d.store,d.listing.id,d.order.id,2)).toBe(true);expect(await claimSettlement(d.store,d.listing.id,other.id,3)).toBe(false);});
 it("uses one immutable top-up, from the buyer on Base and seller on Arc",async()=>{const d=position();const o=await requestGasTopup(d.store,d.listing.id,d.order.id,"500",2);await requestGasTopup(d.store,d.listing.id,d.order.id,"999",3);expect((await d.store.get<Order>(d.order.id))!.escrow!.topupWei).toBe("500");expect(await escrowCall(d.store,d.listing,"topup",o)).toMatchObject({from:buyer,to:escrow,chainId:8453,value:500n});const arc=await requestGasTopup(d.store,d.listing.id,d.order.id,"1000",3,true);expect(await escrowCall(d.store,d.listing,"arc_topup",arc)).toMatchObject({from:seller,to:escrow,chainId:5042,value:1000n});});
 it("rejects large automatic top-ups",async()=>{const d=position();await expect(requestGasTopup(d.store,d.listing.id,d.order.id,(BASE_DUST_WEI+1n).toString(),3)).rejects.toThrow("allowance");});
 it("reprices only unfunded listings within their original budget",async()=>{const d=position();d.rows.delete(escrowTxId(d.listing,"fund"));d.listing.status="funding";d.listing.available="20000000";d.listing.held="0";d.listing.pendingFills=0;d.rows.set(d.listing.id,d.listing);const total=BigInt(d.listing.escrow!.fundingWei)+1000n;const l=await repriceFunding(d.store,d.listing.id,"2000",3);expect(BigInt(l.escrow!.fundingWei)+BigInt(l.escrow!.fundingGasWei)).toBe(total);expect(l.available).toBe("19999999");});
});

it("retries only verified reverted recovery deposits with a new immutable attempt",async()=>{
 const d=position();const o=await requestGasTopup(d.store,d.listing.id,d.order.id,"500",2);const id=escrowTxId(d.listing,"topup",o);
 d.rows.set(id,{...trade().tx,id,status:"submitted",hash:"0xabc",blockNumber:"101"});
 await expect(retryEscrow(d.store,d.listing.id,d.order.id,"buyer",3)).rejects.toThrow("No verified");
 d.rows.set(id,{...trade().tx,id,status:"reverted",hash:"0xabc",blockNumber:"101"});
 const next=await retryEscrow(d.store,d.listing.id,d.order.id,"buyer",4) as Order;
 expect(next.escrow!.attempts!.topup).toBe(1);expect(next.escrow!.topupWei).toBe("500");
 expect(escrowTxId(d.listing,"topup",next)).not.toBe(id);
});

it("credits an uneconomic refund only after verified payouts, without touching others",async()=>{
 const d=position();const amount=1500000000000n;
 await claimSettlement(d.store,d.listing.id,d.order.id,2);
 await retainGasDust(d.store,d.listing.id,d.order.id,(amount+77n).toString(),"101",3,"1000000000000");
 await advanceEscrowState(d.store,d.listing.id,d.order.id,4,(amount+77n).toString(),"101");
 expect(await d.store.get(d.order.id)).toMatchObject({status:"completed",escrow:{refundSkipped:true,gasRemainderWei:amount.toString()}});
 expect(await d.store.get(d.w.id)).toMatchObject({holds:{"gas-credit:other":"77","gas-credit:order:test":amount.toString()}});
});
it.each(["economic","large","unpaid","existing"])("does not retain an %s refund under the gas-margin exception",async mode=>{
 const d=position();
 if(mode==="unpaid")d.rows.delete(escrowTxId(d.listing,"seller",d.order));
 if(mode==="existing")d.rows.set(escrowTxId(d.listing,"return_gas",d.order),{...trade().tx,id:escrowTxId(d.listing,"return_gas",d.order)});
 await expect(retainGasDust(d.store,d.listing.id,d.order.id,mode==="large"?"10000000000078":"1500000000077","101",3,mode==="economic"?"1000":"10000000000000")).rejects.toThrow();
});
