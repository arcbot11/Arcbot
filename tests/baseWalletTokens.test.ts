import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({list:vi.fn(),read:vi.fn(),block:vi.fn(),snapshot:vi.fn()}));
vi.mock('@coinbase/cdp-sdk',()=>({CdpClient:class{evm={listTokenBalances:m.list};}}));
vi.mock('../lib/otc/runtime',()=>({chainClient:()=>({readContract:m.read,getBlock:m.block}),balanceSnapshot:m.snapshot}));
const owner='0x1111111111111111111111111111111111111111',token='0x3333333333333333333333333333333333333333',other='0x4444444444444444444444444444444444444444';
const item=(contractAddress:string,network='base')=>({token:{contractAddress,network},amount:{amount:999n,decimals:1}});
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();m.snapshot.mockResolvedValue({block:'100'});m.block.mockResolvedValue({hash:'0xabc'});m.read.mockImplementation(async({functionName}:{functionName:string})=>({balanceOf:50000000000000000000n,decimals:18,symbol:'ARGUS',name:'Argus'})[functionName as 'symbol']);m.list.mockResolvedValue({balances:[item(token)]});});
afterEach(()=>vi.restoreAllMocks());
it('discovers all pages, excludes native ETH and canonical USDC, and verifies balances on Base',async()=>{
 m.list.mockResolvedValueOnce({balances:[item(token),item('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'),item('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')],nextPageToken:'next'}).mockResolvedValueOnce({balances:[item(token),item(other)]});
 const {baseTokenBalances}=await import('../lib/base/wallet-tokens');const result=await baseTokenBalances(owner);
 expect(result.partial).toBe(false);expect(result.tokens).toHaveLength(2);expect(result.tokens[0]).toMatchObject({balance:'50',symbol:'ARGUS'});
 expect(m.list).toHaveBeenLastCalledWith({address:owner,network:'base',pageSize:100,pageToken:'next'});expect(m.snapshot).toHaveBeenCalledWith(8453,owner);
 expect(m.read).toHaveBeenCalledWith(expect.objectContaining({functionName:'balanceOf',args:[owner],blockNumber:100n}));
});
it('does not hide a different token that calls itself USDC',async()=>{
 m.read.mockImplementation(async({functionName}:{functionName:string})=>functionName==='balanceOf'?1n:functionName==='decimals'?6:'USDC');
 const {baseTokenBalances}=await import('../lib/base/wallet-tokens');expect((await baseTokenBalances(owner)).tokens[0]).toMatchObject({address:token,symbol:'USDC',balance:'0.000001'});
});
it('retains failed holdings as stale but removes a verified zero',async()=>{
 let now=1000;vi.spyOn(Date,'now').mockImplementation(()=>now);const {baseTokenBalances}=await import('../lib/base/wallet-tokens');await baseTokenBalances(owner);now+=16000;m.list.mockResolvedValue({balances:[]});m.read.mockRejectedValue(Error('RPC offline'));
 const failed=await baseTokenBalances(owner);expect(failed.tokens[0].stale).toBe(true);expect(failed.balancePartial).toBe(true);
 now+=16000;m.read.mockResolvedValue(0n);expect((await baseTokenBalances(owner)).tokens).toEqual([]);
});
it('marks discovery failures and repeated page cursors as partial',async()=>{
 m.list.mockRejectedValue(Error('Indexer down'));const {baseTokenBalances}=await import('../lib/base/wallet-tokens');expect(await baseTokenBalances(owner)).toMatchObject({tokens:[],partial:true,discoveryPartial:true});
 m.list.mockResolvedValue({balances:[item(token)],nextPageToken:'same'});expect((await baseTokenBalances(other)).discoveryPartial).toBe(true);
});
it('never trusts token candidates from another network',async()=>{
 m.list.mockResolvedValue({balances:[item(token,'ethereum')]});const {baseTokenBalances}=await import('../lib/base/wallet-tokens');expect(await baseTokenBalances(owner)).toMatchObject({tokens:[],partial:true});expect(m.read).not.toHaveBeenCalled();
});
it('rejects a changed balance block',async()=>{
 m.block.mockResolvedValueOnce({hash:'one'}).mockResolvedValueOnce({hash:'two'});const {baseTokenBalances}=await import('../lib/base/wallet-tokens');await expect(baseTokenBalances(owner)).rejects.toThrow('block changed');
});
