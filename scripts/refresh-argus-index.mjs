// Read-only chain scan. --write updates the local catalog; never signs transactions.
import fs from 'node:fs/promises';
import {parseAbi,getAddress} from 'viem';
import {chainClient} from '../lib/otc/runtime.ts';
import {createArcRpc,checkArcRpc} from '../lib/arc/rpc.ts';
import {arcConfigFromEnv} from '../lib/arc/config.ts';
import {ARGUS_PORTALS,ARGUS_DYNAMIC_PORTAL,discoverArgusPool} from '../lib/arc/argus-discovery.ts';
const c=chainClient(5042),config=arcConfigFromEnv(),rpc=createArcRpc(config),head=await checkArcRpc(rpc,config),blockNumber=head.number;
const abi=parseAbi(['function tokenCount() view returns(uint256)','function allTokens(uint256) view returns(address)','function symbol() view returns(string)','function name() view returns(string)','function decimals() view returns(uint8)']);
const catalogPath='lib/arc/token-catalog.json',old=JSON.parse(await fs.readFile(catalogPath,'utf8')),excluded=new Set([...JSON.parse(await fs.readFile('lib/arc/excluded-catalog-addresses.json','utf8')),...JSON.parse(await fs.readFile('lib/retired-token-addresses.json','utf8'))].map(a=>a.toLowerCase()));
const report={mode:process.argv.includes('--older-only')?'older-portals':'all-portals',at:new Date().toISOString(),block:String(blockNumber),portals:[],enumerated:0,added:[],excluded:0,duplicateSymbols:0,invalid:0,failed:[],dynamic:[]};
const candidates=new Map(), marketMetrics=new Map();
const includeTopArc=process.argv.includes('--top-arc');
const requested=new Map(process.argv.includes('--older-only')?[]:[
 ['0x8dc7b0ade2c3224874d413e0de86757d0fcd4038','ARCDD'],
 ['0xe86688530c456e099732f953ed7aa7c583026680','ARGOS'],
]);
const olderOnly=process.argv.includes('--older-only'),marketScan=process.argv.includes('--market-scan');
async function batches(items,size,fn){let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<items.length){const start=next;next+=size;await fn(items.slice(start,start+size),start);}}));}
async function multi(contracts){const rows=await c.multicall({contracts,blockNumber,multicallAddress:'0xcA11bde05977b3631167028862bE2a173976CA11',batchSize:100000,allowFailure:true});return rows;}
for(const p of marketScan?[]:ARGUS_PORTALS){
 const count=Number(await c.readContract({address:p.address,abi,functionName:'tokenCount',blockNumber}));
 if(!Number.isSafeInteger(count)||count>500000)throw Error('Unexpected portal count');
 report.portals.push({address:p.address,count});console.log(JSON.stringify({portal:p.address,count}));
 await batches(Array.from({length:count},(_,i)=>i),400,async ids=>{
  const results=await multi(ids.map(i=>({address:p.address,abi,functionName:'allTokens',args:[BigInt(i)]})));
  results.forEach((r,i)=>{if(r.status!=='success')throw Error('Incomplete portal enumeration at '+ids[i]);candidates.set(r.result.toLowerCase(),{portal:p.address,index:ids[i]});});
 });
}
// The new family does not expose allTokens. Explorer logs are candidates only;
// confirm each creation log against its canonical receipt before admission.
let offset=0;const dynamic=new Set(),launchLogs=new Map();
for(let page=0;!olderOnly&&page<100;page++){
 const res=await fetch(`https://www.arcexplorer.org/api/v1/addresses/${ARGUS_DYNAMIC_PORTAL}/logs?limit=100&offset=${offset}`,{signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('Dynamic launch log index unavailable');const data=await res.json();if(!Array.isArray(data.items))throw Error('Malformed log index');
 for(const l of data.items){if(l.topics?.[0]!=='0xc32e25061af0b7f7d77b7fb015333ecb0004127b71abbda4d7ba4c18bcd497f3'||BigInt(l.blockNumber)>blockNumber)continue;
  const indexedAddress=('0x'+l.topics[1].slice(-40)).toLowerCase();
  if(old.some(t=>t.address.toLowerCase()===indexedAddress))continue;
  launchLogs.set(indexedAddress,l);
 }
 if(data.nextOffset==null)break;if(data.nextOffset<=offset||page===99)throw Error('Incomplete dynamic pagination');offset=data.nextOffset;
}
console.log(JSON.stringify({newDynamicLaunches:launchLogs.size}));
// Screen market data first; verify qualifying candidates against deployed portals.
// This also covers older-portal launches missing from a previous enumeration.
const { screenArgusPool, preferDeeperPool }=await import('./lib/argus-index-screen.mjs');
let scannedPools=0;
for(let offset=0;offset<10000;offset+=100){
 const response=await fetch('https://www.arcexplorer.org/api/v1/dex/pools?sort=marketCap&order=desc&limit=100&offset='+offset,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Market screen unavailable: HTTP '+response.status);
 const page=await response.json();if(!Array.isArray(page.items)||!Number.isSafeInteger(page.matchingPools))throw Error('Invalid market index');
 scannedPools+=page.items.length;
 for(const pool of page.items){const address=pool.baseToken?.address?.toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(address??''))continue;marketMetrics.set(address,preferDeeperPool(marketMetrics.get(address),pool));}
 if(offset+page.items.length>=page.matchingPools)break;
 if(page.items.length!==100||offset===9900)throw Error('Incomplete market pagination');
}
report.marketSource='Arc Explorer USD-anchored pools';report.coverage='Tokens without explorer market metrics remain unassessed, not below-threshold.';report.scannedPools=scannedPools;report.screen={minVolume24hUsd:1000,minLiquidityUsd:500,minTrades:10,minVolumeToMarketCap:0.01};report.screenedOut=0;report.unverified=[];report.verifiedMarkets=[];
let verifiedDynamic=0;
report.newDynamicLaunches=launchLogs.size;
report.unassessedDynamic=[...launchLogs.keys()].filter(a=>!requested.has(a)&&!marketMetrics.get(a));
report.belowThresholdDynamic=[...launchLogs.keys()].filter(a=>!requested.has(a)&&marketMetrics.get(a)&&!screenArgusPool(marketMetrics.get(a)));
const eligibleLogs=[...launchLogs].filter(([a])=>!excluded.has(a)&&(requested.has(a)||screenArgusPool(marketMetrics.get(a)))).map(([,log])=>log);
console.log(JSON.stringify({eligibleDynamic:eligibleLogs.length,unassessedDynamic:report.unassessedDynamic.length,belowThresholdDynamic:report.belowThresholdDynamic.length}));
await batches(eligibleLogs,1,async ([l])=>{
  const receipt=await c.getTransactionReceipt({hash:l.transactionHash});
  const exact=receipt.logs.find(e=>e.logIndex===l.logIndex&&e.address.toLowerCase()===ARGUS_DYNAMIC_PORTAL&&e.data===l.data&&JSON.stringify(e.topics)===JSON.stringify(l.topics));
  if(receipt.status!=='success'||!exact||(await c.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('Unverified dynamic launch log');
  const token=getAddress('0x'+l.topics[1].slice(-40));const found=await discoverArgusPool(token,rpc,blockNumber);
  if(found?.portal!==ARGUS_DYNAMIC_PORTAL)throw Error('Dynamic launch identity mismatch');
  candidates.set(token.toLowerCase(),{portal:ARGUS_DYNAMIC_PORTAL,poolId:found.poolId});dynamic.add(token.toLowerCase());
  if(++verifiedDynamic%100===0)console.log(JSON.stringify({verifiedDynamic,total:launchLogs.size}));
});
const topArc=new Set(includeTopArc?[...marketMetrics].filter(([,p])=>screenArgusPool(p)).sort(([,a],[,b])=>(b.marketCapUsd??b.fdvUsd)-(a.marketCapUsd??a.fdvUsd)).slice(0,100).map(([a])=>a):[]);
for(const [address,pool]of marketMetrics){
 if(old.some(t=>t.address.toLowerCase()===address)||excluded.has(address))continue;
 const metrics=screenArgusPool(pool);if(!metrics){report.screenedOut++;continue;}
 const found=await discoverArgusPool(getAddress(address),rpc,blockNumber);
 if(!found){if(topArc.has(address)){candidates.set(address,{argus:false});report.verifiedMarkets.push({address,...metrics,argus:false});}else report.unverified.push(address);continue;}
 if(olderOnly&&found.portal===ARGUS_DYNAMIC_PORTAL)continue;
 candidates.set(address,{portal:found.portal,poolId:found.poolId});report.verifiedMarkets.push({address,...metrics,portal:found.portal,poolId:found.poolId});
}
report.requested=[];
for(const [address,symbol] of requested){
 if(excluded.has(address))throw Error('Requested token is excluded: '+symbol);
 const [actual,decimals,code]=await Promise.all([c.readContract({address,abi,functionName:'symbol',blockNumber}),c.readContract({address,abi,functionName:'decimals',blockNumber}),c.getBytecode({address,blockNumber})]);
 if(actual.trim().toUpperCase()!==symbol||!code||code==='0x'||!Number.isInteger(Number(decimals)))throw Error('Requested token identity mismatch: '+symbol);
 const found=await discoverArgusPool(getAddress(address),rpc,blockNumber);
 if(!found)throw Error('Requested Argus launch identity unavailable: '+symbol);
 candidates.set(address,{portal:found.portal,poolId:found.poolId});
 report.requested.push({address,symbol,portal:found.portal});
}
report.enumerated=candidates.size;
await fs.mkdir('.deployment-private',{recursive:true});await fs.writeFile(marketScan?'.deployment-private/argus-market-candidates.json':'.deployment-private/argus-index-candidates.json',JSON.stringify({block:String(blockNumber),candidates:[...candidates]}));
console.log(JSON.stringify({enumerated:candidates.size,dynamic:dynamic.size}));
const known=new Map(old.map(t=>[t.address.toLowerCase(),t])),symbols=new Set(old.map(t=>t.symbol.trim().toUpperCase()));
const additions=[];
// Screen every ordinary addition, including the dynamic family. Explicitly
// requested tokens still require identity verification. Keep selection stable
// across concurrent RPC completion, without replacing existing ticker identities.
const portalRank=new Map([...ARGUS_PORTALS.map(p=>p.address),ARGUS_DYNAMIC_PORTAL].map((a,i)=>[a,i]));
const pending=[...candidates].filter(([a])=>(requested.has(a)||dynamic.has(a)||report.verifiedMarkets.some(t=>t.address===a))&&!known.has(a)).sort(([a,x],[b,y])=>Number(requested.has(b))-Number(requested.has(a))||((screenArgusPool(marketMetrics.get(b))?.marketCapUsd??0)-(screenArgusPool(marketMetrics.get(a))?.marketCapUsd??0))||((portalRank.get(y.portal)??-1)-(portalRank.get(x.portal)??-1))||((y.index??0)-(x.index??0))||a.localeCompare(b));
const metadata=new Map();
await batches(pending,200,async batch=>{
 const rows=await multi(batch.map(([address])=>({address,abi,functionName:'symbol'})));
 rows.forEach((r,i)=>{if(r.status==='success'&&typeof r.result==='string')metadata.set(batch[i][0],r.result);else report.failed.push(batch[i][0]);});
});
for(const [address,source]of pending){
 const raw=metadata.get(address);if(raw===undefined)continue;const symbol=raw.trim().normalize('NFKC').toUpperCase();
 if(excluded.has(address)||/^\$*USDC$/.test(symbol.replace(/[\s\u200B-\u200D\uFEFF]/g,''))){report.excluded++;continue;}
 if(!symbol||symbol.length>32||/[\u0000-\u001f\u007f<>]/.test(symbol)){report.invalid++;continue;}
 if(symbols.has(symbol)){report.duplicateSymbols++;continue;}symbols.add(symbol);additions.push({address,symbol,...source});
}
await batches(additions,150,async batch=>{
 const rows=await multi(batch.flatMap(({address})=>['name','decimals'].map(functionName=>({address,abi,functionName}))));
 batch.forEach((t,i)=>{const [name,decimals]=rows.slice(i*2,i*2+2);if(name.status!=='success'||decimals.status!=='success'){report.failed.push(t.address);return;}
  known.set(t.address,{chainId:5042,address:t.address,symbol:t.symbol,name:name.result,decimals:Number(decimals.result),marketCapUsd:screenArgusPool(marketMetrics.get(t.address))?.marketCapUsd??null,snapshotAt:report.at,argus:t.argus!==false,...(t.portal?{portal:t.portal}:{}),...(t.poolId?{poolId:t.poolId}: {})});report.added.push(t.address);
 });
});
for(const address of dynamic){const t=known.get(address);report.dynamic.push({address,symbol:metadata.get(address)??t?.symbol,indexed:!!t});if(t)known.set(address,{...t,...candidates.get(address),argus:true,snapshotAt:report.at});}
if((await rpc.block(blockNumber)).hash!==head.hash)throw Error('Index snapshot changed');
report.catalogCount=known.size;report.written=process.argv.includes('--write');
for(const [address,symbol] of requested)if(known.get(address)?.symbol!==symbol)throw Error('Requested token was not indexed: '+symbol);
report.argusCount=[...known.values()].filter(t=>t.argus).length;
await fs.writeFile('.deployment-private/argus-refresh-catalog-preview.json',JSON.stringify([...known.values()],null,2)+'\n');
if(report.written){await fs.writeFile(catalogPath+'.next',JSON.stringify([...known.values()],null,2)+'\n');await fs.rename(catalogPath+'.next',catalogPath);}
await fs.writeFile(olderOnly?'.deployment-private/argus-older-index-refresh-report.json':'.deployment-private/argus-index-refresh-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({at:report.at,block:report.block,catalogCount:report.catalogCount,argusCount:report.argusCount,added:report.added.length,failed:report.failed.length,duplicateSymbols:report.duplicateSymbols,unassessedDynamic:report.unassessedDynamic.length,written:report.written}));
