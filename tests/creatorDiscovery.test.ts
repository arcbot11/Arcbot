import { afterEach, expect, it, vi } from "vitest";
const query=vi.hoisted(()=>vi.fn());
vi.mock("convex/browser",()=>({ConvexHttpClient:class{query=query;}}));
vi.mock("../lib/otc/runtime",()=>({}));
import { creatorTokens } from "../lib/launches/fee-service";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("marks an empty feed incomplete when the local launch registry fails",async()=>{
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL","https://example.convex.cloud");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("[]")));
  query.mockRejectedValue(Error("Registry temporarily unavailable"));
  const diagnostic:{incomplete?:boolean}={};
  expect(await creatorTokens("0x1111111111111111111111111111111111111111",diagnostic)).toEqual([]);
  expect(diagnostic.incomplete).toBe(true);
});
