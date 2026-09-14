import {it,expect,vi,afterEach} from 'vitest';
const m=vi.hoisted(()=>({blocks:vi.fn(),logs:vi.fn(),query:vi.fn(),mutation:vi.fn()}));
vi.mock('viem',async original=>({...await original<typeof import('viem')>(),createPublicClient:()=>({getBlock:m.blocks,getLogs:m.logs})}));
vi.mock('convex/browser',()=>({ConvexHttpClient:class{query=m.query;mutation=m.mutation;}}));
vi.mock('../lib/arc/transport',()=>({arcTransport:()=>({})}));
import {discoverInventory,readInventory,saveInventory,type Inventory} from '../lib/arc/inventory';
import {arcConfig} from '../lib/arc/config';
const wallet='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64),config=arcConfig({rpcUrl:'https://example.invalid',checkpointNumber:'100',checkpointHash:hash});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it('discovers recent outside deposits first, verifies their range and persists a cursor',async()=>{
  m.blocks.mockResolvedValue({hash});m.logs.mockResolvedValue([{address:token,removed:false}]);
  const result=await discoverInventory(wallet,config,10000n,{entries:[],truncated:false,cursor:null});
  expect(result.tokens).toEqual([token]);expect(result.cursor.block).toBe('10000');expect(result.cursor.oldest).toBe('8977');
  expect(m.logs).toHaveBeenCalledWith(expect.objectContaining({args:{to:wallet},fromBlock:8977n,toBlock:10000n}));
  expect(m.logs).toHaveBeenCalledWith(expect.objectContaining({args:{from:wallet}}));
});
it('advances the historical scan while checking fresh external transfers',async()=>{
  m.blocks.mockResolvedValue({hash});m.logs.mockResolvedValue([]);
  const result=await discoverInventory(wallet,config,10010n,{entries:[],truncated:false,cursor:{block:'10000',hash,oldest:'8977'}});
  expect(result.cursor).toMatchObject({block:'10010',oldest:'7953',previous:'10000'});expect(m.logs).toHaveBeenCalledTimes(4);
});
it('rewinds a changed cursor and refuses to commit logs if canonical evidence changes again',async()=>{
  m.blocks.mockResolvedValue({hash});m.logs.mockResolvedValue([]);
  await discoverInventory(wallet,config,10000n,{entries:[],truncated:false,cursor:{block:'9900',hash:'other'}});
  expect(m.logs).toHaveBeenCalledWith(expect.objectContaining({fromBlock:9772n}));
  m.blocks.mockResolvedValueOnce({hash}).mockResolvedValueOnce({hash:'changed'});
  await expect(discoverInventory(wallet,config,10000n,{entries:[],truncated:false,cursor:null})).rejects.toThrow('changed');
});
it('retains verified display snapshots across process-independent inventory reads',async()=>{
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL','https://example.convex.cloud');vi.stubEnv('OTC_SERVICE_SECRET','s'.repeat(32));
  const saved:Inventory={entries:[{token,balance:'12.5',symbol:'TOKEN',name:'Token',block:'200'}],truncated:false,cursor:null};m.query.mockResolvedValue(saved);
  expect((await readInventory(wallet)).entries[0].balance).toBe('12.5');
  await saveInventory(wallet,'201',[{token,balance:'0'}]);
  expect(m.mutation).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({wallet,block:'201',entries:[{token,balance:'0'}]}));
});
