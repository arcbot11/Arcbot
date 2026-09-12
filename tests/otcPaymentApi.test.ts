import {describe,it,expect,vi,beforeEach} from "vitest";
import {NextRequest} from "next/server";

const m=vi.hoisted(()=>({read:vi.fn(),command:vi.fn(),rate:vi.fn(),prepare:vi.fn(),balance:vi.fn(),usdc:vi.fn(),verify:vi.fn(),advance:vi.fn(),code:vi.fn(),listingPreview:vi.fn()}));
vi.mock("../lib/otc/listing-preview",()=>({listingPreview:m.listingPreview}));
const buyer="0x2222222222222222222222222222222222222222",seller="0x1111111111111111111111111111111111111111",router="0x3333333333333333333333333333333333333333",fees="0x4444444444444444444444444444444444444444";
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command})}));
vi.mock("../lib/otc/escrow-runtime",()=>({escrowConfiguration:()=>({feeRecipient:"0x4444444444444444444444444444444444444444",base:{maxTotalFeeWei:1000n}}),escrowAccountName:()=>"position-test",advanceEscrowPosition:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:vi.fn(async()=>({owner:"buyer",walletAddress:"0x2222222222222222222222222222222222222222"}))}));
vi.mock("../lib/otc/runtime",()=>({otcConfiguration:vi.fn(),verifyRouter:vi.fn(async()=>({router:"0x3333333333333333333333333333333333333333",feeRecipient:"0x4444444444444444444444444444444444444444",base:{maxTotalFeeWei:1000n}})),ethPrice:m.rate,prepareCall:m.prepare,balanceSnapshot:m.balance,baseUsdcBalance:m.usdc,verifyUsdcRouter:m.verify,advanceOrder:m.advance,chainClient:()=>({getCode:m.code})}));
import {POST} from "../app/api/otc/route";
const request=(body:unknown)=>new NextRequest("https://arc.invalid/api/otc",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();m.read.mockImplementation(async({id})=>id.startsWith("wallet:")?null:{id:"listing:test",kind:"listing",status:"active",available:"100000000",seller,premiumBps:1000,escrow:{version:1,address:router,feeRecipient:fees}});m.code.mockResolvedValue("0x");m.command.mockImplementation(async(_command,input)=>({...input,status:"quoted"}));m.rate.mockResolvedValue({ethUsdMicros:"2000000000",priceAt:Date.now()});m.prepare.mockResolvedValue({gasWei:"100",snapshot:{balanceWei:"1000000000000000000",block:"100",nonce:0,pendingNonce:0}});m.usdc.mockResolvedValue("100000000");});
describe("OTC ETH-only payment API",()=>{
 it.each([500,1000,1001,1500,1999,2000,2001])("listing gas reserve %i only requires review at twice the original",async reserve=>{
  m.read.mockResolvedValue(null);
  m.listingPreview.mockResolvedValue({gasReserveWei:String(reserve),gasPerFillWei:"123",snapshot:{balanceWei:"100000000000000000000",block:"100",nonce:0,pendingNonce:0}});
  const response=await POST(request({action:"list",requestId:"gas-test",amount:"50",premium:"45",maxGasReserveWei:"1000"}));
  expect(response.status).toBe(reserve>=2000?400:200);
  if(reserve>=2000)expect(m.command).not.toHaveBeenCalled();
  else expect(m.command).toHaveBeenCalledWith("escrow_listing",expect.objectContaining({amount:"50",amountIncludesGas:true,gasPerFillWei:"123"}));
 });
 it("still stops listing creation when the refreshed budget cannot be funded",async()=>{
  m.read.mockResolvedValue(null);m.listingPreview.mockRejectedValue(Error("Not enough available USDC for this listing budget."));
  const response=await POST(request({action:"list",requestId:"gas-test",amount:"50",premium:"45",maxGasReserveWei:"1000"}));
  expect(response.status).toBe(400);expect(m.command).not.toHaveBeenCalled();
 });
 it("previews the full cost without creating an order",async()=>{
  const r=await POST(request({action:"quote_preview",listingId:"listing:test",amount:"10"}));
  expect(r.status).toBe(200);expect(await r.json()).toEqual({totalCostWei:"5582500000000800"});expect(m.command).not.toHaveBeenCalled();
 });
 it.each(["quote","quote_preview"])("rejects %s above live inventory before RPC work",async action=>{
  const r=await POST(request({action,listingId:"listing:test",amount:"101"}));
  expect(r.status).toBe(400);expect((await r.json()).error).toContain("smaller amount");expect(m.prepare).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();
 });
 it.each(["quote","quote_preview"])("includes premium, fee and all gas in %s balance validation",async action=>{
  m.prepare.mockResolvedValue({gasWei:"100",snapshot:{balanceWei:"5582500000000799",block:"100"}});
  const r=await POST(request({action,listingId:"listing:test",amount:"10"}));
  expect(r.status).toBe(400);expect((await r.json()).error).toContain("premium, 1.5% fee, and gas");expect(m.command).not.toHaveBeenCalled();
 });
 it("quotes one combined deposit using measured fees",async()=>{
  const r=await POST(request({action:"quote",listingId:"listing:test",amount:"10"}));expect(r.status).toBe(200);
  expect(m.command).toHaveBeenCalledWith("quote",expect.objectContaining({paymentAsset:"ETH",baseGasWei:"200",escrowGasBudgetWei:"600"}));
  expect(m.prepare).toHaveBeenCalledTimes(1);
  expect(m.prepare.mock.calls[0]).toEqual([8453,{from:buyer,to:router,value:5582500000000000n,data:"0x"}]);
  expect(m.usdc).not.toHaveBeenCalled();
 });
 it.each(["USDC","USDbC"])("rejects %s before preparing or reserving",async paymentAsset=>{
  const r=await POST(request({action:"quote",listingId:"listing:test",amount:"10",paymentAsset}));expect(r.status).toBe(400);expect(m.prepare).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();
 });
 it("rejects contract destinations instead of underestimating their gas",async()=>{
  m.code.mockResolvedValue("0x1234");expect((await POST(request({action:"quote",listingId:"listing:test",amount:"10"}))).status).toBe(400);expect(m.command).not.toHaveBeenCalled();
 });
 it("does not replace unavailable estimates with the policy maximum",async()=>{
  m.prepare.mockRejectedValue(new Error("Fee estimate unavailable"));expect((await POST(request({action:"quote",listingId:"listing:test",amount:"10"}))).status).not.toBe(200);expect(m.command).not.toHaveBeenCalled();
 });
 it.each(["USDC","ETH"])("requires a fresh quote for old %s terms",async paymentAsset=>{
  m.read.mockResolvedValue({id:"order:test",kind:"order",owner:"buyer",status:"quoted",paymentAsset,escrow:{version:1,address:router}});
  expect((await POST(request({action:"accept",orderId:"order:test"}))).status).toBe(400);expect(m.command).not.toHaveBeenCalled();
 });
 it("returns accepted legacy orders without charging again",async()=>{
  m.read.mockResolvedValue({id:"order:test",kind:"order",owner:"buyer",status:"payment_pending",paymentAsset:"ETH",escrow:{version:1,address:router}});
  expect((await POST(request({action:"accept",orderId:"order:test"}))).status).toBe(200);expect(m.command).not.toHaveBeenCalled();expect(m.prepare).not.toHaveBeenCalled();
 });
});
