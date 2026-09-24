import {expect,it,vi} from 'vitest';
import {getAddress,decodeFunctionData,encodeFunctionData,encodeFunctionResult,toHex,zeroAddress,type Hex,type Address} from 'viem';
import live from './fixtures/portal8-live.json';
import deployment from '../lib/launches/portal8-deployment.json';
import {PORTAL8,portal8Abi,portal8ReadAbi,portal8Candidate,encodePortal8Launch} from '../lib/launches/portal8';
import {prepareLaunch,type LaunchReadRpc} from '../lib/launches/prepare';
import {parseLaunchInput,launchFingerprint} from '../lib/launches/input';
import {launchNativeSpend,launchGasLimit} from '../lib/launches/execution-checks';
import {approvalAbi} from '../lib/launches/contracts';
import {launchInputFromXCommand} from '../lib/launches/x-input';
import type {ArcConfig} from '../lib/arc/config';
vi.mock('viem',async original=>{
 const actual=await original<typeof import('viem')>();
 const d=(await import('../lib/launches/portal8-deployment.json')).default;
 return {...actual,keccak256:(v:Hex)=>/^0xff0[0-5]$/.test(v)?Object.values(d.hashes)[parseInt(v.slice(-1),16)]:actual.keccak256(v)};
});
const creator=live.creator as Address,salt=live.salt as Hex;
const fields={name:'Cat',symbol:'CAT',imageURI:'https://pbs.twimg.com/media/example.jpg'};
const quote={symbol:'USDC' as const,address:'0x3600000000000000000000000000000000000000' as Address,decimals:6,start:'2500000000',bond:'45000000000',devBuy:'4500000',block:'1'};
it('round-trips a mined Portal 8 transaction through the verified ABI',()=>{
 const decoded=decodeFunctionData({abi:portal8Abi,data:live.input as Hex});
 expect(encodeFunctionData({abi:portal8Abi,...decoded} as never)).toBe(live.input);
});
it('reproduces on-chain escrow and hook init-code predictions from a mined salt',()=>{
 const c=portal8Candidate(creator,salt,live.template as Hex,live.escrowHash as Hex);
 expect(c.escrow).toBe(live.escrow);expect(c.initHash).toBe(live.initHash);
 expect(BigInt(c.hook)&0x3fffn).toBe(0x20ccn);
});
it.each(['wallet','x','github'] as const)('encodes immutable %s assignment and a single full minimum buy',platform=>{
 const address='0x1111111111111111111111111111111111111111';
 const feeDestination={platform,address,recipient:platform==='wallet'?address:platform==='x'?'@alice':'https://github.com/alice',...(platform==='wallet'?{}:{userId:'123'})};
 const input=parseLaunchInput({...fields,feeDestination});
 const data=encodePortal8Launch(input,creator,salt,quote);
 const [p]=decodeFunctionData({abi:portal8Abi,data}).args as [{payoutAddress:string;identitySubject:bigint;identityProvider:Hex;bundle:unknown[];alloc:number[]},Hex];
 expect(p.payoutAddress.toLowerCase()).toBe(address);expect(p.identitySubject).toBe(platform==='github'?123n:0n);
 expect(p.identityProvider).toBe(platform==='github'?toHex('github',{size:32}):toHex(0,{size:32}));
 expect(p.bundle).toEqual([{to:getAddress(creator),amountQuote:4500000n}]);expect(p.alloc).toEqual([10000,0,0,0,0]);
 expect(launchNativeSpend({to:PORTAL8,data})).toBe(4500000000000000000n);
 expect(launchFingerprint({owner:'1',address:creator},input)).not.toBe(launchFingerprint({owner:'1',address:creator},parseLaunchInput(fields)));
});
it('requires the grounded assignment to match the saved identity',()=>{
 const command={kind:'launch' as const,launchMode:'argus' as const,...fields,feeDestination:{platform:'x' as const,address:creator,userId:'123',recipient:'@alice'}};
 expect(()=>launchInputFromXCommand(command,'launch Cat CAT; assign to @bob',fields.imageURI)).toThrow('not been resolved');
 expect(launchInputFromXCommand(command,'launch Cat CAT; assign to @alice',fields.imageURI).feeDestination?.userId).toBe('123');
});
function fixture(){
 const now=Date.now(),blockHash=toHex(1,{size:32}),abi=[...portal8Abi,...portal8ReadAbi,...approvalAbi];
 const state={allowance:4500000n,balance:100n*10n**18n,revoked:false,pending:1,badCode:false,revert:false};
 const call=vi.fn(async(tx:{to:Address;data:Hex})=>{
  const {functionName:fn,args=[]}=decodeFunctionData({abi,data:tx.data});let result:unknown;
  if(fn==='partsFactory')result=deployment.addresses.parts;
  else if(fn==='hookFactory')result=deployment.addresses.hooks;
  else if(fn==='creatorRegistry')result=deployment.addresses.creatorRegistry;
  else if(fn==='registry')result=deployment.addresses.registry;
  else if(fn==='hookInitCodeTemplate')result=live.template;
  else if(fn==='escrowInitCodeHash')result=live.escrowHash;
  else if(fn==='hookInitCodeHash')result=portal8Candidate(args[0] as Address,args[1] as Hex,live.template as Hex,live.escrowHash as Hex).initHash;
  else if(fn==='predictEscrow')result=portal8Candidate(args[0] as Address,args[1] as Hex,live.template as Hex,live.escrowHash as Hex).escrow;
  else if(fn==='economicsFor')result=[2500000000n,45000000000n,6];
  else if(fn==='quoteRevoked')result=state.revoked;
  else if(fn==='minSeedPpm')result=100;
  else if(fn==='allowance')result=state.allowance;
  else if(fn==='approve')result=true;
  else if(fn==='launch'){if(state.revert)throw Object.assign(Error('hidden'),{code:3});result=creator;}
  else throw Error('Unexpected call '+fn);
  return encodeFunctionResult({abi,functionName:fn!,result} as never);
 });
 const rpc:LaunchReadRpc={call,chainId:async()=>5042,block:async(number=10n)=>({number,hash:blockHash,timestamp:BigInt(Math.floor(now/1000))}),
  code:async address=>{const i=Object.values(deployment.addresses).findIndex(a=>a.toLowerCase()===address.toLowerCase());return i<0?undefined:state.badCode?'0x1234':`0xff0${i}` as Hex;},
  balance:async()=>state.balance,nonce:async(_a,p)=>p?state.pending:1,fees:async()=>({maxFeePerGas:10_000_000_000n,maxPriorityFeePerGas:1n}),
  decimals:async()=>6,tokenBalance:async()=>{throw Error('USDC double count');},estimateGas:async tx=>tx.to===PORTAL8?8000000n:60000n};
 const config:ArcConfig={rpcUrl:'https://unused.invalid',rpcFallbackUrls:[],readOnlyRpcUrls:[],checkpointNumber:1n,checkpointHash:blockHash,maxGas:5000000n,maxFeePerGas:100000000000n,maxHeadAgeSeconds:30};
 return {state,call,options:{identity:{owner:'1',address:creator},input:parseLaunchInput(fields),tokenSalt:salt,rpc,config,reservedWei:0n,activeTransaction:false,now}};
}
it('defaults new preparations to Portal 8 and simulates full-contract deployment under a bounded gas budget',async()=>{
 const f=fixture(),p=await prepareLaunch(f.options);expect(p.portal).toBe(PORTAL8);expect(p.predictedToken).toBe(zeroAddress);expect(p.status).toBe('simulated');
 expect(p.steps.map(s=>s.kind)).toEqual(['launch']);expect(p.steps[0].gas).toBe('9600000');
 expect(launchGasLimit({kind:'launch',preview:p} as never)).toBe(12000000n);
});
it('only simulates approval until the exact allowance is available',async()=>{
 const f=fixture();f.state.allowance=0n;const p=await prepareLaunch(f.options);expect(p.status).toBe('needs_setup');
 expect(p.steps.map(s=>s.kind)).toEqual(['approval','launch']);expect(p.steps[1].gas).toBeNull();
 expect(f.call.mock.calls.some(([c])=>decodeFunctionData({abi:[...portal8Abi,...portal8ReadAbi,...approvalAbi],data:c.data}).functionName==='launch')).toBe(false);
});
it.each(['badCode','revoked','pending','balance','revert'] as const)('fails closed on %s',async key=>{
 const f=fixture();if(key==='pending')f.state.pending=2;else if(key==='balance')f.state.balance=4500000000000000000n;else f.state[key]=true;
 await expect(prepareLaunch(f.options)).rejects.toThrow();
});
it('reuses accepted Portal 8 terms and rejects changed frozen economics',async()=>{
 const f=fixture(),first=await prepareLaunch(f.options);
 const next=await prepareLaunch({...f.options,verifiedHook:first,frozenQuote:first.quote});
 expect(next.hookSalt).toBe(first.hookSalt);expect(next.predictedSplitter).toBe(first.predictedSplitter);
 await expect(prepareLaunch({...f.options,verifiedHook:{...first,portalEconomics:{...first.portalEconomics!,bond:'46000000000'}},frozenQuote:first.quote})).rejects.toThrow('economics changed');
});
