import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { retryInteraction } from "../convex/xReplies";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("routes a real X handler through lookup and publication with zero wallet actions", async () => {
  vi.stubEnv("X_REPLIES_ENABLED", "true"); vi.stubEnv("X_STANDALONE_MENTIONS_ENABLED", "false"); vi.stubEnv("ARCDDICTED_API_KEY", "test-only");
  const address = "0xc162b1e2fa18d3b5d6064d01d55cedb1638da826";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, token: { address, symbol: "CMC" } }), { headers: { "content-type": "application/json" } })));
  const ctx = {
    runAction: vi.fn(() => { throw new Error("Wallet/AI action forbidden"); }),
    runQuery: vi.fn(async (ref: never) => {
      const name = getFunctionName(ref);
      if (name === "xReplies:getRetryContext") return { user: { xUserId: "test-human", username: "testhuman" }, interaction: { text: "@TheArgosBot what do you think about $CMC?", status: "received", authorXUserId: "test-human", createdAt: Date.now() } };
      if (name === "xFloodProtection:savedRadarResult") return null;
      if (name === "wallets:resolveKnownToken") return address;
      throw Error(`Unexpected query ${name}`);
    }),
    runMutation: vi.fn(async (ref: never) => {
      const name = getFunctionName(ref);
      if (name === "xFloodProtection:guardQueued") return { suppressed: false };
      if (name === "xFloodProtection:admitRadarScan") return {kind:"attempt",attempt:1};
      if (name === "xFloodProtection:finishRadarScan") return true;
      if (name === "xReplies:updateInteraction") return;
      if (name === "xReplyQueue:enqueue") return { status: "published", responsePostId: "mock-reply" };
      throw Error(`Unexpected mutation ${name}`);
    }),
  };
  await (retryInteraction as any)._handler(ctx, { postId: "mock-post" });
  expect(ctx.runAction).not.toHaveBeenCalled();
  const queued = ctx.runMutation.mock.calls.find(([ref]) => getFunctionName(ref) === "xReplyQueue:enqueue") as any;
  expect(queued?.[1]).toMatchObject({ allowLong: true, text: expect.stringContaining("Powered by ARCddicted Radar") });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(['busy','cached','retry','exhausted','mixed','ambiguous','ca-reply','ca-label','ca-natural'])('handles %s without wallet work',async scenario=>{
 vi.stubEnv('X_REPLIES_ENABLED','true');vi.stubEnv('X_STANDALONE_MENTIONS_ENABLED','false');vi.stubEnv('ARCDDICTED_API_KEY','test-only');
 const address='0xc162b1e2fa18d3b5d6064d01d55cedb1638da826';
 const caReply=scenario.startsWith('ca-');
 const text=scenario==='mixed'?'@TheArgosBot check $CMC and ARGUS':caReply?`@TheArgosBot ${scenario==='ca-label'?'CA: ':scenario==='ca-natural'?'here is the contract ':''}${address}`:'@TheArgosBot check CMC';
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,token:{address,symbol:'CMC'}}),{status:scenario==='retry'||scenario==='exhausted'?503:200,headers:{'content-type':'application/json'}}));
 vi.stubGlobal('fetch',fetcher);
 const ctx={scheduler:{runAfter:vi.fn()},runAction:vi.fn(()=>{throw Error('No wallet actions');}),
 runQuery:vi.fn(async(ref:never)=>{const name=getFunctionName(ref);
  if(name==='xReplies:getRetryContext')return {user:{xUserId:'human',username:'human'},interaction:{text,status:'received',authorXUserId:'human',createdAt:Date.now(),...(caReply?{parentPostId:'parent'}:{})}};
  if(name==='xReplies:ambiguousTokenReplyContext')return null;
  if(name==='xFloodProtection:radarClarification')return true;
  if(name==='xFloodProtection:savedRadarResult')return scenario==='cached'?'saved report':null;
  if(name==='wallets:resolveKnownToken'){if(scenario==='ambiguous'||scenario==='cached')throw Error('ambiguous');return address;}
  throw Error(name);
 }),runMutation:vi.fn(async(ref:never)=>{const name=getFunctionName(ref);
  if(name==='xFloodProtection:guardQueued')return {suppressed:false};
  if(name==='xReplies:updateInteraction')return;
  if(name==='xFloodProtection:admitRadarScan')return scenario==='busy'?{kind:'busy',waitMs:60000}:scenario==='cached'?{kind:'cached',message:'saved report'}:{kind:'attempt',attempt:scenario==='exhausted'?4:1};
  if(name==='xFloodProtection:finishRadarScan')return true;
  if(name==='xReplyQueue:enqueue')return {status:'published',responsePostId:'reply'};
  throw Error(name);
 })};
 await (retryInteraction as any)._handler(ctx,{postId:'post'});
 expect(ctx.runAction).not.toHaveBeenCalled();
 const queued=ctx.runMutation.mock.calls.find(([ref])=>getFunctionName(ref)==='xReplyQueue:enqueue') as any;
 if(scenario==='busy'||scenario==='retry'){expect(queued).toBeUndefined();expect(ctx.scheduler.runAfter).toHaveBeenCalled();}
 else {expect(queued).toBeDefined();
  if(scenario==='mixed'||scenario==='ambiguous')expect(queued[1].text).toContain('Reply with one full contract address');
  if(scenario==='cached'){expect(queued[1].text).toBe('saved report');expect(ctx.runQuery.mock.calls.some(([ref])=>getFunctionName(ref)==='wallets:resolveKnownToken')).toBe(false);expect(ctx.runMutation.mock.calls.some(([ref])=>getFunctionName(ref)==='xFloodProtection:admitRadarScan')).toBe(false);}
  if(scenario==='exhausted')expect(queued[1].text).toContain('temporarily unavailable');
 }
 expect(fetcher).toHaveBeenCalledTimes((['retry','exhausted'].includes(scenario)||caReply)?1:0);
 if(scenario==='mixed'||scenario==='ambiguous')expect(ctx.runMutation.mock.calls.some(([ref])=>getFunctionName(ref)==='xFloodProtection:admitRadarScan')).toBe(false);
});
