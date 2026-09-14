import {beforeEach,it,expect,vi} from 'vitest';
import {encodeAbiParameters,parseAbiParameters,zeroAddress} from 'viem';
const m=vi.hoisted(()=>({discover:vi.fn(),decimals:vi.fn(),call:vi.fn(),block:vi.fn()}));
vi.mock('../lib/arc/config',()=>({ARC_USDC:'0x3600000000000000000000000000000000000000',arcConfigFromEnv:()=>({rpcUrl:'https://rpc.example',checkpointNumber:1n,checkpointHash:'canonical'})}));
vi.mock('../lib/arc/rpc',()=>({createArcRpc:()=>({decimals:m.decimals,call:m.call,block:m.block}),checkArcRpc:async()=>({number:100n,hash:'canonical'})}));
vi.mock('../lib/arc/argus-discovery',()=>({discoverArgusPool:m.discover}));
import {tradeMarket,clearMarketCache} from '../lib/arc/markets';
const token='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333',usdc='0x3600000000000000000000000000000000000000',arcash='0x0bffa97f774824e9da843699aedd2835cb1b8022';
const launch=(quote:string)=>({pool:{currency0:token,currency1:quote},poolId:'verified-pool',portal:'verified-portal'});
beforeEach(()=>{vi.clearAllMocks();clearMarketCache();m.discover.mockResolvedValue(launch(other));m.decimals.mockResolvedValue(8);m.block.mockResolvedValue({hash:'canonical'});m.call.mockResolvedValue(encodeAbiParameters(parseAbiParameters('string'),['NEWQUOTE']));});
it('admits an unindexed quote recorded by verified launch discovery with its own decimals',async()=>{
  expect(await tradeMarket(token)).toMatchObject({paired:true,quote:{address:other,symbol:'NEWQUOTE',decimals:8}});
  expect(m.decimals).toHaveBeenCalledWith(other,100n);
});
it('accepts indexed ARCASH as a pair without assuming its indexed decimals',async()=>{
  m.discover.mockResolvedValue(launch(arcash));m.decimals.mockResolvedValue(12);
  expect(await tradeMarket(token)).toMatchObject({paired:true,quote:{symbol:'ARCASH',decimals:12}});expect(m.call).not.toHaveBeenCalled();
});
it.each([zeroAddress,usdc])('keeps native USDC denomination for %s',async quote=>{
  m.discover.mockResolvedValue(launch(quote));m.decimals.mockResolvedValue(6);
  expect(await tradeMarket(token)).toMatchObject({paired:false,quote:{address:usdc,symbol:'USDC',decimals:6}});
});
it('keeps ordinary non-Argus markets on USDC',async()=>{
  m.discover.mockResolvedValue(null);m.decimals.mockResolvedValue(6);expect((await tradeMarket(token)).paired).toBe(false);
});
it('uses a neutral display name if optional symbol metadata fails',async()=>{
  m.call.mockRejectedValue(Error('symbol unavailable'));expect((await tradeMarket(token)).quote).toMatchObject({address:other,symbol:'paired token'});
});
it.each(['USDC','$USDC','https://fake.example','@somebody','X'.repeat(33)])('does not mislabel a discovered quote with %s',async symbol=>{
  m.call.mockResolvedValue(encodeAbiParameters(parseAbiParameters('string'),[symbol]));expect((await tradeMarket(token)).quote).toMatchObject({address:other,symbol:'paired token'});
});
it.each([-1,256,NaN])('rejects invalid decimals %s',async value=>{
  m.decimals.mockResolvedValue(value);await expect(tradeMarket(token)).rejects.toThrow('decimals');
});
it('preserves discovery verification errors instead of admitting a guessed pair',async()=>{
  m.discover.mockRejectedValue(Error('Argus hook identity mismatch.'));await expect(tradeMarket(token)).rejects.toThrow('identity mismatch');
});
it('rejects a block change after metadata reads',async()=>{
  m.block.mockResolvedValueOnce({hash:'canonical'}).mockResolvedValueOnce({hash:'changed'});await expect(tradeMarket(token)).rejects.toThrow('block changed');
});
