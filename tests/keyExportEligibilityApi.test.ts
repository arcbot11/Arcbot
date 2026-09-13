import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({session:vi.fn(),action:vi.fn()}));
vi.mock("../lib/otc/http",()=>({websiteSession:mocks.session}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class{action=mocks.action;}}));
import {GET} from "../app/api/wallet/key-export/route";
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("WALLET_EXPORT_ENABLED","true");vi.stubEnv("WALLET_EXPORT_RUNTIME","shared");vi.stubEnv("WEB_AUTH_SECRET","private-server-secret");mocks.session.mockResolvedValue({xUserId:"1",provider:"x"});mocks.action.mockResolvedValue({eligible:true});});
afterEach(()=>vi.unstubAllEnvs());
it("derives the owner from the active session and ignores requested owner/address values",async()=>{
 const response=await GET(new NextRequest("https://www.argosbot.io/api/wallet/key-export?userId=attacker&provider=telegram"));
 expect(await response.json()).toEqual({eligible:true});expect(response.headers.get("cache-control")).toBe("no-store");
 expect(mocks.action).toHaveBeenCalledWith(expect.anything(),{secret:"private-server-secret",provider:"x",userId:"1"});
});
it("uses Telegram's numeric ID for a Telegram website session",async()=>{
 mocks.session.mockResolvedValue({provider:"telegram",telegramUserId:"2"});
 await GET(new NextRequest("https://www.argosbot.io/api/wallet/key-export"));
 expect(mocks.action).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({provider:"telegram",userId:"2"}));
});
it.each(["disabled","broker","signed-out","backend-failure"])("hides export for %s without leaking details",async mode=>{
 if(mode==="disabled")vi.stubEnv("WALLET_EXPORT_ENABLED","false");if(mode==="broker")vi.stubEnv("WALLET_EXPORT_RUNTIME","broker");
 if(mode==="signed-out")mocks.session.mockRejectedValue(Error("private details"));if(mode==="backend-failure")mocks.action.mockRejectedValue(Error("private details"));
 const response=await GET(new NextRequest("https://www.argosbot.io/api/wallet/key-export"));expect(await response.json()).toEqual({eligible:false});
 if(mode!=="backend-failure")expect(mocks.action).not.toHaveBeenCalled();
});

