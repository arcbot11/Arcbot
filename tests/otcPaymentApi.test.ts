import {describe,it,expect,vi,beforeEach} from "vitest";
import {NextRequest} from "next/server";
import {BASE_USDC} from "../lib/base/usdc";
const m=vi.hoisted(()=>({read:vi.fn(),command:vi.fn(),rate:vi.fn(),prepare:vi.fn(),balance:vi.fn(),usdc:vi.fn(),verify:vi.fn(),advance:vi.fn()}));
const buyer="0x2222222222222222222222222222222222222222",seller="0x1111111111111111111111111111111111111111",router="0x3333333333333333333333333333333333333333",fees="0x4444444444444444444444444444444444444444";
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command})}));
vi.mock("../lib/otc/escrow-runtime",()=>({escrowConfiguration:()=>({feeRecipient:"0x4444444444444444444444444444444444444444",base:{maxTotalFeeWei:1000n}}),escrowAccountName:()=>"position-test",advanceEscrowPosition:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:vi.fn(async()=>({xUserId:"buyer",walletAddress:"0x2222222222222222222222222222222222222222"}))}));
vi.mock("../lib/otc/runtime",()=>({otcConfiguration:vi.fn(),verifyRouter:vi.fn(async()=>({router:"0x3333333333333333333333333333333333333333",feeRecipient:"0x4444444444444444444444444444444444444444",base:{maxTotalFeeWei:1000n}})),ethPrice:m.rate,prepareCall:m.prepare,balanceSnapshot:m.balance,baseUsdcBalance:m.usdc,verifyUsdcRouter:m.verify,advanceOrder:m.advance}));
import {POST} from "../app/api/otc/route";
const request=(body:unknown)=>new NextRequest("https://arc.invalid/api/otc",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({id:"listing:test",kind:"listing",seller,premiumBps:1000});m.command.mockImplementation(async(_command,input)=>({...input,status:"quoted"}));m.rate.mockResolvedValue({ethUsdMicros:"2000000000",priceAt:Date.now()});m.prepare.mockResolvedValue({gasWei:"100",snapshot:{balanceWei:"1000000000000000000",block:"100",nonce:0,pendingNonce:0}});m.usdc.mockResolvedValue("100000000");});
describe("OTC payment asset API",()=>{
 it("quotes direct escrow USDC without a payment router or approval",async()=>{
  m.read.mockResolvedValue({id:"listing:test",kind:"listing",seller,premiumBps:1000,escrow:{version:1,address:router,feeRecipient:fees}});
  const response=await POST(request({action:"quote",listingId:"listing:test",amount:"12.5",paymentAsset:"USDC"}));
  expect(response.status).toBe(200);expect(m.verify).not.toHaveBeenCalled();expect(m.rate).not.toHaveBeenCalled();
  expect(m.command).toHaveBeenCalledWith("quote",expect.objectContaining({amount:"12.5",escrowGasBudgetWei:"3000",approvalGasWei:"0",router}));
  expect(m.prepare).toHaveBeenCalledWith(8453,expect.objectContaining({to:BASE_USDC,value:0n}));
 });
 it("quotes USDC without fetching ETH/USD and prepares only approval",async()=>{const r=await POST(request({action:"quote",listingId:"listing:test",amount:"10",paymentAsset:"USDC"}));expect(r.status).toBe(200);const q=await r.json();expect(q).toMatchObject({paymentAsset:"USDC",totalWei:"11110000",sellerWei:"11000000",feeWei:"110000",approvalGasWei:"1000",baseGasWei:"1000"});expect(m.rate).not.toHaveBeenCalled();expect(m.prepare).toHaveBeenCalledWith(8453,expect.objectContaining({to:BASE_USDC,value:0n}));expect(m.command).toHaveBeenCalledWith("quote",expect.objectContaining({baseUsdcBalance:"100000000"}));});
 it("defaults old clients to ETH",async()=>{const r=await POST(request({action:"quote",listingId:"listing:test",amount:"10"}));expect(r.status).toBe(200);expect((await r.json()).paymentAsset).toBe("ETH");expect(m.rate).toHaveBeenCalledOnce();expect(m.usdc).not.toHaveBeenCalled();});
 it("rejects arbitrary payment symbols",async()=>{const r=await POST(request({action:"quote",listingId:"listing:test",amount:"10",paymentAsset:"USDbC"}));expect(r.status).toBe(400);expect(m.prepare).not.toHaveBeenCalled();});
 it("passes fresh USDC balance into atomic acceptance",async()=>{m.read.mockResolvedValue({id:"order:test",kind:"order",owner:"buyer",buyer,seller,router,feeRecipient:fees,paymentAsset:"USDC",amount:"10000000",arcGasWei:"1000",status:"quoted"});m.balance.mockResolvedValue({balanceWei:"10000",block:"101",nonce:0,pendingNonce:0});const r=await POST(request({action:"accept",orderId:"order:test"}));expect(r.status).toBe(200);expect(m.command).toHaveBeenCalledWith("accept",expect.objectContaining({snapshot:expect.objectContaining({baseUsdcBalance:"100000000",baseBlock:"101"})}));});
});
