import fs from 'node:fs/promises';
import {formatUnits,parseAbi,getAddress} from 'viem';
import {chainClient} from '../lib/otc/runtime.ts';
import {repository} from '../lib/otc/repository.ts';
import {locked,walletId} from '../lib/otc/model.ts';
import {createArcRpc,checkArcRpc} from '../lib/arc/rpc.ts';
import {arcConfigFromEnv} from '../lib/arc/config.ts';
process.env.DISABLE_CDP_ERROR_REPORTING='true';process.env.DISABLE_CDP_USAGE_TRACKING='true';
const {CdpClient}=await import('@coinbase/cdp-sdk');
const cdp=new CdpClient({apiKeyId:process.env.CDP_API_KEY_ID,apiKeySecret:process.env.CDP_API_KEY_SECRET,walletSecret:process.env.CDP_WALLET_SECRET});
const token=getAddress('0xe86688530C456E099732f953ed7aA7C583026680');
try{
 const manifest=JSON.parse(await fs.readFile(new URL('../.deployment-private/personal-wallets.json',import.meta.url),'utf8'));
 const cfg=arcConfigFromEnv(),head=await checkArcRpc(createArcRpc(cfg),cfg),client=chainClient(5042),repo=repository();
 const abi=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)']);
 const [decimals,symbol]=await Promise.all(['decimals','symbol'].map(functionName=>client.readContract({address:token,abi,functionName,blockNumber:head.number})));
 if(decimals!==18||symbol!=='ARGOS')throw Error('Token metadata mismatch');
 const rows=[];
 for(let i=1;i<=8;i++){
  const name=`Personal${i}`;
  try{
   const a=await cdp.evm.getAccount({name}),entry=manifest[name],expected=typeof entry==='string'?entry:entry?.address;
   if(!expected||a.address.toLowerCase()!==expected.toLowerCase())throw Error('Account mismatch');
   const [usdc,tokens,w]=await Promise.all([client.getBalance({address:a.address,blockNumber:head.number}),client.readContract({address:token,abi,functionName:'balanceOf',args:[a.address],blockNumber:head.number}),repo.read({id:walletId(5042,a.address)})]);
   const available=usdc-(w?locked(w):0n);
   rows.push({name,address:a.address,usdc:formatUnits(usdc,18),argos:formatUnits(tokens,18),halfArgos:formatUnits(tokens/2n,18),availableUSDC:formatUnits(available>0n?available:0n,18),activeTransaction:!!w?.activeTx});
  }catch{rows.push({name,error:'Balance/account read failed'});}
 }
 if((await client.getBlock({blockNumber:head.number})).hash!==head.hash)throw Error('Snapshot changed');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),block:head.number.toString(),token,rows},null,2));
}catch{console.error('Verified balance snapshot unavailable. No transactions were performed.');process.exitCode=1;}
