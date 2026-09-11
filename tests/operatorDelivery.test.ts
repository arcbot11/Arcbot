import {expect,it,vi} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,type PublicClient,type TransactionReceipt} from 'viem';
import {verifyOperatorSwapReceipt} from '../lib/arc/operator-delivery';
import {transferAbi} from '../lib/otc/token-delivery';
import {ARC_NATIVE_TRANSFER} from '../lib/arc/usdc-delivery';
import {ARC_USDC} from '../lib/arc/config';
const owner='0x1111111111111111111111111111111111111111',pool='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333';
const hash=`0x${'a'.repeat(64)}` as const;
function log(address:string,from:string,to:string,value:bigint){return {address,topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from:from as `0x${string}`,to:to as `0x${string}`}}),data:encodeAbiParameters([{type:'uint256'}],[value])};}
it('checks net ARGOS output, including a deduction in the same receipt',async()=>{
 const logs=[log(token,pool,owner,10n),log(token,owner,pool,1n)];
 const r={status:'success',blockNumber:100n,logs} as unknown as TransactionReceipt;
 const client={getLogs:vi.fn(async()=>logs),readContract:vi.fn(async({blockNumber})=>blockNumber===99n?0n:9n)} as unknown as PublicClient;
 await expect(verifyOperatorSwapReceipt(client,{address:owner,outputToken:token,minimum:10n},r)).rejects.toThrow('Minimum');
 await expect(verifyOperatorSwapReceipt(client,{address:owner,outputToken:token,minimum:9n},r)).resolves.toMatchObject({raw:9n,symbol:'ARGOS'});
});
it('verifies native USDC receipt evidence for six-decimal USDC output, excluding gas',async()=>{
 const received=20n*10n**12n,logs=[log(ARC_NATIVE_TRANSFER,pool,owner,received)];
 const r={status:'success',blockNumber:100n,blockHash:hash,transactionHash:hash,from:owner,gasUsed:10n,effectiveGasPrice:2n,logs} as unknown as TransactionReceipt;
 const client={getLogs:vi.fn(async()=>logs),getBalance:vi.fn(async({blockNumber})=>blockNumber===99n?100n:100n+received-20n),getBlock:vi.fn(async()=>({hash,transactions:[{hash,from:owner}]}))} as unknown as PublicClient;
 await expect(verifyOperatorSwapReceipt(client,{address:owner,outputToken:ARC_USDC,minimum:20n},r)).resolves.toMatchObject({raw:received,decimals:18,symbol:'USDC'});
 await expect(verifyOperatorSwapReceipt(client,{address:owner,outputToken:ARC_USDC,minimum:21n},r)).rejects.toThrow('Minimum');
});
