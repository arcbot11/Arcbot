import type {Store,HolderCursor,Transaction} from "../otc/model";
import {prepareTransaction} from "../otc/transactions";
export async function holderCursor(store:Store,token:string,now:number):Promise<HolderCursor>{
 if(!/^0x[\da-f]{40}$/i.test(token))throw Error("Invalid token.");
 const id="holder-cursor:"+token.toLowerCase();
 const c=await store.get<HolderCursor>(id)??{kind:"holder_cursor",id,owner:"system:holder-cursor",token:token.toLowerCase(),offset:0,revision:0,updatedAt:now};
 if(c.activeTx){const tx=await store.get<Transaction>(c.activeTx);
  if(tx&&["completed","reverted","cancelled"].includes(tx.status)){
   if(tx.status==="completed")c.offset=c.nextOffset??c.offset;
   delete c.activeTx;delete c.nextOffset;c.revision++;c.updatedAt=now;await store.put(c);
  }
 }
 return c;
}
function assertCurrent(c:HolderCursor,revision:number,nextOffset:number){
 if(c.activeTx)throw Error("Another holder payout is processing for this token. Try again after confirmation.");
 if(c.revision!==revision)throw Error("Holder queue advanced. Retry to use the next batch.");
 if(!Number.isSafeInteger(nextOffset)||nextOffset<0)throw Error("Invalid holder cursor.");
}
export async function skipHolderPage(store:Store,token:string,revision:number,nextOffset:number,now:number){
 const c=await holderCursor(store,token,now);assertCurrent(c,revision,nextOffset);c.offset=nextOffset;c.revision++;c.updatedAt=now;await store.put(c);return c;
}
export async function prepareHolderBatch(store:Store,input:Parameters<typeof prepareTransaction>[1],revision:number,nextOffset:number,now:number){
 const existing=await store.get<Transaction>(input.id);if(existing)return prepareTransaction(store,input,now);
 if(input.creatorClaim?.reward?.action!=="holders")throw Error("Invalid holder payout.");
 const c=await holderCursor(store,input.creatorClaim.token,now);assertCurrent(c,revision,nextOffset);
 const tx=await prepareTransaction(store,input,now);
 c.activeTx=tx.id;c.nextOffset=nextOffset;c.updatedAt=now;await store.put(c);return tx;
}
