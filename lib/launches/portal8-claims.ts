import { decodeFunctionResult, encodeFunctionData, parseAbi, parseEventLogs, zeroAddress, type Address, type Hex } from 'viem';
import { PORTAL8, PORTAL8_CREATOR_REGISTRY, PORTAL8_IDENTITY, portal8ReadAbi, read8, verifyPortal8, same8 } from './portal8';
import { dynamicLaunchAbi } from '../arc/argus-discovery';
import type { ArcRpc } from '../arc/rpc';
import { FeeClaimError } from './fees';
const identityAbi=parseAbi(['function identityKeyOf(address) view returns(bytes32)','function payoutOf(bytes32) view returns(address)']);
export type Portal8Claim = {portal:Address;quote:Address;payout:Address;recipients:Address[];shares:number[];control:Address};
export async function verifyPortal8Claim(wallet:Address,token:Address,rpc:ArcRpc,block:bigint){
 const raw=await rpc.call({from:zeroAddress,to:PORTAL8,value:0n,data:encodeFunctionData({abi:dynamicLaunchAbi,functionName:'launches',args:[token]})},block);
 if(raw==='0x')return null;
 const record=decodeFunctionResult({abi:dynamicLaunchAbi,functionName:'launches',data:raw});
 if(record[0]===zeroAddress)return null;
 await verifyPortal8(rpc,block);
 const splitter=record[1];
 if(!(await rpc.code(splitter,block))?.replace(/^0x$/,''))throw new FeeClaimError('Fee escrow code missing.');
 const [portal,actual,registry,quote,payout,control,split,bound]=await Promise.all([
  read8<Address>(rpc,block,splitter,portal8ReadAbi,'portal'),read8<Address>(rpc,block,splitter,portal8ReadAbi,'token'),
  read8<Address>(rpc,block,splitter,portal8ReadAbi,'creatorRegistry'),read8<Address>(rpc,block,splitter,portal8ReadAbi,'quoteAsset'),
  read8<Address>(rpc,block,splitter,portal8ReadAbi,'payoutAsset'),read8<Address>(rpc,block,PORTAL8_CREATOR_REGISTRY,portal8ReadAbi,'payoutOf',[token]),
  read8<readonly[Address[],number[]]>(rpc,block,PORTAL8_CREATOR_REGISTRY,portal8ReadAbi,'payoutSplit',[token]),
  read8<Address>(rpc,block,PORTAL8_CREATOR_REGISTRY,portal8ReadAbi,'escrowOf',[token]),
 ]);
 if(!same8(portal,PORTAL8)||!same8(actual,token)||!same8(registry,PORTAL8_CREATOR_REGISTRY)||!same8(bound,splitter)||control===zeroAddress)throw new FeeClaimError('Portal 8 fee identity mismatch.');
 const recipients=split[0].length?split[0]:[control],shares=split[0].length?split[1]:[10000];
 if(recipients.length!==shares.length||shares.reduce((n,b)=>n+b,0)!==10000)throw new FeeClaimError('Creator payout split is invalid.');
 let entitled=same8(control,wallet)||recipients.some(a=>same8(a,wallet));
 if(!entitled){
  const key=await read8<Hex>(rpc,block,PORTAL8_CREATOR_REGISTRY,identityAbi,'identityKeyOf',[token]);
  if(BigInt(key)!==0n)entitled=same8(await read8<Address>(rpc,block,PORTAL8_IDENTITY,identityAbi,'payoutOf',[key]),wallet);
 }
 if(!entitled)throw new FeeClaimError('This wallet is not a verified fee beneficiary. GitHub vault withdrawals require accepted identity verification.');
 const portal8:Portal8Claim={portal:PORTAL8,quote,payout,control,recipients:[...recipients],shares:[...shares]};
 return {token,portal:PORTAL8,splitter,quote,portal8};
}
export function assertPortal8Claim(splitter:string,call:{to?:string|null;data?:Hex;value?:bigint}){
 if(!call.to||!same8(call.to,splitter)||(call.value??0n)!==0n||call.data!==encodeFunctionData({abi:portal8ReadAbi,functionName:'claimCreator'}))throw new FeeClaimError('Invalid Portal 8 claim call.');
}
export function portal8ClaimAmounts(wallet:string,splitter:string,terms:Portal8Claim,logs:Parameters<typeof parseEventLogs>[0]['logs']){
 const events=parseEventLogs({abi:portal8ReadAbi,eventName:'CreatorClaimed',logs,strict:true}).filter(e=>same8(e.address,splitter));
 // claimCreator resolves mutable recipients at execution time. Canonical receipt
 // events are settlement evidence, not a reason to retain a completed wallet lease.
 const totals=new Map<string,bigint>();
 // Settlement records describe this wallet's receipts, not everyone else's payouts.
 for(const e of events){if(!same8(e.args.to,wallet))continue;const asset=(e.args.paidInQuoteFallback?terms.quote:terms.payout).toLowerCase();totals.set(asset,(totals.get(asset)??0n)+e.args.paidPayout);}
 return [...totals].filter(([,v])=>v>0n).map(([token,v])=>({token,raw:String(v)}));
}
