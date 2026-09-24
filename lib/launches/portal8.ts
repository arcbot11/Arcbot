import { decodeFunctionResult, encodeFunctionData, encodePacked, getAddress, getCreate2Address, keccak256, parseAbi, parseUnits, toHex, zeroAddress, type Abi, type Address, type Hex } from 'viem';
import abiJson from './portal8-abi.json';
import deployment from './portal8-deployment.json';
import type { LaunchReadRpc, LaunchPreview, LaunchStep, prepareLaunch } from './prepare';
import { parseLaunchInput, launchFingerprint, type LaunchInput } from './input';
import { LaunchError, PORTAL8_MAX_GAS, LAUNCH_TOTAL_GAS_WEI, LAUNCH_PREVIEW_MS, LAUNCH_FUNDING_MESSAGE } from './policy';
import { launchQuote, assertLaunchQuote, type LaunchQuote } from './quote';
import { checkArcRpc } from '../arc/rpc';
import { approvalAbi } from './contracts';
import { tradeSimulationFailure } from '../arc/trade-errors';
export const PORTAL8 = deployment.addresses.portal as Address;
export const PORTAL8_CREATOR_REGISTRY = deployment.addresses.creatorRegistry as Address;
export const PORTAL8_IDENTITY = deployment.addresses.identity as Address;
export const portal8Abi = abiJson as Abi;
export const portal8ReadAbi = parseAbi([
 'function escrowInitCodeHash(address) view returns(bytes32)',
 'function economicsFor(address) view returns(uint128 startFdvQuote,uint128 bondFdvQuote,uint8 decimals)',
 'function quoteRevoked(address) view returns(bool)',
 'function payoutOf(address) view returns(address)',
 'function payoutSplit(address) view returns(address[],uint16[])',
 'function escrowOf(address) view returns(address)',
 'function predict(bytes32,uint256) view returns(address)',
 'function token() view returns(address)', 'function portal() view returns(address)',
 'function creatorRegistry() view returns(address)', 'function quoteAsset() view returns(address)',
 'function payoutAsset() view returns(address)', 'function owedCreator() view returns(uint256)',
 'function claimCreator() returns(uint256)',
 'event CreatorClaimed(address indexed to,uint256 owedQuote,uint256 paidPayout,bool paidInQuoteFallback)',
]);
export const same8 = (a:string,b:string) => a.toLowerCase()===b.toLowerCase();
export async function read8<T>(rpc:Pick<LaunchReadRpc,'call'>, block:bigint, to:Address, abi:Abi, functionName:string, args:readonly unknown[]=[]):Promise<T>{
 return decodeFunctionResult({abi,functionName,data:await rpc.call({from:zeroAddress,to,value:0n,data:encodeFunctionData({abi,functionName,args})},block)}) as T;
}
export async function verifyPortal8(rpc:Pick<LaunchReadRpc,'code'|'call'>,block:bigint){
 await Promise.all((Object.keys(deployment.addresses) as Array<keyof typeof deployment.addresses>).map(async key=>{
  const code=await rpc.code(deployment.addresses[key] as Address,block);
  if(!code||keccak256(code)!==deployment.hashes[key])throw new LaunchError('PORTAL_CHANGED','Portal 8 deployment code changed.');
 }));
 for(const [method,key] of [['partsFactory','parts'],['hookFactory','hooks'],['creatorRegistry','creatorRegistry'],['registry','registry']] as const)
  if(!same8(await read8<string>(rpc,block,PORTAL8,portal8Abi,method),deployment.addresses[key]))throw new LaunchError('PORTAL_CHANGED','Portal 8 factory changed.');
}
export function encodePortal8Launch(input:LaunchInput,creator:Address,salt:Hex,quote:LaunchQuote):Hex {
 const p=parseLaunchInput(input);assertLaunchQuote(p.pairToken,parseUnits(p.devBuyUSDC,6),quote);
 const recipient=p.feeDestination;
 return encodeFunctionData({abi:portal8Abi,functionName:'launch',args:[{
  name:p.name,symbol:p.symbol,totalSupply:10n**27n,buyTaxBps:p.buyTaxBps,sellTaxBps:p.sellTaxBps,
  alloc:[p.creatorBps,p.burnBps,p.dividendBps,p.liquidityBps,0],quoteAsset:quote.address,payoutAsset:quote.address,kothBps:0,
  payoutAddress:recipient?.address??creator,identityProvider:recipient?.platform==='github'?toHex('github',{size:32}):toHex(0,{size:32}),
  identitySubject:recipient?.platform==='github'?BigInt(recipient.userId!):0n,
  bundle:[{to:creator,amountQuote:BigInt(quote.devBuy)}],snipeExempt:[],
  meta:{imageURI:p.imageURI,description:p.description,website:p.website,twitter:p.twitter,telegram:p.telegram},
 },salt]});
}
/** Escrow varies with the salt; patch the verified eleven-word constructor template locally. */
export function portal8Candidate(creator:Address,salt:Hex,template:Hex,escrowHash:Hex){
 const escrowSalt=keccak256(encodePacked(['string','address','bytes32'],['argus.v5.escrow',creator,salt]));
 const escrow=getCreate2Address({from:deployment.addresses.parts as Address,salt:keccak256(encodePacked(['address','bytes32'],[PORTAL8,escrowSalt])),bytecodeHash:escrowHash});
 const offset=template.length-352*2+64*2;
 if(offset<2||template.slice(offset,offset+64)!=='0'.repeat(64))throw new LaunchError('PORTAL_CHANGED','Hook template needs review.');
 const initHash=keccak256((template.slice(0,offset)+escrow.slice(2).toLowerCase().padStart(64,'0')+template.slice(offset+64)) as Hex);
 return {escrow,initHash,hook:getCreate2Address({from:deployment.addresses.hooks as Address,salt,bytecodeHash:initHash})};
}
export async function preparePortal8(options:Parameters<typeof prepareLaunch>[0]):Promise<LaunchPreview>{
 const {rpc,config,identity}=options,input=parseLaunchInput(options.input);
 if(options.reservedWei<0n||!/^0x[0-9a-f]{64}$/i.test(options.tokenSalt))throw new LaunchError('INVALID_INPUT','Invalid launch preparation terms.');
 if(options.activeTransaction)throw new LaunchError('WALLET_BUSY','A wallet transaction is pending.');
 let head=await checkArcRpc(rpc,config,options.now);await verifyPortal8(rpc,head.number);
 const quote=options.frozenQuote??await launchQuote(input.pairToken,parseUnits(input.devBuyUSDC,6),rpc,head.number);
 assertLaunchQuote(input.pairToken,parseUnits(input.devBuyUSDC,6),quote);
 const template=await read8<Hex>(rpc,head.number,PORTAL8,portal8Abi,'hookInitCodeTemplate',[quote.address,input.buyTaxBps,input.sellTaxBps]);
 const escrowHash=await read8<Hex>(rpc,head.number,deployment.addresses.parts as Address,portal8ReadAbi,'escrowInitCodeHash',[PORTAL8]);
 let salt=options.verifiedHook?.hookSalt??options.tokenSalt,candidate=portal8Candidate(identity.address,salt,template,escrowHash),found=false;
 for(let i=0;i<262144;i++){
  salt=toHex((BigInt(options.verifiedHook?.hookSalt??options.tokenSalt)+BigInt(i))%(1n<<256n),{size:32});
  candidate=portal8Candidate(identity.address,salt,template,escrowHash);
  if((BigInt(candidate.hook)&0x3fffn)===0x20ccn){found=true;break;}
  if(i%256===0)await new Promise<void>(r=>setTimeout(r,0));
 }
 if(!found)throw new LaunchError('MINING_LIMIT','Hook preparation reached its work limit.');
 head=await checkArcRpc(rpc,config,options.now);await verifyPortal8(rpc,head.number);
 const [hash,escrow,economics,revoked,floor,balance,nonce,pending,fees,allowance]=await Promise.all([
  read8<Hex>(rpc,head.number,PORTAL8,portal8Abi,'hookInitCodeHash',[identity.address,salt,quote.address,input.buyTaxBps,input.sellTaxBps]),
  read8<Address>(rpc,head.number,PORTAL8,portal8Abi,'predictEscrow',[identity.address,salt]),
  read8<readonly[bigint,bigint,number]>(rpc,head.number,deployment.addresses.registry as Address,portal8ReadAbi,'economicsFor',[quote.address]),
  read8<boolean>(rpc,head.number,deployment.addresses.registry as Address,portal8ReadAbi,'quoteRevoked',[quote.address]),
  read8<number>(rpc,head.number,PORTAL8,portal8Abi,'minSeedPpm'),
  rpc.balance(identity.address,head.number),rpc.nonce(identity.address,false),rpc.nonce(identity.address,true),rpc.fees(),
  read8<bigint>(rpc,head.number,quote.address,approvalAbi,'allowance',[identity.address,PORTAL8]),
 ]);
 if(hash!==candidate.initHash||!same8(escrow,candidate.escrow))throw new LaunchError('PREDICTION','Portal 8 prediction mismatch.');
 if(revoked||economics[0]<=0n||economics[1]<=economics[0]||economics[2]!==quote.decimals)throw new LaunchError('QUOTE_ASSET','Quote is not admitted by Portal 8.');
 const portalEconomics={start:String(economics[0]),bond:String(economics[1]),minSeedPpm:Number(floor)};
 if(options.verifiedHook && JSON.stringify(options.verifiedHook.portalEconomics)!==JSON.stringify(portalEconomics))throw new LaunchError('QUOTE_CHANGED','Portal economics changed. Prepare a new draft.');
 const buy=BigInt(quote.devBuy),minimum=(economics[1]*BigInt(floor)+999999n)/1000000n;
 if(buy<minimum)throw new LaunchError('DEV_BUY','Dev buy is below the current portal minimum for this quote asset. Increase it and prepare again.');
 if(buy>=1n<<128n)throw new LaunchError('DEV_BUY','Dev buy exceeds the contract limit.');
 if(input.feeDestination?.platform==='github'){
  const vault=await read8<Address>(rpc,head.number,PORTAL8_IDENTITY,portal8ReadAbi,'predict',[toHex('github',{size:32}),BigInt(input.feeDestination.userId!)]);
  if(!same8(vault,input.feeDestination.address))throw new LaunchError('FEE_RECIPIENT','GitHub fee vault changed.');
 }
 if(nonce!==pending)throw new LaunchError('WALLET_BUSY','Wallet has a pending transaction.');
 if(fees.maxFeePerGas<=0n||fees.maxFeePerGas>config.maxFeePerGas||fees.maxPriorityFeePerGas<0n||fees.maxPriorityFeePerGas>fees.maxFeePerGas)throw new LaunchError('GAS_LIMIT','Launch gas price exceeds policy.');
 for(const a of [candidate.escrow,candidate.hook])if((await rpc.code(a,head.number))?.replace(/^0x$/,''))throw new LaunchError('ALREADY_DEPLOYED','Reconcile the existing launch first.');
 const nativeBuy=input.pairToken==='USDC'?buy*10n**12n:0n,available=balance-options.reservedWei;
 if(available<=nativeBuy)throw new LaunchError('BALANCE',LAUNCH_FUNDING_MESSAGE);
 if(input.pairToken!=='USDC'&&await rpc.tokenBalance(quote.address,identity.address,head.number)<buy)throw new LaunchError('BALANCE','Not enough paired tokens for the creator buy.');
 const steps:LaunchStep[]=[];
 if(allowance<buy)steps.push({kind:'approval',call:{from:identity.address,to:quote.address,value:0n,data:encodeFunctionData({abi:approvalAbi,functionName:'approve',args:[PORTAL8,buy]})},gas:null,gasWei:null});
 steps.push({kind:'launch',call:{from:identity.address,to:PORTAL8,value:0n,data:encodePortal8Launch(input,identity.address,salt,quote)},gas:null,gasWei:null});
 let gasWei=0n;
 for(const step of steps){
  if(step.kind==='launch'&&steps.length>1)continue;
  let result:Hex,estimate:bigint;
  try { result=await rpc.call(step.call,head.number);estimate=await rpc.estimateGas(step.call,head.number); }
  catch(error){if(tradeSimulationFailure(error))throw new LaunchError('SIMULATION_REVERTED','Launch simulation was rejected by the contract. Review a new draft before continuing.');throw error;}
  const gas=(estimate*120n+99n)/100n;
  if(step.kind==='approval'&&!decodeFunctionResult({abi:approvalAbi,functionName:'approve',data:result}))throw new LaunchError('APPROVAL','Approval simulation failed.');
  if(step.kind==='launch'&&same8(String(decodeFunctionResult({abi:portal8Abi,functionName:'launch',data:result})),zeroAddress))throw new LaunchError('SIMULATION_REVERTED','Launch simulation returned zero token.');
  if(estimate<=0n||gas>(step.kind==='launch'?PORTAL8_MAX_GAS:config.maxGas))throw new LaunchError('GAS_LIMIT','Launch gas exceeds policy.');
  step.estimatedGas=String(estimate);step.gas=String(gas);step.gasWei=String(gas*fees.maxFeePerGas);gasWei+=BigInt(step.gasWei);
 }
 const setup=steps.length>1,fundingGas=setup?LAUNCH_TOTAL_GAS_WEI:gasWei;
 if(gasWei>LAUNCH_TOTAL_GAS_WEI)throw new LaunchError('GAS_LIMIT','Launch gas exceeds 0.5 USDC.');
 if(available<nativeBuy+fundingGas)throw new LaunchError('BALANCE',LAUNCH_FUNDING_MESSAGE);
 if((await rpc.block(head.number)).hash!==head.hash)throw new LaunchError('BLOCK_CHANGED','Block changed.');
 if(options.now===undefined&&Date.now()-Number(head.timestamp)*1000>config.maxHeadAgeSeconds*1000)throw new LaunchError('STALE_SIMULATION','Network checks took too long. Prepare again.');
 return {version:1,executionEnabled:false,portal:PORTAL8,creator:getAddress(identity.address),fingerprint:launchFingerprint(identity,input),tokenSalt:options.tokenSalt,hookSalt:salt,
  predictedToken:zeroAddress,predictedHook:candidate.hook,predictedSplitter:candidate.escrow,hookInitCodeHash:hash,rewardConfig:zeroAddress,quote,portalEconomics,
  block:String(head.number),blockHash:head.hash,nonce,createdAt:options.now??Date.now(),expiresAt:(options.now??Date.now())+LAUNCH_PREVIEW_MS,
  status:setup?'needs_setup':'simulated',steps,devBuyWei:String(nativeBuy),availableWei:String(available),gasWei:setup?null:String(gasWei),requiredWei:setup?null:String(nativeBuy+gasWei),
  ...(setup?{setupFundingWei:String(nativeBuy+fundingGas)}:{}),...(options.image?{image:options.image}:{}),maxFeePerGas:String(fees.maxFeePerGas),maxPriorityFeePerGas:String(fees.maxPriorityFeePerGas)};
}
