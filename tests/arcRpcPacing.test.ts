import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createPublicClient} from 'viem';
import {arcConfig} from '../lib/arc/config';
import {arcTransport,clearArcTransportCache} from '../lib/arc/transport';
import {clearArcRpcPacing,paceArcRpc,retryAfterMs} from '../lib/arc/rpc-pacing';
const {reserve}=vi.hoisted(()=>({reserve:vi.fn()}));
vi.mock('convex/browser',()=>({ConvexHttpClient:class{mutation=reserve;}}));
const url='https://test.arc-mainnet.quiknode.pro/private',hash=`0x${'ab'.repeat(32)}`;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1_000_000);reserve.mockReset();vi.stubEnv('NEXT_PUBLIC_CONVEX_URL','');vi.stubEnv('OTC_SERVICE_SECRET','');vi.stubEnv('VERCEL','');});
afterEach(()=>{clearArcTransportCache();clearArcRpcPacing();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
it('spaces shared QuickNode requests without slowing unrelated providers',async()=>{
 const times:number[]=[];
 const work=Promise.all(Array.from({length:4},async()=>{await paceArcRpc(url);times.push(Date.now());}));
 await vi.advanceTimersByTimeAsync(75);await work;
 expect(times).toEqual([1000000,1000025,1000050,1000075]);
 const before=Date.now();await paceArcRpc('https://other.example');expect(Date.now()).toBe(before);
});
it('bounds Retry-After delays',()=>{expect(retryAfterMs(null)).toBe(1000);expect(retryAfterMs('2')).toBe(2000);expect(retryAfterMs('999')).toBe(5000);});
it('limits a large request burst to forty starts in a one-second window',async()=>{
 const times:number[]=[];
 const work=Promise.all(Array.from({length:80},async()=>{await paceArcRpc(url);times.push(Date.now());}));
 await vi.advanceTimersByTimeAsync(1975);await work;
 expect(times.filter(t=>t<1001000)).toHaveLength(40);
 expect(times[79]-times[0]).toBe(1975);
});
function setup(rateLimitMethod:string){
 let attempts=0;const methods:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
 const {method}=JSON.parse(init.body);methods.push(method);
 if(method===rateLimitMethod&&++attempts===1)return new Response('',{status:429,headers:{'Retry-After':'1'}});
 const result=method==='eth_chainId'?'0x13b2':method==='eth_getBlockByNumber'?{number:'0xa',hash,timestamp:`0x${Math.floor(Date.now()/1000).toString(16)}`}:'0x2';
 return new Response(JSON.stringify({result}));
 }));
 const config=arcConfig({rpcUrl:url,checkpointNumber:'10',checkpointHash:hash});
 return {client:createPublicClient({transport:arcTransport(config)}),methods};
}
it('recovers a rate-limited read without tracing or a minute-long method blackout',async()=>{
 const f=setup('eth_call');const read=f.client.request({method:'eth_call',params:[{},'latest']});
 await vi.runAllTimersAsync();expect(await read).toBe('0x2');
 const next=f.client.request({method:'eth_call',params:[{},'latest']});await vi.runAllTimersAsync();expect(await next).toBe('0x2');
 expect(f.methods.filter(m=>m==='eth_call')).toHaveLength(3);expect(f.methods).not.toContain('trace_call');
});
it('never repeats a broadcast on HTTP 429',async()=>{
 const f=setup('eth_sendRawTransaction');const sent=f.client.request({method:'eth_sendRawTransaction',params:['0x1234']}).catch(()=>null);
 await vi.runAllTimersAsync();expect(await sent).toBeNull();expect(f.methods.filter(m=>m==='eth_sendRawTransaction')).toHaveLength(1);
});
it('requires shared admission for concurrent callers with a backend',async()=>{
 vi.stubEnv('NEXT_PUBLIC_CONVEX_URL','https://example.convex.cloud');vi.stubEnv('OTC_SERVICE_SECRET','test-only');
 let slot=1000500;
 reserve.mockImplementation(async()=>{const at=slot;slot+=25;return {slots:[{at,expiresAt:at+150}],serverNow:Date.now(),retryAfterMs:0};});
 const times:number[]=[];
 const calls=Promise.all([url,'https://other.arc-mainnet.quiknode.pro/private'].map(async u=>{await paceArcRpc(u);times.push(Date.now());}));
 await vi.advanceTimersByTimeAsync(499);expect(times).toEqual([]);
 await vi.advanceTimersByTimeAsync(26);await calls;expect(times).toEqual([1000500,1000525]);expect(reserve).toHaveBeenCalledTimes(2);
});
it('rejects late permissions and recovers after a coordinator error',async()=>{
 vi.stubEnv('NEXT_PUBLIC_CONVEX_URL','https://example.convex.cloud');vi.stubEnv('OTC_SERVICE_SECRET','test-only');
 reserve.mockResolvedValue({slots:[{at:999000,expiresAt:999150}],serverNow:Date.now(),retryAfterMs:0});
 await expect(paceArcRpc(url)).rejects.toThrow('capacity is busy');expect(reserve).toHaveBeenCalledTimes(6);
 reserve.mockRejectedValue(Error('network'));
 const failed=paceArcRpc(url).catch(e=>e.message);await vi.advanceTimersByTimeAsync(500);expect(await failed).toContain('capacity service unavailable');
 reserve.mockImplementation(async()=>({slots:[{at:Date.now(),expiresAt:Date.now()+150}],serverNow:Date.now(),retryAfterMs:0}));
 const recovered=paceArcRpc(url);await vi.advanceTimersByTimeAsync(25);await expect(recovered).resolves.toBeUndefined();
});
it('does not send an RPC without capacity configuration on Vercel',async()=>{
 vi.stubEnv('VERCEL','1');await expect(paceArcRpc(url)).rejects.toThrow('capacity configuration');
});
it('uses one shared admission for eight requests instead of eight network calls',async()=>{
 vi.stubEnv('NEXT_PUBLIC_CONVEX_URL','https://example.convex.cloud');vi.stubEnv('OTC_SERVICE_SECRET','test');
 reserve.mockImplementation(async()=>({serverNow:Date.now(),retryAfterMs:0,
 slots:Array.from({length:8},(_,i)=>({at:Date.now()+i*50,expiresAt:Date.now()+i*50+1000}))}));
 const times:number[]=[];
 const work=Promise.all(Array.from({length:8},async()=>{await paceArcRpc(url);times.push(Date.now());}));
 await vi.runAllTimersAsync();await work;
 expect(reserve).toHaveBeenCalledTimes(1);expect(times[7]-times[0]).toBe(350);
});
it('paces the public fallback without needing the capacity service',async()=>{
 vi.stubEnv('VERCEL','1');const times:number[]=[];
 const work=Promise.all(Array.from({length:3},async()=>{await paceArcRpc('https://rpc.mainnet.arc.io');times.push(Date.now());}));
 await vi.runAllTimersAsync();await work;
 expect(times).toEqual([1000000,1000300,1000600]);expect(reserve).not.toHaveBeenCalled();
});
