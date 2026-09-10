import { expect, it } from "vitest";
import { serializeTransaction, encodeFunctionData } from "viem";
import { BASE_USDC } from "../lib/base/usdc";
import { transferAbi } from "../lib/otc/token-delivery";
import { prepareTransaction, signTransactionRecord, settled } from "../lib/otc/transactions";
import { walletId, type Store, type RecordValue, type Wallet } from "../lib/otc/model";
const address="0x1111111111111111111111111111111111111111",recipient="0x2222222222222222222222222222222222222222";
class Memory implements Store {
  rows=new Map<string,RecordValue>();
  async get<T extends RecordValue>(id:string){return structuredClone(this.rows.get(id)??null) as T|null;}
  async put(record:RecordValue){this.rows.set(record.id,structuredClone(record));}
}
const input={id:"send:base",owner:"alice",wallet:address,chainId:8453 as const,leg:"send" as const,reserveWei:"1000",balanceWei:"100000",baseUsdcBalance:"20000000",block:"100",unsigned:serializeTransaction({type:"eip1559",chainId:8453,nonce:0,gas:50000n,maxFeePerGas:1n,maxPriorityFeePerGas:0n,to:BASE_USDC,value:0n,data:encodeFunctionData({abi:transferAbi,functionName:"transfer",args:[recipient,10000000n]})})};
async function setup(){const store=new Memory();await store.put({kind:"wallet",id:walletId(8453,address),owner:"alice",address,chainId:8453,holds:{otc:"1000"},usdcHolds:{otc:"5000000"},updatedAt:0});return store;}
it.each([true,false])("retains the USDC lock until verified settlement, success=%s",async success=>{
 const store=await setup();await prepareTransaction(store,input,1);
 expect((await store.get<Wallet>(walletId(8453,address)))?.usdcHolds).toEqual({otc:"5000000","send:base":"10000000"});
 await expect(prepareTransaction(store,{...input,id:"duplicate"},2)).rejects.toThrow("pending");
 await signTransactionRecord(store,input.id,"raw","hash",2);
 await settled(store,input.id,"101",success,3);
 const wallet=await store.get<Wallet>(walletId(8453,address));
 expect(wallet?.usdcHolds).toEqual({otc:"5000000"});expect(wallet?.holds).toEqual({otc:"1000"});expect(wallet?.activeTx).toBeUndefined();
});
it("rejects missing or insufficient fresh USDC coverage without writing a transaction",async()=>{
 for(const balance of [undefined,"14999999"]){const store=await setup();await expect(prepareTransaction(store,{...input,baseUsdcBalance:balance},1)).rejects.toThrow("available Base USDC");expect(await store.get(input.id)).toBeNull();}
});
