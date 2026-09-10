import {describe,it,expect} from "vitest";
import {encodeEventTopics,encodeAbiParameters,type Hex} from "viem";
import {transferAbi,verifyTransferDelivery} from "../lib/otc/token-delivery";
import {retryPayout} from "../lib/otc/transactions";
import {type Store,type RecordValue,type Order,type Transaction,type Wallet,walletId} from "../lib/otc/model";
const token="0x1111111111111111111111111111111111111111",sender="0x2222222222222222222222222222222222222222",recipient="0x3333333333333333333333333333333333333333";
const log=(from:string,to:string,value:bigint)=>({address:token,topics:encodeEventTopics({abi:transferAbi,eventName:"Transfer",args:{from:from as Hex,to:to as Hex}}) as Hex[],data:encodeAbiParameters([{type:"uint256"}],[value])});
describe("block-aware token delivery",()=>{
 it("rejects an empty or truncated block log response",()=>{const received=log(sender,recipient,100n);expect(()=>verifyTransferDelivery({token,sender,recipient,amount:100n,before:0n,after:0n,logs:[received],blockLogs:[]})).toThrow("incomplete");});
 it("verifies receipt delivery even if the recipient spends later in the block",()=>{const received=log(sender,recipient,100n),spent=log(recipient,token,150n);expect(()=>verifyTransferDelivery({token,sender,recipient,amount:100n,before:1000n,after:950n,logs:[received],blockLogs:[received,spent]})).not.toThrow();});
 it("does not let another transaction replace missing delivery evidence",()=>{const incoming=log(token,recipient,100n);expect(()=>verifyTransferDelivery({token,sender,recipient,amount:100n,before:0n,after:100n,logs:[],blockLogs:[incoming]})).toThrow();});
 it("rejects events inconsistent with real state",()=>{const received=log(sender,recipient,100n);expect(()=>verifyTransferDelivery({token,sender,recipient,amount:100n,before:0n,after:0n,logs:[received],blockLogs:[received]})).toThrow();});
});
class Memory implements Store{rows=new Map<string,RecordValue>();async get<T extends RecordValue>(id:string){return structuredClone(this.rows.get(id)??null) as T|null;}async put(r:RecordValue){this.rows.set(r.id,structuredClone(r));}}
async function fixture(){const s=new Memory();await s.put({kind:"order",id:"order:test",sellerOwner:"seller",seller:sender,status:"payout_failed",paymentHash:"base-proof",payoutHash:"arc-proof",updatedAt:0} as Order);await s.put({kind:"transaction",id:"tx:order:test:payout",status:"reverted",hash:"arc-proof",blockNumber:"10"} as Transaction);await s.put({kind:"wallet",id:walletId(5042,sender),owner:"seller",address:sender,chainId:5042,holds:{listing:"100",other:"20"},lastSettledBlock:"10",updatedAt:0});return s;}
describe("OTC payout recovery",()=>{
 const input={id:"order:test",owner:"seller",attempt:0,balanceWei:"120",block:"11"};
 it("preserves both listing and unrelated holds, and never retries Base payment",async()=>{const s=await fixture();const o=await retryPayout(s,input,2);expect(o.status).toBe("payment_finalized");expect(o.payoutAttempt).toBe(1);expect(o.paymentHash).toBe("base-proof");expect((await s.get<Wallet>(walletId(5042,sender)))?.holds).toEqual({listing:"100",other:"20"});});
 it("rejects concurrent or repeated recovery of the same attempt",async()=>{const s=await fixture();await retryPayout(s,input,2);await expect(retryPayout(s,input,3)).rejects.toThrow("changed");});
 it("rejects another owner",async()=>{await expect(retryPayout(await fixture(),{...input,owner:"buyer"},2)).rejects.toThrow("not found");});
 it("requires gas and all other funds to stay covered",async()=>{await expect(retryPayout(await fixture(),{...input,balanceWei:"119"},2)).rejects.toThrow("add Arc USDC");});
 it("never retries an ambiguous or successful payout",async()=>{const s=await fixture(),t=(await s.get<Transaction>("tx:order:test:payout"))!;for(const status of ["submitted","completed"] as const){await s.put({...t,status});await expect(retryPayout(s,input,2)).rejects.toThrow("not verified");}});
});
