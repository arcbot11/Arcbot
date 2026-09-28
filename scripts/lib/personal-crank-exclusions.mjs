import fs from 'node:fs/promises';
import {assertCrankAllowed as guard} from '../../lib/fee-report/personal-crank-guard.mjs';
const manifestUrl=new URL('../../.deployment-private/personal-wallets.json',import.meta.url);
const exclusionsUrl=new URL('../../.deployment-private/personal-crank-exclusions.json',import.meta.url);
export async function assertCrankAllowed(splitter, suppliedClient, suppliedPolicy){
 const client=suppliedClient??(await import('../../lib/otc/runtime.ts')).chainClient(5042);
 const exclusions=suppliedPolicy?{tokens:suppliedPolicy.excludedTokens.map(address=>({address}))}:JSON.parse(await fs.readFile(exclusionsUrl,'utf8'));
 const wallets=suppliedPolicy?suppliedPolicy.wallets:Object.entries(JSON.parse(await fs.readFile(manifestUrl,'utf8'))).filter(([name])=>/^Personal[1-9]\d*$/i.test(name)).map(([,w])=>typeof w==='string'?w:w.address);
 if(!wallets.length||wallets.some(a=>!/^0x[\da-f]{40}$/i.test(a)))throw Error('Personal wallet manifest invalid; crank blocked.');
 await guard(splitter,client,{wallets,excludedTokens:exclusions.tokens.map(t=>t.address)});
}
