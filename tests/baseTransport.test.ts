import {expect,it,vi} from 'vitest';
import {retryBaseRateLimit} from '../lib/base/transport';
it('retries the Base JSON-RPC rate limit with bounded backoff',async()=>{
 const request=vi.fn().mockRejectedValueOnce({cause:{code:-32016,details:'over rate limit'}}).mockRejectedValueOnce({status:429}).mockResolvedValue('receipt');const pause=vi.fn().mockResolvedValue(undefined);
 await expect(retryBaseRateLimit(request,pause)).resolves.toBe('receipt');expect(pause.mock.calls).toEqual([[750],[1500]]);
});
it('stops after four rate-limited attempts',async()=>{
 const error={code:-32016};const request=vi.fn().mockRejectedValue(error),pause=vi.fn().mockResolvedValue(undefined);
 await expect(retryBaseRateLimit(request,pause)).rejects.toBe(error);expect(request).toHaveBeenCalledTimes(4);
});
it('does not retry reverts or ambiguous network errors',async()=>{
 for(const error of [new Error('execution reverted'),new Error('connection reset')]){const request=vi.fn().mockRejectedValue(error),pause=vi.fn();await expect(retryBaseRateLimit(request,pause)).rejects.toBe(error);expect(request).toHaveBeenCalledTimes(1);expect(pause).not.toHaveBeenCalled();}
});

import {createPublicClient} from 'viem';
import {baseConfig} from '../lib/base/config';
import {baseTransport} from '../lib/base/transport';
import {afterEach} from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
let serial=0;
function failoverFixture(primaryFails=true,wrongBackup=false){
 const checkpointHash='0x'+'a'.repeat(64),config=baseConfig({rpcUrl:`https://primary-${++serial}.example`,rpcFallbackUrls:[`https://backup-${serial}.example`],checkpointNumber:'10',checkpointHash});
 const requests:Array<{host:string;method:string}>=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
  const host=new URL(url).hostname,{method,params,id}=JSON.parse(String(options.body));requests.push({host,method});
  let result:unknown='0x42',error:unknown;
  if(method==='eth_chainId')result=wrongBackup&&host.startsWith('backup')?'0x1':'0x2105';
  else if(method==='eth_getBlockByNumber')result={number:params[0]==='latest'?'0x64':params[0],hash:checkpointHash,timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)};
  else if(method==='eth_sendRawTransaction')throw new Error('ambiguous connection reset');
  else if(primaryFails&&host.startsWith('primary'))error={code:-32016,message:'over rate limit'};
  return new Response(JSON.stringify({jsonrpc:'2.0',id,...(error?{error}:{result})}),{status:200,headers:{'content-type':'application/json'}});
 }));
 return {client:createPublicClient({transport:baseTransport(config)}),requests};
}
it('uses a checkpoint-verified backup when the primary rate limits reads',async()=>{
 const {client,requests}=failoverFixture();expect(await client.getBalance({address:'0x1111111111111111111111111111111111111111'})).toBe(66n);
 expect(requests.some(r=>r.host.startsWith('backup')&&r.method==='eth_getBalance')).toBe(true);
});
it('never reads funds from a backup on the wrong chain',async()=>{
 const {client,requests}=failoverFixture(true,true);await expect(client.getBalance({address:'0x1111111111111111111111111111111111111111'})).rejects.toThrow();
 expect(requests.some(r=>r.host.startsWith('backup')&&r.method==='eth_getBalance')).toBe(false);
});
it('does not fail over an ambiguous broadcast',async()=>{
 const {client,requests}=failoverFixture(false);await expect(client.sendRawTransaction({serializedTransaction:'0x02'})).rejects.toThrow();
 expect(requests.filter(r=>r.method==='eth_sendRawTransaction')).toHaveLength(1);
 expect(requests.some(r=>r.host.startsWith('backup'))).toBe(false);
});
