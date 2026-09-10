import {beforeEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({read:vi.fn(),session:vi.fn(),advance:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:m.session}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read})}));
vi.mock("../lib/otc/runtime",()=>({advanceTransaction:m.advance}));
import {GET} from "../app/api/wallet/transaction/route";
const address="0x1111111111111111111111111111111111111111";
const request=()=>new NextRequest("https://www.arcchainbot.io/api/wallet/transaction?id=trade:test");
beforeEach(()=>{vi.clearAllMocks();m.advance.mockImplementation(()=>m.read());m.session.mockResolvedValue({xUserId:"alice",walletAddress:address});m.read.mockResolvedValue({kind:"transaction",id:"trade:test",owner:"alice",wallet:address,status:"submitted",leg:"swap",raw:"secret raw bytes",unsigned:"unsigned bytes"});});
it("returns only safe status fields for the authenticated wallet",async()=>{
  const response=await GET(request());expect(response.status).toBe(200);
  expect(await response.json()).toEqual({id:"trade:test",status:"submitted",leg:"swap"});
});
it.each([{owner:"bob"},{wallet:"0x2222222222222222222222222222222222222222"},{kind:"listing"}])("rejects records outside this wallet: %j",async change=>{
  m.read.mockResolvedValue({...await m.read(),...change});expect((await GET(request())).status).toBe(404);
});

it("verifies submitted receipts without authorizing signing or rebroadcast",async()=>{m.advance.mockResolvedValue({...await m.read(),status:"completed"});expect(await(await GET(request())).json()).toMatchObject({status:"completed"});expect(m.advance).toHaveBeenCalledWith("trade:test",true);});
it("retains status if receipt verification fails",async()=>{m.advance.mockRejectedValue(Error("unavailable"));expect(await(await GET(request())).json()).toMatchObject({status:"submitted"});});
it("reports verified Base inclusion without treating it as finalized",async()=>{
 m.advance.mockResolvedValue({...await m.read(),chainId:8453,leg:"send",confirmation:{status:"success",blockNumber:"100"}});
 expect(await(await GET(request())).json()).toEqual({id:"trade:test",status:"submitted",leg:"send",confirmation:{status:"success",blockNumber:"100"}});
});
it("returns verified fill details without signed transaction bytes",async()=>{
 m.read.mockResolvedValue({...await m.read(),chainId:5042,status:"completed",swapOutput:{token:"0x3600000000000000000000000000000000000000",minimum:"9000000"},settlement:{gasWei:"1000000000000000",output:{raw:"10230000",decimals:6}}});
 const result=await(await GET(request())).json();
 expect(result.details).toContainEqual({label:"Received",value:"10.23 USDC"});
 expect(result).not.toHaveProperty("raw");expect(result).not.toHaveProperty("unsigned");
});
