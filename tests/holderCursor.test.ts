import {expect,it} from "vitest";
import {holderCursor,skipHolderPage,prepareHolderBatch} from "../lib/launches/holder-cursor";
import type {Store,RecordValue,Transaction} from "../lib/otc/model";
const token="0x1111111111111111111111111111111111111111",wallet="0x2222222222222222222222222222222222222222",splitter="0x3333333333333333333333333333333333333333";
function fixture(){const rows=new Map<string,RecordValue>();const store:Store={get:async<T extends RecordValue>(id:string):Promise<T|null>=>(rows.get(id) as T|undefined)??null,put:async row=>{rows.set(row.id,structuredClone(row));}};return {rows,store};}
const input=(id:string)=>({id,owner:"u",wallet,chainId:5042 as const,leg:"claim" as const,creatorClaim:{token,splitter,reward:{action:"holders" as const,tracker:splitter,recipients:[wallet]}},unsigned:"0x",reserveWei:"20",balanceWei:"100",block:"1"});
it("locks pending batches, advances once after success, and wraps at the end",async()=>{
 const {store,rows}=fixture();await prepareHolderBatch(store,input("one"),0,50,1);
 expect((await holderCursor(store,token,2)).offset).toBe(0);
 await expect(skipHolderPage(store,token,0,50,2)).rejects.toThrow("processing");
 const tx=rows.get("one") as Transaction;tx.status="completed";rows.set(tx.id,tx);
 const next=await holderCursor(store,token,3);expect(next.offset).toBe(50);expect(next.activeTx).toBeUndefined();
 expect((await holderCursor(store,token,4)).revision).toBe(next.revision);
 const wrapped=await skipHolderPage(store,token,next.revision,0,5);expect(wrapped.offset).toBe(0);
});
it.each(["reverted","cancelled"] as const)("retains the batch after %s",async status=>{
 const {store,rows}=fixture();await prepareHolderBatch(store,input("one"),0,50,1);const tx=rows.get("one") as Transaction;tx.status=status;rows.set(tx.id,tx);expect(await holderCursor(store,token,2)).toMatchObject({offset:0,revision:1});
});
it("rejects stale cursor updates and isolates tokens",async()=>{
 const {store}=fixture();await skipHolderPage(store,token,0,50,1);
 await expect(skipHolderPage(store,token,0,100,2)).rejects.toThrow("advanced");
 expect((await holderCursor(store,splitter,2)).offset).toBe(0);
});
