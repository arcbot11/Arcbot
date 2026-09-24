import {expect,it,vi} from 'vitest';
import {decodeFunctionData,encodeFunctionData,encodeFunctionResult,encodeEventTopics,encodeAbiParameters,parseAbiParameters,zeroAddress,type Hex,type Address} from 'viem';
import {PORTAL8,PORTAL8_CREATOR_REGISTRY,portal8ReadAbi} from '../lib/launches/portal8';
import {verifyPortal8Claim,assertPortal8Claim,portal8ClaimAmounts,type Portal8Claim} from '../lib/launches/portal8-claims';
import {dynamicLaunchAbi} from '../lib/arc/argus-discovery';
import type {ArcRpc} from '../lib/arc/rpc';
vi.mock('../lib/launches/portal8',async original=>({...await original<typeof import('../lib/launches/portal8')>(),verifyPortal8:vi.fn(async()=>{})}));
const wallet='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',splitter='0x3333333333333333333333333333333333333333',quote='0x3600000000000000000000000000000000000000';
function fixture(){
 const state={actual:token as Address,control:wallet as Address,recipients:[] as Address[],shares:[] as number[]};
 const rpc={code:async()=> '0x1234',call:vi.fn(async(c:{to:Address;data:Hex})=>{
  const abi=[...dynamicLaunchAbi,...portal8ReadAbi],{functionName:fn}=decodeFunctionData({abi,data:c.data});
  const results:Record<string,unknown>={launches:[wallet,splitter,wallet,1n,10,20,1n],token:state.actual,portal:PORTAL8,creatorRegistry:PORTAL8_CREATOR_REGISTRY,quoteAsset:quote,payoutAsset:quote,payoutOf:state.control,payoutSplit:[state.recipients,state.shares],escrowOf:splitter};
  if(!(fn! in results))throw Error('Unexpected '+fn);
  return encodeFunctionResult({abi,functionName:fn!,result:results[fn!]} as never);
 })} as unknown as ArcRpc;
 return {state,rpc};
}
it('authorizes the registered payout wallet rather than the original deployer',async()=>{
 const f=fixture();expect(await verifyPortal8Claim(wallet,token,f.rpc,1n)).toMatchObject({token,splitter,portal8:{control:wallet,recipients:[wallet]}});
});
it('authorizes a split beneficiary and pins the entire destination split',async()=>{
 const f=fixture();f.state.control=token;f.state.recipients=[wallet,token];f.state.shares=[3000,7000];
 expect(await verifyPortal8Claim(wallet,token,f.rpc,1n)).toMatchObject({portal8:{control:token,recipients:[wallet,token],shares:[3000,7000]}});
});
it('rejects a mismatched escrow identity',async()=>{const f=fixture();f.state.actual=wallet;await expect(verifyPortal8Claim(wallet,token,f.rpc,1n)).rejects.toThrow('identity mismatch');});
it('allows only claimCreator with zero value, never a crank or recipient override',()=>{
 const data=encodeFunctionData({abi:portal8ReadAbi,functionName:'claimCreator'});
 expect(()=>assertPortal8Claim(splitter,{to:splitter,data})).not.toThrow();
 expect(()=>assertPortal8Claim(splitter,{to:splitter,data,value:1n})).toThrow();
 expect(()=>assertPortal8Claim(splitter,{to:token,data})).toThrow();
 expect(()=>assertPortal8Claim(splitter,{to:splitter,data:(data+'00') as Hex})).toThrow();
});
function event(to:Address,amount:bigint,fallback=false){return {address:splitter as Address,blockHash:null,blockNumber:null,logIndex:null,transactionHash:null,transactionIndex:null,removed:false,topics:encodeEventTopics({abi:portal8ReadAbi,eventName:'CreatorClaimed',args:{to}}) as [Hex,...Hex[]],data:encodeAbiParameters(parseAbiParameters('uint256,uint256,bool'),[amount,amount,fallback])};}
it('records only this wallet receipts and preserves fallback currency',()=>{
 const terms:Portal8Claim={portal:PORTAL8,quote,payout:token,control:wallet,recipients:[wallet,token],shares:[3000,7000]};
 expect(portal8ClaimAmounts(wallet,splitter,terms,[event(wallet,30n,true),event(token,70n)])).toEqual([{token:quote,raw:'30'}]);
 expect(portal8ClaimAmounts(wallet,splitter,terms,[event(token,30n),event(wallet,70n)])).toEqual([{token,raw:'70'}]);
 expect(portal8ClaimAmounts(wallet,splitter,terms,[event(token,100n)])).toEqual([]);
 expect(portal8ClaimAmounts(wallet,splitter,terms,[])).toEqual([]);
});
