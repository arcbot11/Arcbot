import fs from 'node:fs/promises';
const checks=[];
async function check(name,url,method,params=[]) {try {const r=await fetch(url,{...(method?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}:{}),signal:AbortSignal.timeout(15000)});const value=await r.json();checks.push({name,httpStatus:r.status,value});}catch(e){checks.push({name,error:e.message})}}
await Promise.all([
check('rpc.chainId','https://arcexplorer.org/rpc','eth_chainId'),
check('rpc.latest','https://arcexplorer.org/rpc','eth_getBlockByNumber',['latest',false]),
check('index.latest','https://www.arcexplorer.org/api/v1/blocks?limit=1'),
check('argus.rpc.chainId','https://rpc.arc-scan.org','eth_chainId')]);
for(const c of checks)if(c.name==='rpc.latest'&&c.value?.result){const b=c.value.result;c.value={number:b.number,hash:b.hash,timestamp:b.timestamp,ageSeconds:Math.floor(Date.now()/1000)-Number(BigInt(b.timestamp)),baseFeePerGas:b.baseFeePerGas}}
const evidence={observedAt:new Date().toISOString(),checks};await fs.writeFile('docs/arc/mainnet-refresh-2026-09-09.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
