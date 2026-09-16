import {afterEach,expect,it,vi} from 'vitest';
import {createPublicClient} from 'viem';
import {arcConfigFromEnv} from '../lib/arc/config';
import {roleEndpoints} from '../lib/arc/rpc-role';
import {arcTransport,clearArcTransportCache} from '../lib/arc/transport';
import {clearArcRpcPacing} from '../lib/arc/rpc-pacing';
const primary='https://primary.example',drpc='https://lb.drpc.live/arc/test',fallback='https://fallback.example',hash=`0x${'12'.repeat(32)}`;
const env={ARC_MAINNET_RPC_URL:primary,ARC_DRPC_HTTP_URL:drpc,ARC_DRPC_API_KEY:'test-only-key',ARC_RPC_FALLBACK_URLS:fallback,ARC_CHECKPOINT_NUMBER:'1',ARC_CHECKPOINT_HASH:hash};
afterEach(()=>{clearArcTransportCache();clearArcRpcPacing();vi.unstubAllGlobals();});
it('prioritizes dRPC for reads, preparation and receipts, retaining primary-first broadcast',()=>{
 const c=arcConfigFromEnv(env);
 for(const role of ['quote','execution','receipt'] as const)expect(roleEndpoints(c,role,'eth_call')).toEqual([drpc,primary,fallback]);
 expect(roleEndpoints(c,'broadcast','eth_sendRawTransaction')).toEqual([primary,drpc,fallback]);
});
it('rejects an unrelated endpoint before attaching a dRPC key',()=>{
 expect(()=>arcConfigFromEnv({...env,ARC_DRPC_HTTP_URL:'https://drpc.live.attacker.example'})).toThrow();
 expect(()=>arcConfigFromEnv({...env,ARC_DRPC_HTTP_URL:'http://lb.drpc.live/arc'})).toThrow();
});
it('scopes authentication to dRPC and fails over an unavailable read without forwarding its key',async()=>{
 const calls:{url:string;headers:Record<string,string>;redirect?:string}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
  calls.push({url,headers:init.headers,redirect:init.redirect});
  if(url===drpc)return new Response('',{status:401});
  const {method}=JSON.parse(init.body);
  const result=method==='eth_chainId'?'0x13b2':method==='eth_getBlockByNumber'?{number:'0x1',hash,timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)}:'0x7';
  return new Response(JSON.stringify({result}));
 }));
 const c=arcConfigFromEnv(env),client=createPublicClient({transport:arcTransport(c)});
 expect(await client.getBalance({address:'0x1111111111111111111111111111111111111111'})).toBe(7n);
 expect(calls.some(c=>c.url===drpc&&c.headers['Drpc-Key']==='test-only-key')).toBe(true);
 expect(calls.filter(c=>c.url!==drpc).every(c=>c.headers['Drpc-Key']===undefined)).toBe(true);
 expect(calls.every(c=>c.redirect==='error')).toBe(true);
});
