import {parseAbi} from 'viem';
const abi=parseAbi(['function token() view returns(address)','function balanceOf(address) view returns(uint256)']);
const validAddress=a=>typeof a==='string'&&/^0x[\da-f]{40}$/i.test(a);

// Server callers must supply their persisted policy. No local-file fallback:
// private operator manifests must never enter the website dependency graph.
export async function assertCrankAllowed(splitter, client, policy){
 if(!policy||!Array.isArray(policy.wallets)||!policy.wallets.length||policy.wallets.some(a=>!validAddress(a))||!Array.isArray(policy.excludedTokens)||policy.excludedTokens.some(a=>!validAddress(a)))throw Error('Personal wallet policy invalid; crank blocked.');
 const token=await client.readContract({address:splitter,abi,functionName:'token'});
 if(!validAddress(token))throw Error('Splitter token invalid; crank blocked.');
 if(policy.excludedTokens.some(a=>a.toLowerCase()===token.toLowerCase()))throw Error('Crank blocked: token is on the personal-wallet holdings exclusion list.');
 const results=await client.multicall({multicallAddress:'0xcA11bde05977b3631167028862bE2a173976CA11',contracts:policy.wallets.map(address=>({address:token,abi,functionName:'balanceOf',args:[address]}))});
 if(results.length!==policy.wallets.length||results.some(r=>r.status!=='success'||typeof r.result!=='bigint'))throw Error('Personal wallet holdings could not be verified; crank blocked.');
 if(results.some(r=>r.result>0n))throw Error('Crank blocked: a personal wallet currently holds this token.');
}
