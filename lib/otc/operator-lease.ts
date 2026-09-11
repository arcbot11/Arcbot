import { checkSnapshot, locked, wallet, walletId, type Store, type Wallet } from "./model";

/** Private operator signing uses a durable wallet lock, never an expiring lease. */
export async function acquireOperatorLease(store: Store, input: {id:string;address:string;owner:string;balanceWei:string;block:string}, now:number) {
  if(!/^operator-launch:[0-9a-f-]{36}$/.test(input.id)||!/^0x[0-9a-fA-F]{40}$/.test(input.address))throw Error("Invalid operator lease.");
  const w=await wallet(store,5042,input.address,input.owner,now);
  if(w.activeTx===input.id)return w;
  checkSnapshot(w,input.block);
  const available=BigInt(input.balanceWei)-locked(w);
  if(available<=0n)throw Error("No available funds for operator work.");
  w.holds[input.id]=available.toString();w.activeTx=input.id;w.updatedAt=now;
  await store.put(w);return w;
}

/** Only the secret-authenticated operator may release after reconciling its journal. */
export async function releaseOperatorLease(store:Store,input:{id:string;address:string;block:string},now:number){
  if(!/^operator-launch:[0-9a-f-]{36}$/.test(input.id))throw Error("Invalid operator lease.");
  const w=await store.get<Wallet>(walletId(5042,input.address));
  if(!w)throw Error("Operator wallet missing.");
  if(!w.activeTx&&!w.holds[input.id])return w;
  if(w.activeTx!==input.id||!w.holds[input.id])throw Error("Operator lease changed.");
  if(w.lastSettledBlock&&BigInt(input.block)<BigInt(w.lastSettledBlock))throw Error("Operator snapshot is stale.");
  delete w.holds[input.id];delete w.activeTx;w.lastSettledBlock=input.block;w.updatedAt=now;
  await store.put(w);return w;
}
