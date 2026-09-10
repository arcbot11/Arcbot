import {beforeEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({read:vi.fn(),session:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:m.session}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read})}));
import {GET} from "../app/api/wallet/transaction/route";
const address="0x1111111111111111111111111111111111111111";
const request=()=>new NextRequest("https://www.arcchainbot.io/api/wallet/transaction?id=trade:test");
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({xUserId:"alice",walletAddress:address});m.read.mockResolvedValue({kind:"transaction",id:"trade:test",owner:"alice",wallet:address,status:"submitted",leg:"swap",raw:"secret raw bytes",unsigned:"unsigned bytes"});});
it("returns only safe status fields for the authenticated wallet",async()=>{
  const response=await GET(request());expect(response.status).toBe(200);
  expect(await response.json()).toEqual({id:"trade:test",status:"submitted",leg:"swap"});
});
it.each([{owner:"bob"},{wallet:"0x2222222222222222222222222222222222222222"},{kind:"listing"}])("rejects records outside this wallet: %j",async change=>{
  m.read.mockResolvedValue({...await m.read(),...change});expect((await GET(request())).status).toBe(404);
});
