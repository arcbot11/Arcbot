import {describe,it,expect} from "vitest";
import {serializeTransaction} from "viem";
import {extendEscrowBaseGas} from "../lib/otc/signed-recovery";
import {type Store,type RecordValue,type Transaction,type Wallet,type Order,type Listing,walletId} from "../lib/otc/model";
const address="0x1111111111111111111111111111111111111111",to="0x2222222222222222222222222222222222222222";
function fixture(){
 const rows=new Map<string,RecordValue>();
 const store:Store={get:async<T extends RecordValue>(id:string)=>structuredClone(rows.get(id)??null) as T|null,put:async r=>{rows.set(r.id,structuredClone(r));}};
 const tx={kind:"transaction",id:"tx",owner:"seller",wallet:address,chainId:8453,leg:"send",holdId:"tx",status:"submitted",unsigned:serializeTransaction({chainId:8453,type:"eip1559",to,value:1000n,gas:21000n,maxFeePerGas:1n}),raw:"0x01",hash:"hash",escrowRef:{listingId:"listing",orderId:"order",step:"fee"},createdAt:1,updatedAt:1} as Transaction;
 const w:Wallet={kind:"wallet",id:walletId(8453,address),owner:"seller",address,chainId:8453,holds:{tx:"177297386840","gas-credit:other":"1000000000000"},activeTx:"tx",updatedAt:1};
 const o={kind:"order",id:"order",listingId:"listing",status:"payment_pending",baseGasWei:"354751151308",escrow:{address,version:2}} as Order;
 const l={kind:"listing",id:"listing",escrow:{address,settlementOrderId:"order"}} as Listing;
 for(const r of [tx,w,o,l])rows.set(r.id,r);
 return {store,rows,tx,w,o,l,input:{id:"tx",expectedHash:"hash",gasWei:"354901206948",balanceWei:"1937804763004",block:"100"}};
}
describe("automatic OTC Base gas-hold recovery",()=>{
 it("covers a tiny Base fee fluctuation with escrow funds without changing signed payment",async()=>{
  const f=fixture();const result=await extendEscrowBaseGas(f.store,f.input,2);
  expect(result).toMatchObject({raw:f.tx.raw,unsigned:f.tx.unsigned,hash:f.tx.hash,status:"submitted"});
  expect(await f.store.get(f.w.id)).toMatchObject({activeTx:"tx",holds:{tx:"354901207948","gas-credit:other":"1000000000000"}});
  await extendEscrowBaseGas(f.store,f.input,3);
  expect((await f.store.get<Wallet>(f.w.id))!.holds.tx).toBe("354901207948");
 });
 it.each(["budget","funds","hash","lock","step","finished"])("rejects unsafe recovery: %s",async mode=>{
  const f=fixture();if(mode==="budget")f.input.gasWei="1354751151309";
  if(mode==="funds")f.input.balanceWei="1200000000000";
  if(mode==="hash")f.input.expectedHash="another";
  if(mode==="lock"){f.l.escrow!.settlementOrderId="other";f.rows.set(f.l.id,f.l);}
  if(mode==="step"){f.tx.escrowRef!.step="return_gas";f.rows.set(f.tx.id,f.tx);}
  if(mode==="finished"){f.o.status="completed";f.rows.set(f.o.id,f.o);}
  await expect(extendEscrowBaseGas(f.store,f.input,2)).rejects.toThrow();
  expect(await f.store.get(f.w.id)).toEqual(f.w);
 });
});
