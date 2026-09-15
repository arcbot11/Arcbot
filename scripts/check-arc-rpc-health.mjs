import {writeFileSync} from 'node:fs';
const source=[['primary',process.env.ARC_MAINNET_RPC_URL],['infura',process.env.ARC_INFURA_RPC_URL],['argus','https://arguspad.io/api/rpc'],['arcscan','https://rpc.arc-scan.org']];
const endpoints=[];
for(const [label,url] of source){if(!url)continue;const old=endpoints.find(e=>e.url.replace(/\/$/,'')===url.replace(/\/$/,''));if(old)old.labels.push(label);else endpoints.push({labels:[label],url,host:new URL(url).hostname});}
const rows=[],heads=new Map();const now=()=>new Date().toISOString();
const clean=s=>String(s??'').replace(/https?:\/\/[^\s"<>]+/g,'[URL]').slice(0,180);
async function probe(e,label,method,params){const start=Date.now();const row={provider:e.labels.join('/'),host:e.host,label,method,at:now()};let value;
try{const r=await fetch(e.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000)});row.http=r.status;row.type=r.headers.get('content-type');const text=await r.text();let b;try{b=JSON.parse(text);}catch{row.error='Non-JSON response';row.title=clean(text.match(/<title[^>]*>([^<]*)/i)?.[1]);}
if(b?.error){row.code=b.error.code;row.error=clean(b.error.message);}else if(b&&Object.hasOwn(b,'result')){value=b.result;row.ok=value!==null;if(value===null)row.error='Null result';else if(label==='latest'||label==='finalized'){row.block=Number(BigInt(value.number));row.timestamp=new Date(Number(BigInt(value.timestamp))*1000).toISOString();row.ageSeconds=Math.floor(Date.now()/1000)-Number(BigInt(value.timestamp));row.hash=value.hash;}else if(label==='chain')row.chainId=Number(BigInt(value));else if(label==='checkpoint')row.matches=value.hash?.toLowerCase()===process.env.ARC_CHECKPOINT_HASH?.toLowerCase();else if(label==='receipt')row.status=value.status;else if(label==='native gas estimate')row.gas=Number(BigInt(value));else if(label==='trace balance')row.outputBytes=(value.output?.length??2)/2-1;else row.resultBytes=typeof value==='string'?(value.length-2)/2:undefined;}
}catch(err){row.error=err.name;row.networkCode=err.cause?.code;}
row.ms=Date.now()-start;rows.push(row);console.log(JSON.stringify(row));return value;}
await Promise.all(endpoints.map(async e=>{const [,head]=await Promise.all([probe(e,'chain','eth_chainId',[]),probe(e,'latest','eth_getBlockByNumber',['latest',false])]);heads.set(e.url,head);}));
const owner='0x7d381d70e3cc6532fd5546e5439bc3d5cecd28dc',usdc='0x3600000000000000000000000000000000000000',argos='0xe86688530c456e099732f953ed7aa7c583026680';
const balanceData='0x70a08231'+owner.slice(2).padStart(64,'0');
await Promise.all(endpoints.map(async e=>{const head=heads.get(e.url);if(!head)return;const block=head.number;
const checks=[['finalized','eth_getBlockByNumber',['finalized',false]],['native balance','eth_getBalance',[owner,block]],['nonce','eth_getTransactionCount',[owner,'pending']],['USDC balance','eth_call',[{to:usdc,data:balanceData},block]],['ARGOS balance','eth_call',[{to:argos,data:balanceData},block]],['gas price','eth_gasPrice',[]],['native gas estimate','eth_estimateGas',[{from:owner,to:'0x1111111111111111111111111111111111111111',value:'0x0',data:'0x'},block]],['receipt','eth_getTransactionReceipt',['0x06bc14503c0e81ce1ad344b2af4ea12b914cc4cd454b3a5a84e11ad135f1117a']],['trace balance','trace_call',[{from:owner,to:argos,data:balanceData},['trace'],block]]];
if(process.env.ARC_CHECKPOINT_NUMBER&&process.env.ARC_CHECKPOINT_HASH)checks.push(['checkpoint','eth_getBlockByNumber',['0x'+BigInt(process.env.ARC_CHECKPOINT_NUMBER).toString(16),false]]);
for(let i=0;i<checks.length;i+=3)await Promise.all(checks.slice(i,i+3).map(([label,method,params])=>probe(e,label,method,params)));
}));
writeFileSync('docs/arc/rpc-health-2026-09-15.json',JSON.stringify({checkedAt:now(),rows},null,2));
