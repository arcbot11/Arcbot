import {expect,it} from "vitest";
import {recoverRewardRequest} from "../lib/launches/reward-recovery";
import {prepareTransaction} from "../lib/otc/transactions";
import type {Store,RecordValue,Transaction} from "../lib/otc/model";
const id="reward:"+"a".repeat(64),wallet="0x1111111111111111111111111111111111111111",owner="u";
function fixture(){const rows=new Map<string,RecordValue>();const store:Store={get:async<T extends RecordValue>(key:string):Promise<T|null>=>(rows.get(key) as T|undefined)??null,put:async row=>{rows.set(row.id,row);}};return {store,rows};}
const input={id,owner,wallet,chainId:5042 as const,leg:"claim" as const,creatorClaim:{token:wallet,splitter:wallet,reward:{action:"distribute" as const,tracker:wallet}},unsigned:"0x",reserveWei:"20",balanceWei:"100",block:"1"};
it("clears a missing request and blocks late preparation without locking funds",async()=>{const {store,rows}=fixture();expect(await recoverRewardRequest(store,{id,owner,wallet},1)).toBeNull();await expect(prepareTransaction(store,input,2)).rejects.toThrow("cleared");expect(rows.size).toBe(1);});
it("preserves a transaction when preparation won the race",async()=>{const {store}=fixture();const tx=await prepareTransaction(store,input,1);expect(await recoverRewardRequest(store,{id,owner,wallet},2)).toEqual(tx);});
it.each(["prepared","signed","submitted","completed"] as const)("never clears a %s transaction",async status=>{const {store,rows}=fixture();const tx=await prepareTransaction(store,input,1);tx.status=status;rows.set(id,tx);expect((await recoverRewardRequest(store,{id,owner,wallet},2))?.status).toBe(status);expect(rows.has("reward-fence:"+id)).toBe(false);});
it("rejects recovery by a different owner",async()=>{const {store}=fixture();await prepareTransaction(store,input,1);await expect(recoverRewardRequest(store,{id,owner:"other",wallet},2)).rejects.toThrow("identity");});
