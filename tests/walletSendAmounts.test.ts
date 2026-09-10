import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {decodeFunctionData,parseAbi} from "viem";
import { BASE_USDC } from "../lib/base/usdc";
const m=vi.hoisted(()=>({prepare:vi.fn(),read:vi.fn(),convert:vi.fn(),balance:vi.fn(),contract:vi.fn(),price:vi.fn(),baseBalance:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:async()=>({xUserId:"owner",walletAddress:"0x1111111111111111111111111111111111111111"})}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read})}));
vi.mock("../lib/otc/runtime",()=>({walletTransferConfiguration:()=>{},prepareCall:m.prepare,chainClient:()=>({readContract:m.contract}),ethPrice:m.price,baseUsdcBalance:m.baseBalance}));
vi.mock("../lib/arc/trading",()=>({arcSellAmountForUsdc:m.convert}));
vi.mock("../lib/arc/wallet-tokens",()=>({arcSelectedTokenBalance:m.balance}));
import {POST} from "../app/api/wallet/send/route";
const recipient="0x2222222222222222222222222222222222222222",token="0x3333333333333333333333333333333333333333";
const body={action:"preview",chainId:5042,recipient,asset:token,amount:"10"};
const request=(extra:object={})=>new NextRequest("https://www.arcchainbot.io/api/wallet/send",{method:"POST",body:JSON.stringify({...body,...extra})});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("WEB_AUTH_SECRET","test-secret");
 m.price.mockResolvedValue({ethUsdMicros:"2000000000",priceAt:Date.now()});m.baseBalance.mockResolvedValue("100000000");
 m.read.mockResolvedValue({holds:{listing:(20n*10n**18n).toString()}});
 m.convert.mockResolvedValue("12.5");m.balance.mockResolvedValue({maxSellRaw:"99000000",decimals:6});
 m.contract.mockImplementation(async({functionName}:{functionName:string})=>functionName==="decimals"?6:100000000n);
 m.prepare.mockImplementation(async(_chain:number,call:{value:bigint})=>({unsigned:"unsigned",gasWei:(10n**15n).toString(),reserveWei:(call.value+10n**15n).toString(),snapshot:{balanceWei:(100n*10n**18n).toString()}}));
});
it("converts a dollar withdrawal to exact Base ETH before quoting",async()=>{
 const response=await POST(request({chainId:8453,asset:"native",amount:"10",amountUnit:"usd"}));
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({amount:"0.005",asset:"ETH"});
 expect(m.prepare).toHaveBeenCalledWith(8453,expect.objectContaining({value:5000000000000000n,to:recipient}));expect(m.convert).not.toHaveBeenCalled();
});
it.each(["tokens","usd"])("rejects new Base USDC withdrawals in %s units",async amountUnit=>{
 const response=await POST(request({chainId:8453,asset:BASE_USDC,amount:"10.25",amountUnit}));
 expect(response.status).toBe(400);expect(m.prepare).not.toHaveBeenCalled();
});
it("rejects Base USDC reserved for other operations",async()=>{
 m.read.mockResolvedValue({holds:{},usdcHolds:{otc:"95000000"}});
 expect((await POST(request({chainId:8453,asset:BASE_USDC,amount:"10"}))).status).not.toBe(200);
});
it("rejects stale ETH prices and unsupported Base tokens",async()=>{
 m.price.mockResolvedValue({ethUsdMicros:"2000000000",priceAt:Date.now()-120000});
 expect((await POST(request({chainId:8453,asset:"native",amountUnit:"usd"}))).status).not.toBe(200);
 expect((await POST(request({chainId:8453,asset:token}))).status).not.toBe(200);expect(m.prepare).not.toHaveBeenCalled();
});
afterEach(()=>vi.unstubAllEnvs());
it("converts USD token sends on the server before encoding the transfer",async()=>{
 const response=await POST(request({amountUnit:"usd"}));expect(response.status).toBe(200);
 expect(m.convert).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111",token,"10");
 const call=m.prepare.mock.calls[0][1];
 expect(decodeFunctionData({abi:parseAbi(["function transfer(address,uint256)"]),data:call.data}).args).toEqual([recipient,12500000n]);
 expect((await response.json()).amount).toBe("12.5");
});
it.each([25,50,100])("sends %s percent of the fresh tax-adjusted token balance",async percentage=>{
 const response=await POST(request({percentage,amount:"999999"}));expect(response.status).toBe(200);
 const call=m.prepare.mock.calls[0][1];
 expect(decodeFunctionData({abi:parseAbi(["function transfer(address,uint256)"]),data:call.data}).args).toEqual([recipient,99000000n*BigInt(percentage)/100n]);
});
it("leaves gas and OTC reservations intact for a 100% USDC send",async()=>{
 const response=await POST(request({asset:"native",percentage:100}));expect(response.status).toBe(200);
 expect((await response.json()).amount).toBe("79.999");
 expect(m.prepare.mock.calls[1][1].value+10n**15n+20n*10n**18n).toBe(100n*10n**18n);
});
it("treats Arc USDC dollars as the same currency without a price lookup",async()=>{
 expect((await POST(request({asset:"native",amountUnit:"usd"}))).status).toBe(200);
 expect(m.convert).not.toHaveBeenCalled();expect(m.prepare.mock.calls[0][1].value).toBe(10n**19n);
});
it("does not prepare a token send when its USD price cannot be obtained",async()=>{
 m.convert.mockRejectedValue(Error("No supported liquid Arc route found."));
 expect((await POST(request({amountUnit:"usd"}))).status).not.toBe(200);expect(m.prepare).not.toHaveBeenCalled();
});
it("rejects stale wallet locks and mixed percentage/USD requests",async()=>{
 m.read.mockResolvedValue({activeTx:"pending",holds:{}});
 expect((await POST(request({asset:"native",percentage:100}))).status).not.toBe(200);
 expect((await POST(request({percentage:25,amountUnit:"usd"}))).status).not.toBe(200);
 expect((await POST(request({chainId:8453,asset:"native",percentage:100}))).status).not.toBe(200);
});
