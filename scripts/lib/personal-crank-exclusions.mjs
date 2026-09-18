import fs from 'node:fs/promises';
import {parseAbi} from 'viem';
const manifestUrl=new URL('../../.deployment-private/personal-wallets.json',import.meta.url);
const exclusionsUrl=new URL('../../.deployment-private/personal-crank-exclusions.json',import.meta.url);
const abi=parseAbi(['function token() view returns(address)','function balanceOf(address) view returns(uint256)']);
export async function assertCrankAllowed(splitter, suppliedClient){
 const client=suppliedClient??(await import('../../lib/otc/runtime.ts')).chainClient(5042);
 const token=await client.readContract({address:splitter,abi,functionName:'token'});
 const exclusions=JSON.parse(await fs.readFile(exclusionsUrl,'utf8'));
 if(exclusions.tokens.some(t=>t.address.toLowerCase()===token.toLowerCase()))throw Error('Crank blocked: token is on the personal-wallet holdings exclusion list.');
 const wallets=Object.entries(JSON.parse(await fs.readFile(manifestUrl,'utf8'))).filter(([name])=>/^Personal[1-9]\d*$/i.test(name)).map(([,w])=>typeof w==='string'?w:w.address);
 if(!wallets.length||wallets.some(a=>!/^0x[\da-f]{40}$/i.test(a)))throw Error('Personal wallet manifest invalid; crank blocked.');
 const results=await client.multicall({multicallAddress:'0xcA11bde05977b3631167028862bE2a173976CA11',contracts:wallets.map(address=>({address:token,abi,functionName:'balanceOf',args:[address]}))});
 if(results.length!==wallets.length||results.some(r=>r.status!=='success'||typeof r.result!=='bigint'))throw Error('Personal wallet holdings could not be verified; crank blocked.');
 if(results.some(r=>r.result>0n))throw Error('Crank blocked: a personal wallet currently holds this token.');
}
