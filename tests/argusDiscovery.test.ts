import {describe,it,expect,vi} from 'vitest';
import {encodeFunctionResult,decodeFunctionData,zeroAddress,parseAbi,createPublicClient,http} from 'viem';
import {discoverArgusPool,discoveryAbi,ARGUS_PORTALS} from '../lib/arc/argus-discovery';
import {poolId,encodeArcSwap,type V4Pool} from '../lib/arc/routing';
import {ARC_USDC} from '../lib/arc/config';
import type {ArcRpc} from '../lib/arc/rpc';
const token='0xA4824D1927ccC6B562a2d3BD5f7FBeC4ca045629',hook='0xe6D9817363fc91cD15Eb0e9CeeBa038913e12044',locker='0x1111111111111111111111111111111111111111',splitter='0x2222222222222222222222222222222222222222';
const pool:V4Pool={protocol:'v4',currency0:ARC_USDC,currency1:token,fee:10000,tickSpacing:200,hooks:hook};
function fixture(overrides:Record<string,unknown>={}){
 const values={LAUNCH_STRUCT_WORDS:10,token,portal:ARGUS_PORTALS[0].address,splitter,poolManager:'0x8366a39cc670b4001a1121b8f6a443a643e40951',quoteAsset:ARC_USDC,poolFee:10000,tickSpacing:200,poolId:poolId(pool),...overrides};
 return {code:vi.fn(async()=> '0x6000'),call:vi.fn(async(call:{data:`0x${string}`},block:bigint)=>{expect(block).toBe(100n);const d=decodeFunctionData({abi:discoveryAbi,data:call.data});return encodeFunctionResult({abi:discoveryAbi,functionName:d.functionName,result:d.functionName==='launches'?[locker,0,false,locker,hook,splitter,100,200,1n,0]:values[d.functionName as keyof typeof values]} as never);})} as unknown as ArcRpc;
}
describe('Argus per-token discovery',()=>{
 it('reads deployed hook, splitter and locker and preserves ERC20 USDC pool identity',async()=>{const result=await discoverArgusPool(token,fixture(),100n);expect(result?.poolId).toBe(poolId(pool));expect(result?.pool.currency0).toBe(ARC_USDC);expect(result?.splitter.toLowerCase()).toBe(splitter);expect(result?.locker.toLowerCase()).toBe(locker);});
 it.each([{token:locker},{portal:locker},{splitter:locker},{poolManager:locker},{poolId:'0x'+'0'.repeat(64)},{poolFee:500},{LAUNCH_STRUCT_WORDS:9}])('rejects mismatched deployed configuration %j',async(o)=>{await expect(discoverArgusPool(token,fixture(o),100n)).rejects.toThrow();});
 it('does not accept silently truncated records',async()=>{const rpc=fixture();vi.mocked(rpc.call).mockResolvedValue(('0x'+'0'.repeat(9*64)) as `0x${string}`);await expect(discoverArgusPool(token,rpc,100n)).rejects.toThrow('record length');});
 it('keeps arbitrary hooked routes blocked but encodes the verified pool',()=>{const route={tokenIn:ARC_USDC,tokenOut:token as `0x${string}`,pools:[pool]};expect(()=>encodeArcSwap(route,100n,1n,1000n)).toThrow('adapter');expect(encodeArcSwap(route,100n,1n,1000n,poolId(pool)).value).toBe(0n);expect(()=>encodeArcSwap(route,100n,1n,1000n,'wrong')).toThrow('adapter');});
});
it.runIf(process.env.ARC_DISCOVERY_LIVE==='1')('checks a deployed Argus hook through read RPC',async()=>{
 const client=createPublicClient({transport:http('https://arguspad.io/api/rpc',{batch:false})});const head=await client.getBlockNumber();const rpc={code:(address:`0x${string}`,blockNumber:bigint)=>client.getCode({address,blockNumber}),call:async(c:{from:`0x${string}`;to:`0x${string}`;data:`0x${string}`;value:bigint},blockNumber:bigint)=>(await client.call({account:c.from,to:c.to,data:c.data,value:c.value,blockNumber})).data??'0x'} as ArcRpc;
 const result=await discoverArgusPool(token,rpc,head);expect(result?.hook.toLowerCase()).toBe(hook.toLowerCase());expect(result?.poolId).toBe('0xf4cfc8be6d7840d5006c8b194991ac54f2824c41a944f2dedfc58d5cc228cbe4');
},30000);
