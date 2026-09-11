import {beforeEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({drain:vi.fn()}));
vi.mock("../lib/otc/runtime",()=>({drainWork:m.drain}));
import {POST} from "../app/api/otc/worker/route";
beforeEach(()=>{vi.stubEnv("OTC_SERVICE_SECRET","test-secret-for-worker-health-check");m.drain.mockReset();});
it.each([0,1])("returns a failure HTTP status when %s jobs fail",async failed=>{
 m.drain.mockResolvedValue({processed:3,failed,observedQueue:4,oldestAgeSeconds:20});
 const r=await POST(new NextRequest("https://example.test/api/otc/worker",{method:"POST",headers:{authorization:"Bearer test-secret-for-worker-health-check"}}));
 expect(r.status).toBe(failed?503:200);expect(await r.json()).toMatchObject({failed});
});
it("never starts unauthenticated work",async()=>{expect((await POST(new NextRequest("https://example.test/api/otc/worker",{method:"POST"}))).status).toBe(401);expect(m.drain).not.toHaveBeenCalled();});
