import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {getFunctionName} from 'convex/server';
const m=vi.hoisted(()=>({query:vi.fn(),read:vi.fn(),session:vi.fn(),arc:vi.fn(),base:vi.fn()}));
vi.mock('convex/browser',()=>({ConvexHttpClient:class{query=m.query;}}));
vi.mock('../lib/otc/http',async original=>({...await original<typeof import('../lib/otc/http')>(),websiteSession:m.session}));
vi.mock('../lib/otc/repository',()=>({repository:()=>({read:m.read})}));
vi.mock('../lib/arc/wallet-balance',()=>({arcWalletBalance:m.arc}));
vi.mock('../lib/otc/runtime',()=>({balanceSnapshot:m.base,baseUsdcBalance:vi.fn()}));
import {GET} from '../app/api/wallet/data/route';
const address='0x1111111111111111111111111111111111111111';
const request=(part:string,extra='')=>new NextRequest('https://www.argosbot.io/api/wallet/data?part='+part+extra);
const listing={kind:'listing',id:'listing:1',owner:'alice',seller:address,status:'cancelled',available:'0',held:'0',pendingFills:0,originalAmount:'50000000',premiumBps:100};
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('OTC_SERVICE_SECRET','s'.repeat(32));
  m.session.mockResolvedValue({owner:'alice',walletAddress:address});m.read.mockResolvedValue(null);
  m.query.mockImplementation(async(ref,args)=>getFunctionName(ref)==='walletData:summary'?{wallets:[],active:[]}:{records:args.kind==='listing'?[listing]:[],totals:[{id:listing.id,sold:'20000000',deliveredPending:'0',receivedEthWei:'1',receivedUsdcUnits:'0'}],isDone:true,cursor:''});
});
afterEach(()=>vi.unstubAllEnvs());
it('keeps summary independent of history and chain RPCs',async()=>{
  expect(await(await GET(request('summary'))).json()).toEqual({walletAddress:address,active:[]});
  expect(m.query).toHaveBeenCalledTimes(1);expect(m.arc).not.toHaveBeenCalled();expect(m.base).not.toHaveBeenCalled();
});
it('binds history to the session even with forged owner parameters',async()=>{
  await GET(request('orders','&owner=bob&address=0x2222222222222222222222222222222222222222'));
  for(const [,args]of m.query.mock.calls)expect(args.owner).toBe('alice');
});
it('rejects anonymous history before database access',async()=>{
  m.session.mockRejectedValue(Error('Unauthorized.'));expect((await GET(request('orders'))).status).not.toBe(200);expect(m.query).not.toHaveBeenCalled();
});
it('reports legacy returns minus materialized verified sales',async()=>{
  const result=await(await GET(request('listings'))).json();expect(result.listings[0]).toMatchObject({sold:'20000000',returnedUsdc:'30000000'});
});
it('keeps an unpaid reserved listing cancellable without exposing escrow addresses',async()=>{
  m.query.mockImplementation(async(ref)=>getFunctionName(ref)==='walletData:summary'?{wallets:[],active:[]}:{records:[{...listing,status:'active',held:'10000000',pendingFills:1,escrow:{address,settlementOrderId:'order:1'}}],totals:[],isDone:true,cursor:''});
  m.read.mockImplementation(async({id})=>id==='order:1'?{kind:'order',id,listingId:listing.id,status:'payment_pending',escrow:{version:2,attempts:{}}}:null);
  const result=await(await GET(request('listings'))).json();expect(result.listings[0].canCancel).toBe(true);expect(result.listings[0].escrow).toBeUndefined();
});
it('does not turn a failed balance refresh into spendable zero',async()=>{
  m.arc.mockRejectedValue(Error('network unavailable'));const result=await(await GET(request('arc'))).json();expect(result.balances[0]).toMatchObject({balanceWei:null,availableWei:null});expect(m.base).not.toHaveBeenCalled();
});
it('resumes owner and recipient pagination separately',async()=>{
  const cursor=Buffer.from(JSON.stringify({ownedDone:true,received:'next'})).toString('base64url');
  await GET(request('orders','&cursor='+cursor));
  const calls=m.query.mock.calls.filter(([ref])=>getFunctionName(ref)==='walletData:history');
  expect(calls).toHaveLength(1);expect(calls[0][1]).toMatchObject({owner:'alice',received:true,paginationOpts:{cursor:'next',numItems:20}});
});
