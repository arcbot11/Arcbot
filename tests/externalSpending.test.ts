import {it,expect} from 'vitest';
import {encodeEventTopics,encodeAbiParameters,parseAbi,serializeTransaction,keccak256,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {approvalReceiptMatches} from '../lib/otc/approval-delivery';
import {unsignedEnvelope,verifyExternalSignature} from '../lib/otc/external-signature';
import {sameCall,pauseSignedBroadcast,resumeSignedBroadcast} from '../lib/otc/signed-recovery';
import {submitted} from '../lib/otc/transactions';
import {type Transaction,type RecordValue,type Store} from '../lib/otc/model';
import {retainWalletBalances} from '../lib/wallet-balance-display';
const owner='0x1111111111111111111111111111111111111111',spender='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333';
it('uses exact receipt approval evidence independent of later allowance changes',()=>{
 const abi=parseAbi(['event Approval(address indexed owner,address indexed spender,uint256 value)']);
 const log={address:token,topics:encodeEventTopics({abi,eventName:'Approval',args:{owner,spender}}) as Hex[],data:encodeAbiParameters([{type:'uint256'}],[100n])};
 const input={address:token,owner,args:[spender,100n],logs:[log]};
 expect(approvalReceiptMatches(input)).toBe(true);
 expect(approvalReceiptMatches({...input,args:[spender,0n]})).toBe(false);
 expect(approvalReceiptMatches({...input,owner:spender})).toBe(false);
 expect(approvalReceiptMatches({...input,logs:[{...log,address:spender}]})).toBe(false);
 expect(approvalReceiptMatches({...input,logs:[]})).toBe(false);
});
it('checks Permit2 amount and expiration from its own receipt',()=>{
 const abi=parseAbi(['event Approval(address indexed owner,address indexed token,address indexed spender,uint160 amount,uint48 expiration)']);
 const log={address:token,topics:encodeEventTopics({abi,eventName:'Approval',args:{owner,token,spender}}) as Hex[],data:encodeAbiParameters([{type:'uint160'},{type:'uint48'}],[100n,900])};
 expect(approvalReceiptMatches({address:token,owner,args:[token,spender,100n,900],logs:[log]})).toBe(true);
 expect(approvalReceiptMatches({address:token,owner,args:[token,spender,100n,901],logs:[log]})).toBe(false);
});
it.each(['legacy','eip2930','eip1559'] as const)('verifies matching external %s envelopes without signing new transactions',async type=>{
 const account=privateKeyToAccount(`0x${'1'.padStart(64,'0')}`);
 const common={chainId:5042,to:spender,nonce:3,value:100n,gas:21000n} as const;
 const call=type==='eip1559'?{...common,type,maxFeePerGas:10n,maxPriorityFeePerGas:1n}:{...common,type,gasPrice:10n};
 const raw=await account.signTransaction(call),unsigned=unsignedEnvelope(raw);
 const tx={wallet:account.address,raw,hash:keccak256(raw),unsigned,externalReplacement:true} as Transaction;
 expect(await verifyExternalSignature(tx)).toBe(tx.hash);
 expect(sameCall(serializeTransaction({...common,type:'eip1559',maxFeePerGas:1n,maxPriorityFeePerGas:0n}),unsigned)).toBe(true);
 await expect(verifyExternalSignature({...tx,wallet:owner})).rejects.toThrow();
});
it('keeps a paused signed obligation locked and prevents broadcast after balance returns',async()=>{
 const tx:Transaction={kind:'transaction',id:'tx:paused',owner:'owner',wallet:owner,chainId:5042,leg:'send',status:'signed',unsigned:'0x',raw:'0x01',hash:'hash',holdId:'tx:paused',createdAt:1,updatedAt:1};
 const rows=new Map<string,RecordValue>([[tx.id,tx]]);
 const store:Store={get:async<T extends RecordValue>(id:string)=>structuredClone(rows.get(id)??null) as T|null,put:async r=>{rows.set(r.id,structuredClone(r));}};
 const paused=await pauseSignedBroadcast(store,{id:tx.id,expectedHash:'hash'},2);
 expect(paused.status).toBe('signed');expect(paused.raw).toBe('0x01');
 await expect(submitted(store,tx.id,3)).rejects.toThrow('paused');
 expect((await store.get<Transaction>(tx.id))!.broadcastAttempts).toBeUndefined();
 await expect(pauseSignedBroadcast(store,{id:tx.id,expectedHash:'wrong'},3)).rejects.toThrow();
 await expect(resumeSignedBroadcast(store,{id:tx.id,expectedHash:'hash',owner:'someone else'},3)).rejects.toThrow();
});
it('retains the time of the last good display balance without restoring spend authority',()=>{
 const previous:{walletAddress:string;balances:{chainId:number;balanceWei:string|null;availableWei:string|null;observedAt:number|null}[]}={walletAddress:owner,balances:[{chainId:5042,balanceWei:'100',availableWei:'100',observedAt:1}]};
 const next={walletAddress:owner,balances:[{chainId:5042,balanceWei:null,availableWei:null,observedAt:null}]};
 expect(retainWalletBalances(previous,next).balances[0]).toEqual({chainId:5042,balanceWei:'100',availableWei:null,observedAt:1});
});
