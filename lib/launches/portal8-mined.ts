import { parseAbi, parseEventLogs, getAddress, type PublicClient, type TransactionReceipt } from 'viem';
import { PORTAL8, PORTAL8_CREATOR_REGISTRY, portal8Abi, portal8ReadAbi, same8 } from './portal8';
import { dynamicLaunchAbi } from '../arc/argus-discovery';
import { poolId } from '../arc/routing';
import { ARC_USDC } from '../arc/config';
import { ARC_NATIVE_TRANSFER } from '../arc/usdc-delivery';
import type { LaunchStepTerms, VerifiedLaunch } from './execution-types';
const extra=parseAbi(['function token() view returns(address)','function portal() view returns(address)','function quoteAsset() view returns(address)','function payoutAsset() view returns(address)',
 'function poolId() view returns(bytes32)','function creatorBps() view returns(uint16)','function burnBps() view returns(uint16)','function dividendBps() view returns(uint16)','function liquidityBps() view returns(uint16)','function lockBps() view returns(uint16)',
 'event Transfer(address indexed from,address indexed to,uint256 value)']);
/** Called only after transaction, chain, canonical receipt and accepted calldata checks. */
export async function verifyPortal8Mined(client:PublicClient, wallet:string, receipt:TransactionReceipt, terms:LaunchStepTerms):Promise<VerifiedLaunch>{
 const p=terms.preview,input=terms.input,blockNumber=receipt.blockNumber;
 const events=parseEventLogs({abi:portal8Abi,eventName:'Launched',logs:receipt.logs,strict:true}).filter(e=>same8(e.address,PORTAL8));
 if(events.length!==1)throw Error('Portal 8 launch event missing or ambiguous.');
 const e=events[0].args as {token:string;creator:string;hook:string;escrow:string;locker:string;positionId:bigint;tickStart:number;tickBond:number};
 if(!same8(e.creator,wallet)||!same8(e.hook,p.predictedHook)||!same8(e.escrow,p.predictedSplitter))throw Error('Portal 8 launch identity differs from accepted terms.');
 const token=getAddress(e.token),hook=getAddress(e.hook),escrow=getAddress(e.escrow),quote=p.quote!.address;
 const metadata=parseEventLogs({abi:portal8Abi,eventName:'LaunchMetadata',logs:receipt.logs,strict:true}).filter(e=>same8(e.address,PORTAL8));
 if(metadata.length!==1)throw Error('Launch metadata missing.');
 const meta=metadata[0].args as Record<string,string>;
 if(!same8(meta.token,token)||(['imageURI','website','twitter','telegram','description'] as const).some(k=>meta[k]!==input[k]))throw Error('Launch metadata differs from accepted terms.');
 const record=await client.readContract({address:PORTAL8,abi:dynamicLaunchAbi,functionName:'launches',args:[token],blockNumber});
 if(!same8(record[0],hook)||!same8(record[1],escrow)||!same8(record[2],e.locker)||record[3]!==e.positionId||record[4]!==e.tickStart||record[5]!==e.tickBond)throw Error('Portal 8 launch record mismatch.');
 const read=(address: `0x${string}`, functionName:typeof extra[number]['name'])=>client.readContract({address,abi:extra,functionName,blockNumber} as never);
 const values=await Promise.all([read(escrow,'token'),read(escrow,'portal'),read(escrow,'quoteAsset'),read(escrow,'payoutAsset'),read(hook,'poolId'),...(['creatorBps','burnBps','dividendBps','liquidityBps','lockBps'] as const).map(n=>read(escrow,n))]);
 if(!same8(String(values[0]),token)||!same8(String(values[1]),PORTAL8)||!same8(String(values[2]),quote)||!same8(String(values[3]),quote))throw Error('Portal 8 escrow identity mismatch.');
 const expectedShares=[input.creatorBps,input.burnBps,input.dividendBps,input.liquidityBps,0];
 if(values.slice(5).some((v,i)=>Number(v)!==expectedShares[i]))throw Error('Portal 8 shares differ from approved terms.');
 const payout=await client.readContract({address:PORTAL8_CREATOR_REGISTRY,abi:portal8ReadAbi,functionName:'payoutOf',args:[token],blockNumber});
 if(!same8(payout,input.feeDestination?.address??wallet))throw Error('Portal 8 fee recipient mismatch.');
 const [currency0,currency1]=[quote,token].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
 const id=poolId({protocol:'v4',currency0,currency1,hooks:hook,fee:0x800000,tickSpacing:200});
 if(values[4]!==id)throw Error('Portal 8 pool mismatch.');
 const transfers=parseEventLogs({abi:extra,eventName:'Transfer',logs:receipt.logs,strict:true});
 const received=transfers.filter(t=>same8(t.address,token)).reduce((n,t)=>n+(same8(t.args.to,wallet)?t.args.value:0n)-(same8(t.args.from,wallet)?t.args.value:0n),0n);
 const leg=(from:string,to:string)=>{
  const rows=transfers.filter(t=>same8(t.args.from,from)&&same8(t.args.to,to));
  const erc=rows.filter(t=>same8(t.address,quote)),native=rows.filter(t=>same8(t.address,ARC_NATIVE_TRANSFER));
  const sum=erc.reduce((n,t)=>n+t.args.value,0n),nat=native.reduce((n,t)=>n+t.args.value,0n)/10n**12n;
  if(same8(quote,ARC_USDC)&&erc.length&&native.length&&sum!==nat)throw Error('Conflicting USDC evidence.');
  return same8(quote,ARC_USDC)&&native.length?nat:sum;
 };
 const paid=leg(wallet,PORTAL8),refunded=leg(PORTAL8,wallet);
 if(paid!==BigInt(p.quote!.devBuy)||refunded>paid||received<=0n)throw Error('Portal 8 opening buy delivery mismatch.');
 const buys=parseEventLogs({abi:portal8Abi,eventName:'BundleBought',logs:receipt.logs,strict:true}).filter(e=>same8(e.address,PORTAL8));
 if(buys.length!==1)throw Error('Opening buy event missing.');
 const buy=buys[0].args as {token:string;wallets:bigint;quoteIn:bigint;tokensOut:bigint};
 if(!same8(buy.token,token)||buy.wallets!==1n||buy.tokensOut!==received||buy.quoteIn!==paid||refunded!==0n)throw Error('Opening buy event differs from transfers.');
 return {hash:receipt.transactionHash,token,creator:wallet,portal:PORTAL8,hook,splitter:escrow,locker:e.locker,poolId:id,blockNumber:String(blockNumber),devBuyReceived:String(received),quoteSpent:String(paid-refunded),quoteRefunded:String(refunded)};
}
