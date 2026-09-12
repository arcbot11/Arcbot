import {describe,it,expect} from "vitest";
import {purchaseProgress} from "../lib/otc/purchase-progress";
import type {Order,Transaction} from "../lib/otc/model";
const order={id:"order",status:"payment_pending",updatedAt:1,escrow:{version:2,sellerFirst:true}} as Order;
const tx=(step:string,status:string)=>({escrowRef:{step},status,hash:"0xabc",blockNumber:"1",updatedAt:2}) as Transaction;
describe("OTC purchase progress",()=>{
 it("tracks seller-first verified steps",()=>{
  expect(purchaseProgress(order,[]).message).toBe("Preparing Base ETH payment");
  expect(purchaseProgress(order,[tx("deposit","submitted")]).message).toBe("Base verification");
  expect(purchaseProgress(order,[tx("deposit","completed")]).message).toBe("Base verification");
  expect(purchaseProgress(order,[tx("deposit","completed"),tx("seller","submitted")]).message).toBe("Base verification");
  expect(purchaseProgress(order,[tx("deposit","completed"),tx("seller","completed")]).message).toBe("Sending Arc USDC to your wallet");
  expect(purchaseProgress(order,[tx("deposit","completed"),tx("seller","completed"),tx("arc","submitted")]).message).toBe("Verifying Arc USDC delivery");
 });
 it("keeps legacy delivery order",()=>{
  expect(purchaseProgress({...order,escrow:{...order.escrow!,sellerFirst:false}},[tx("deposit","completed")]).message).toBe("Sending Arc USDC to your wallet");
 });
 it("shows actual problems without an active animation",()=>{
  expect(purchaseProgress({...order,note:"Settlement paused: gas exceeds this order's allowance."},[])).toMatchObject({active:false,message:"Settlement paused: gas exceeds this order's allowance."});
  expect(purchaseProgress(order,[tx("deposit","reverted")])).toMatchObject({active:false,message:"Transaction reverted. Waiting for recovery."});
 });
 it("does not advance from an unverified completion",()=>{
  expect(purchaseProgress(order,[{...tx("deposit","completed"),hash:undefined}]).message).toBe("Preparing Base ETH payment");
 });
});
