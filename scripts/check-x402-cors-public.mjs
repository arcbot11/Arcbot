// No wallet credentials, payment proofs or blockchain writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const results=[],origin='https://www.argosbot.io';
async function check(url,method='OPTIONS',status=204){
  const r=await fetch(url,{method,headers:{Origin:origin,'Access-Control-Request-Headers':'authorization,content-type,payment-signature,payment-transaction','Access-Control-Request-Method':url.includes('/lookup')?'GET':'POST'},signal:AbortSignal.timeout(20000)});
  const h=Object.fromEntries(r.headers),row={url,method,status:r.status,headers:h};
  try{assert.equal(r.status,status);assert.equal(r.headers.get('access-control-allow-origin'),'*');for(const name of['authorization','payment-signature','payment-transaction'])assert.ok(r.headers.get('access-control-allow-headers')?.toLowerCase().includes(name));assert.ok(r.headers.get('access-control-expose-headers')?.toLowerCase().includes('payment-response'));assert.ok(!r.headers.has('access-control-allow-credentials'));row.pass=true;}catch(e){row.pass=false;row.error=e.message;}results.push(row);console.log(`${row.pass?'PASS':'FAIL'} ${method} ${url}`);
}
for(const path of['/v1/lookup','/v1/lookup/direct','/v1/jobs','/v1/jobs/direct','/v1/authorization','/a2a','/v1/jobs/ab_'+ 'f'.repeat(48)+'/next'])await check('https://bridge-api.argosbot.io'+path);
for(const path of['/api/v1/bridge/lookup','/api/v1/bridge/lookup/direct'])await check(origin+path);
await check('https://arcus-api.argosbot.io/v1/lookup');
for(const url of['https://bridge-api.argosbot.io/v1/lookup','https://arcus-api.argosbot.io/v1/lookup',origin+'/api/v1/bridge/lookup',origin+'/api/v1/bridge/lookup/direct'])await check(url+'?token=invalid','GET',400);
const internal=await fetch('https://bridge-api.argosbot.io/internal/poll',{method:'OPTIONS',headers:{Origin:origin}});results.push({name:'internal worker remains private',status:internal.status,pass:internal.status===405&&!internal.headers.has('access-control-allow-origin')});
await fs.mkdir('docs/research',{recursive:true});await fs.writeFile('docs/research/x402-cors-fixed-2026-10-29.json',JSON.stringify({at:new Date().toISOString(),results},null,2));assert.ok(results.every(r=>r.pass),'Public CORS regression');console.log(`Passed ${results.length}/${results.length} public CORS checks.`);
