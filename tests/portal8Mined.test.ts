import {expect,it} from 'vitest';
import {parseEventLogs,decodeFunctionData,zeroAddress,type TransactionReceipt,type PublicClient} from 'viem';
import live from './fixtures/portal8-live.json';
import {PORTAL8,portal8Abi} from '../lib/launches/portal8';
import {verifyPortal8Mined} from '../lib/launches/portal8-mined';
import type {LaunchStepTerms} from '../lib/launches/execution-types';
function fixture(){
 const receipt={...structuredClone(live.receipt),blockNumber:BigInt(live.receipt.blockNumber)} as unknown as TransactionReceipt;
 const [p]=decodeFunctionData({abi:portal8Abi,data:live.input as `0x${string}`}).args as any[];
 const e=parseEventLogs({abi:portal8Abi,eventName:'Launched',logs:receipt.logs})[0].args as any;
 const terms={input:{...p.meta,creatorBps:p.alloc[0],burnBps:p.alloc[1],dividendBps:p.alloc[2],liquidityBps:p.alloc[3]},preview:{portal:PORTAL8,predictedHook:e.hook,predictedSplitter:e.escrow,quote:{address:p.quoteAsset,devBuy:String(p.bundle[0].amountQuote)}}} as LaunchStepTerms;
 const values:Record<string,unknown>={launches:[e.hook,e.escrow,e.locker,e.positionId,e.tickStart,e.tickBond,0n],token:e.token,portal:PORTAL8,quoteAsset:p.quoteAsset,payoutAsset:p.quoteAsset,poolId:'0xe00f9310473f26459ba41b3a7da4e117f61c2dafe8053b453ccdba2a04482cd3',creatorBps:p.alloc[0],burnBps:p.alloc[1],dividendBps:p.alloc[2],liquidityBps:p.alloc[3],lockBps:p.alloc[4],payoutOf:live.creator};
 const client={readContract:async({functionName}:{functionName:string})=>{if(!(functionName in values))throw Error('Unexpected read');return values[functionName];}} as unknown as PublicClient;
 return {receipt,terms,client,values};
}
it('verifies the real launch receipt with exact buy spend and received tokens',async()=>{
 const f=fixture();expect(await verifyPortal8Mined(f.client,live.creator,f.receipt,f.terms)).toMatchObject({token:'0xEDf569700fE57704f3A6d4AD3210366CFB33081A',quoteSpent:'5000000',quoteRefunded:'0',devBuyReceived:'2011470160369901061609419'});
});
it.each(['recipient','metadata','record','missing-event'] as const)('rejects %s evidence mismatches',async mode=>{
 const f=fixture();if(mode==='recipient')f.values.payoutOf=zeroAddress;
 if(mode==='metadata')f.terms.input.description='different';
 if(mode==='record')f.values.launches=[zeroAddress,zeroAddress,zeroAddress,0n,0,0,0n];
 if(mode==='missing-event')f.receipt.logs=f.receipt.logs.filter(l=>l.address.toLowerCase()!==PORTAL8.toLowerCase());
 await expect(verifyPortal8Mined(f.client,live.creator,f.receipt,f.terms)).rejects.toThrow();
});
