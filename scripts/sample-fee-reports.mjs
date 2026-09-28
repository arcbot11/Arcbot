// Read-only live report samples. Never loads a signer or enables a service.
import fs from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { createPublicClient } from 'viem';
import { arcConfigFromEnv, arcChain } from '../lib/arc/config.ts';
import { arcTransport } from '../lib/arc/transport.ts';
import { ARGUS_DYNAMIC_PORTAL } from '../lib/arc/argus-discovery.ts';
import { readFeeReport } from '../lib/fee-report/read.ts';

const dir = 'docs/research/fee-report-checks-' + new Date().toISOString().replace(/[:.]/g, '-');
await fs.mkdir(dir, { recursive: true });
const config = arcConfigFromEnv();
const client = createPublicClient({ chain: arcChain(config), transport: arcTransport(config) });
const launches = new Map();
let offset = 0;
for (let page = 0; page < 10 && launches.size < 20; page++) {
  const response = await fetch(`https://www.arcexplorer.org/api/v1/addresses/${ARGUS_DYNAMIC_PORTAL}/logs?limit=100&offset=${offset}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`Launch index HTTP ${response.status}`);
  const data = await response.json();
  for (const log of data.items ?? []) {
    if (log.topics?.[0] !== '0xc32e25061af0b7f7d77b7fb015333ecb0004127b71abbda4d7ba4c18bcd497f3') continue;
    const token = ('0x' + log.topics[1].slice(-40)).toLowerCase();
    launches.set(token, log);
  }
  if (data.nextOffset == null) break;
  offset = data.nextOffset;
}
const candidates = [...launches].sort((a,b) => Number(BigInt(b[1].blockNumber)-BigInt(a[1].blockNumber))).slice(0,20);
if (candidates.length < 3) throw Error('Not enough recent launches');
const selected = [];
while (selected.length < 3) selected.push(candidates.splice(randomInt(candidates.length),1)[0]);
const samples = [];
for (const [token, log] of selected) {
  const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (receipt.status !== 'success' || block.hash !== receipt.blockHash || !receipt.logs.some(e => e.address.toLowerCase() === ARGUS_DYNAMIC_PORTAL.toLowerCase() && e.logIndex === log.logIndex && e.data === log.data && JSON.stringify(e.topics) === JSON.stringify(log.topics))) throw Error('Launch receipt verification failed');
  samples.push({ kind:'random-recent', token, launchBlock:String(receipt.blockNumber), launchTime:new Date(Number(block.timestamp)*1000).toISOString(), launchTransaction:log.transactionHash });
}
samples.push(...[
  ['ARGOS','0xe86688530c456e099732f953ed7aa7c583026680'],
  ['ARCDD','0x8dc7b0ade2c3224874d413e0de86757d0fcd4038'],
  ['ARGUS','0xece5ca8bf9220718e5727754026757512212cb3c'],
].map(([label,token])=>({kind:'repeat',label,token})));
const results = await Promise.all(samples.map(async (sample,i) => {
  const report = await readFeeReport({ token:sample.token });
  const file = `${String(i+1).padStart(2,'0')}-${sample.token}.json`;
  await fs.writeFile(`${dir}/${file}`,JSON.stringify(report,null,2)+'\n');
  const result = {...sample,file,status:report.status,report};
  console.log(JSON.stringify({file,status:report.status,token:sample.token}));
  return result;
}));
await fs.writeFile(`${dir}/all-results.json`, JSON.stringify({mode:'local fee-report reader against live Arc RPC; no HTTP payment path or wallet operations',selection:'three random selections without replacement from the twenty newest creation events returned by the portal explorer index; selected receipts verified on-chain',at:new Date().toISOString(),results},null,2)+'\n');
console.log(JSON.stringify({output:dir}));
