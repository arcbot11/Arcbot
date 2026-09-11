import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("convex/browser",()=>({ConvexHttpClient:class{async action(){return true;}}}));
import {GET} from "../app/api/auth/x/start/route";
import {createWebWalletSession,WEB_WALLET_SESSION_COOKIE} from "../lib/web-wallet-session";
const secret="test-session-secret";
let cookie:string;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));for(const [k,v]of Object.entries({WEB_AUTH_SECRET:secret,X_OAUTH_CLIENT_ID:"client",NEXT_PUBLIC_SITE_URL:"https://www.argosbot.io",NEXT_PUBLIC_CONVEX_URL:"https://test.convex.cloud"}))vi.stubEnv(k,v);cookie=createWebWalletSession("0x1111111111111111111111111111111111111111","123","tester",secret);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
const request=()=>new NextRequest("https://www.argosbot.io/api/auth/x/start?returnTo=/otc",{headers:{cookie:`${WEB_WALLET_SESSION_COOKIE}=${cookie}`}});
it("keeps a fresh session without an unnecessary OAuth round trip",async()=>{expect((await GET(request())).headers.get("location")).toBe("https://www.argosbot.io/otc");});
it("preserves wallet-specific destinations during login",async()=>{
  const path="/wallet/0x1111111111111111111111111111111111111111";
  const response=await GET(new NextRequest(`https://www.argosbot.io/api/auth/x/start?returnTo=${encodeURIComponent(path)}`));
  expect(response.cookies.get("argus_x_oauth_return")?.value).toBe(path);
});
it("starts OAuth after 30 minutes even though the two-hour session is still valid",async()=>{vi.advanceTimersByTime(30*60*1000);expect((await GET(request())).headers.get("location")).toMatch(/^https:\/\/x.com\/i\/oauth2\/authorize/);});
