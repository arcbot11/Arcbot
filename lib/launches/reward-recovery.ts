import type {Store,Transaction,RewardRequestFence} from "../otc/model";
/** In the same atomic mutation, either preserve a transaction or prohibit its late preparation. */
export async function recoverRewardRequest(store:Store,input:{id:string;owner:string;wallet:string},now:number){
 if(!/^reward:[a-f0-9]{64}$/.test(input.id))throw Error("Invalid reward request.");
 const tx=await store.get<Transaction>(input.id);
 if(tx){if(tx.owner!==input.owner||tx.wallet.toLowerCase()!==input.wallet.toLowerCase())throw Error("Request identity mismatch.");return tx;}
 const id="reward-fence:"+input.id;
 const previous=await store.get<RewardRequestFence>(id);
 if(previous&&(previous.owner!==input.owner||previous.wallet.toLowerCase()!==input.wallet.toLowerCase()))throw Error("Request identity mismatch.");
 if(!previous)await store.put({kind:"reward_request_fence",id,owner:input.owner,wallet:input.wallet,updatedAt:now});
 return null;
}
