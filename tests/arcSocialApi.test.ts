import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn(),command:vi.fn(),advance:vi.fn(),prepare:vi.fn(),trade:vi.fn(),balance:vi.fn(),convert:vi.fn(),contract:vi.fn()}));
vi.mock("../lib/arc/social-authority",()=>({socialAuthority:m.auth}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command})}));
vi.mock("../lib/otc/runtime",()=>({advanceTransaction:m.advance,prepareCall:m.prepare,chainClient:()=>({readContract:m.contract})}));
vi.mock("../lib/arc/trading",()=>({previewArcTrade:m.trade,arcSellAmountForUsdc:m.convert}));
vi.mock("../lib/arc/wallet-tokens",()=>({arcSelectedTokenBalance:m.balance}));
import {POST} from "../app/api/arc/command/route";
const wallet="0x1111111111111111111111111111111111111111",recipient="0x2222222222222222222222222222222222222222";
let command:unknown;
const request=(secret="secret")=>new NextRequest("https://www.argosbot.io/api/arc/command",{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify({requestId:"x:123:send"})});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("WEB_AUTH_SECRET","secret");command={kind:"send",unit:"usd",amount:"10",recipient};m.auth.mockImplementation(async()=>({owner:"alice",wallet,command:JSON.stringify(command),createdAt:Date.now()}));m.read.mockResolvedValue(null);m.prepare.mockResolvedValue({unsigned:"0x02",reserveWei:"10000000000000000100",snapshot:{balanceWei:"20000000000000000000",block:"1"}});m.command.mockImplementation(async(_kind,tx)=>({...tx,status:"prepared"}));m.advance.mockResolvedValue({status:"submitted",hash:"txhash"});});
afterEach(()=>vi.unstubAllEnvs());
describe("Arc social execution boundary",()=>{
 it.each([
   "Unsupported Argus pool configuration.","Unexpected Argus Portal format.",
   "Argus hook identity mismatch.","Argus pool ID mismatch.",
   "Hook execution requires a reviewed adapter","No supported liquid Arc route found.",
 ])("returns a definite preparation error immediately: %s",async message=>{
   command={kind:"buy",unit:"usd",amount:"10",token:recipient,slippageBps:100};
   m.trade.mockRejectedValue(Error(message));
   expect(await(await POST(request())).json()).toEqual({ok:false,message});
   expect(m.command).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();
 });
 it("reports an unsupported swap immediately even after a completed approval",async()=>{
   command={kind:"buy",unit:"usd",amount:"10",token:recipient,slippageBps:100};
   m.read.mockResolvedValueOnce({chainId:5042,status:"completed",leg:"allowance"}).mockResolvedValue(null);
   m.trade.mockRejectedValue(Error("Unsupported Argus pool configuration."));
   expect(await(await POST(request())).json()).toEqual({ok:false,message:"Unsupported Argus pool configuration."});
   expect(m.command).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();
 });
 it.each(["RPC timed out","Malformed RPC response"])("keeps transient preparation failures retryable: %s",async message=>{
   command={kind:"buy",unit:"usd",amount:"10",token:recipient,slippageBps:100};
   m.trade.mockRejectedValue(Error(message));
   expect(await(await POST(request())).json()).toMatchObject({pending:true});
   expect(m.command).not.toHaveBeenCalled();
 });
 it.each(["Unsupported Argus pool configuration.","Not enough gas"])("does not finalize uncertain recovery from error wording: %s",async message=>{
   m.read.mockResolvedValue({chainId:5042,status:"submitted",leg:"swap"});
   m.advance.mockRejectedValue(Error(message));
   expect(await(await POST(request())).json()).toMatchObject({pending:true});
   expect(m.prepare).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();
 });
 it("keeps a lost storage response pending even if its message resembles validation",async()=>{
   m.command.mockRejectedValue(Error("Not enough gas"));
   expect(await(await POST(request())).json()).toMatchObject({pending:true});
   expect(m.advance).not.toHaveBeenCalled();
 });
 it("keeps an unreadable transaction record pending",async()=>{
   m.read.mockRejectedValueOnce(Error("Unsupported Argus pool configuration."));
   expect(await(await POST(request())).json()).toMatchObject({pending:true});
   expect(m.prepare).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();
 });
 it("prepares buy-and-send to its already resolved wallet",async()=>{
   command={kind:"buy_and_send",unit:"usd",amount:"10",token:"0x3333333333333333333333333333333333333333",recipient,slippageBps:100};
   m.trade.mockResolvedValue({unsigned:"0x02",leg:"swap",reserveWei:"100",swapOutput:{token:"0x3333333333333333333333333333333333333333",minimum:"25",recipient},snapshot:{balanceWei:"1000",block:"1"}});
   expect((await(await POST(request())).json()).pending).toBe(true);
   expect(m.trade).toHaveBeenCalledWith(wallet,expect.objectContaining({tokenIn:"native",amount:"10"}),recipient);
   expect(m.command).toHaveBeenCalledWith("prepare",expect.objectContaining({swapOutput:expect.objectContaining({recipient})}));
 });
 it("prepares buy-and-burn with dead-address delivery metadata",async()=>{
   command={kind:"buy_and_burn",unit:"usd",amount:"10",token:recipient,slippageBps:100};
   m.trade.mockResolvedValue({unsigned:"0x02",leg:"swap",reserveWei:"100",swapOutput:{token:recipient,minimum:"25",recipient:"0x000000000000000000000000000000000000dEaD"},snapshot:{balanceWei:"1000",block:"1"}});
   expect((await(await POST(request())).json()).pending).toBe(true);
   expect(m.trade).toHaveBeenCalledWith(wallet,expect.objectContaining({tokenIn:"native",tokenOut:recipient,amount:"10"}),true);
   expect(m.command).toHaveBeenCalledWith("prepare",expect.objectContaining({swapOutput:expect.objectContaining({recipient:"0x000000000000000000000000000000000000dEaD"})}));
 });
 it("rejects unauthenticated service calls",async()=>{expect((await POST(request("wrong"))).status).toBe(401);expect(m.auth).not.toHaveBeenCalled();});
 it("rechecks stored request authority rather than trusting a supplied wallet",async()=>{m.auth.mockRejectedValue(Error("revoked"));await POST(request());expect(m.prepare).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();});
 it("sends Arc USDC through the same durable reservation store",async()=>{const r=await POST(request());expect((await r.json()).pending).toBe(true);expect(m.prepare).toHaveBeenCalledWith(5042,expect.objectContaining({from:wallet,to:recipient,value:10n*10n**18n}));expect(m.command).toHaveBeenCalledWith("prepare",expect.objectContaining({owner:"alice",chainId:5042,sourceRequestId:"x:123:send"}));});
 it("never executes Base ETH from social channels",async()=>{command={kind:"send",unit:"eth",amount:"1",recipient};expect((await(await POST(request())).json()).ok).toBe(false);expect(m.prepare).not.toHaveBeenCalled();});
 it("rejects creation workflows",async()=>{command={kind:"launch",name:"test"};expect((await(await POST(request())).json()).ok).toBe(false);expect(m.command).not.toHaveBeenCalled();});
 it("does not duplicate completed social transactions",async()=>{m.read.mockResolvedValue({chainId:5042,status:"completed",leg:"send",hash:"old"});expect(await(await POST(request())).json()).toMatchObject({ok:true,hash:"old"});expect(m.prepare).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();});
 it("keeps an ambiguous stored transaction pending",async()=>{m.read.mockResolvedValue({chainId:5042,status:"submitted",leg:"send"});expect((await(await POST(request())).json()).pending).toBe(true);expect(m.prepare).not.toHaveBeenCalled();});
 it("does not report a failed trade when receipt verification times out",async()=>{
   m.read.mockResolvedValue({chainId:5042,status:"submitted",leg:"swap"});m.advance.mockRejectedValue(Error("RPC timed out"));
   expect(await(await POST(request())).json()).toMatchObject({pending:true});expect(m.prepare).not.toHaveBeenCalled();
 });
 it("allows slow approval workflows twenty minutes after the command",async()=>{
   m.auth.mockResolvedValue({owner:"alice",wallet,command:JSON.stringify(command),createdAt:Date.now()-20*60_000});
   expect(await(await POST(request())).json()).toMatchObject({pending:true});expect(m.prepare).toHaveBeenCalled();
 });
 it("expires permission to create new transactions but continues checking existing submissions",async()=>{
   m.auth.mockResolvedValue({owner:"alice",wallet,command:JSON.stringify(command),createdAt:Date.now()-40*60_000});
   expect(await(await POST(request())).json()).toMatchObject({ok:false,message:expect.stringMatching(/^Request expired/)});expect(m.prepare).not.toHaveBeenCalled();
   m.read.mockResolvedValue({chainId:5042,status:"submitted",leg:"send"});m.advance.mockResolvedValue({status:"completed",leg:"send",hash:"verified"});
   expect(await(await POST(request())).json()).toMatchObject({ok:true,hash:"verified"});expect(m.prepare).not.toHaveBeenCalled();
 });
});

it.each([25,50,100])("uses the website tax-aware maximum for a %s percent social sell",async percentage=>{
 command={kind:"sell",unit:"percent",amount:String(percentage),token:recipient,slippageBps:100};
 m.balance.mockResolvedValue({maxSellRaw:"99000000",decimals:6});
 m.trade.mockResolvedValue({unsigned:"0x02",leg:"swap",reserveWei:"100",snapshot:{balanceWei:"1000",block:"1"}});
 expect(await(await POST(request())).json()).toMatchObject({pending:true});
 expect(m.trade).toHaveBeenCalledWith(wallet,expect.objectContaining({amount:String(99*percentage/100)}),false);
});
it("uses website USD conversion for a token-to-token social swap",async()=>{
 command={kind:"swap_token_for_token",unit:"usd",amount:"10",fromToken:recipient,toToken:"0x3333333333333333333333333333333333333333",slippageBps:100};
 m.convert.mockResolvedValue("12.5");m.trade.mockResolvedValue({unsigned:"0x02",leg:"swap",reserveWei:"100",snapshot:{balanceWei:"1000",block:"1"}});
 expect(await(await POST(request())).json()).toMatchObject({pending:true});
 expect(m.trade).toHaveBeenCalledWith(wallet,expect.objectContaining({amount:"12.5",tokenIn:recipient}),false);
});
it("does not submit social sends against funds reserved on the website",async()=>{
 m.read.mockImplementation(async({id})=>id.startsWith("wallet:")?{holds:{otc:"20000000000000000000"}}:null);
 expect(await(await POST(request())).json()).toMatchObject({ok:false});expect(m.command).not.toHaveBeenCalled();
});
it("reports a newly verified send without another recovery round",async()=>{
 m.advance.mockResolvedValue({status:"completed",leg:"send",hash:"verified"});
 expect(await(await POST(request())).json()).toMatchObject({ok:true,hash:"verified"});
});

it("prepares Telegram Base ETH through the shared withdrawal pipeline",async()=>{
 command={kind:"send",chainId:8453,unit:"eth",amount:"0.001",recipient};
 m.auth.mockResolvedValue({source:"telegram",owner:"alice",wallet,command:JSON.stringify(command),createdAt:Date.now()});
 expect(await(await POST(request())).json()).toMatchObject({pending:true});
 expect(m.prepare).toHaveBeenCalledWith(8453,{from:wallet,to:recipient,value:1000000000000000n,data:"0x"});
 expect(m.command).toHaveBeenCalledWith("prepare",expect.objectContaining({chainId:8453,leg:"send",sourceRequestId:"x:123:send"}));
});
it.each(["x",undefined])("rejects Base withdrawal without explicit Telegram authority: %s",async source=>{
 command={kind:"send",chainId:8453,unit:"eth",amount:"0.001",recipient};
 m.auth.mockResolvedValue({source,owner:"alice",wallet,command:JSON.stringify(command),createdAt:Date.now()});
 expect(await(await POST(request())).json()).toMatchObject({ok:false});expect(m.prepare).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();
});
