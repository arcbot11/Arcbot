// Read-only partner API probes. Credentials remain in the server environment.
import fs from 'node:fs/promises';
const key=process.env.ARCDDICTED_API_KEY;
if(!key)throw Error('ARCDDICTED_API_KEY is not configured');
const prior=JSON.parse(await fs.readFile('docs/research/fee-report-checks-2026-09-28T20-11-10-901Z/all-results.json','utf8'));
const samples=prior.results.filter(r=>r.kind==='random-recent').map(r=>({symbol:r.report.assets.token.symbol,address:r.token,kind:'random-recent',launchTime:r.launchTime}));
samples.push(...JSON.parse(await fs.readFile('.deployment-private/radar-live-examples-20260928.json','utf8')).map(r=>({symbol:r.symbol,address:r.address,kind:'repeat'})));
samples.push({symbol:'CMC',address:'0xC162b1e2Fa18d3B5d6064d01D55Cedb1638DA826',kind:'repeat-control'});
const dir='docs/research/radar-checks-'+new Date().toISOString().replace(/[:.]/g,'-');
await fs.mkdir(dir,{recursive:true});
const results=[];
for(const [i,sample] of samples.entries()){
 if(!/^0x[0-9a-f]{40}$/i.test(sample.address))throw Error('Invalid address');
 const url=`https://api.arcddicted.com/api/partner/token/${sample.address.toLowerCase()}`;
 try{
  const response=await fetch(url,{method:'GET',headers:{'X-API-Key':key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>64000)throw Error('Response exceeds size cap');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  const body=Buffer.concat(chunks);
  if(body.includes(Buffer.from(key)))throw Error('Response unexpectedly contains credential; not saved');
  const file=`${i+1}-${sample.address.toLowerCase()}.json`;
  await fs.writeFile(`${dir}/${file}`,body);
  const result={...sample,url,status:response.status,checkedAt:new Date().toISOString(),file,rawBody:body.toString('utf8')};
  results.push(result);console.log(JSON.stringify(result));
  if(response.status===429)break;
 }catch{const result={...sample,error:'Request failed or response rejected; no credential-bearing diagnostics saved'};results.push(result);console.log(JSON.stringify(result));}
}
await fs.writeFile(`${dir}/all-results.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({output:dir}));
