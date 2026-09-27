import { afterEach, describe, expect, it, vi } from "vitest";
import { type Address, type Hex } from "viem";
import { BridgeReads } from "../lib/bridge/read";
import { inspect, lookupReport, reverseRoute } from "../lib/bridge-api/lookup";
import { inputSchema, type Report, type Pair, type LookupCache } from "../lib/bridge-api/model";
import { handleLookup } from "../lib/bridge-api/handler";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { encode, parsePayment, type PaymentGateway } from "../lib/bridge-api/payments";
import type { ApiStore, RequestRecord } from "../lib/bridge-api/store";
import type { Route } from "../lib/bridge/contracts";
import type { PaymentRequirements } from "@x402/core/types";
const a = "0x1111111111111111111111111111111111111111" as Address;
const b = "0x2222222222222222222222222222222222222222" as Address;
const route: Route = { source: 5042, destination: 8453, origin: 5042, original: a, token: a, counterpart: b, tokenId: `0x${"1".repeat(64)}`, manager: a, destinationManager: b, name: "Example", symbol: "EX", decimals: 18, state: "ready", compatible: true };
const input = inputSchema.parse({ token: a, chain: "arc" });
function store(): ApiStore & { rows: Map<string,RequestRecord & { paymentKey: string; recoveryHash: string }>; pairs: Pair[] } {
  const cache = new Map<string,LookupCache>(); const rows = new Map<string,RequestRecord & { paymentKey: string; recoveryHash: string }>(); const pairs: Pair[] = [];
  return { rows, pairs,
    getCache: vi.fn(async key => cache.get(key) || null),
    getPair: vi.fn(async (chain, token) => pairs.find(p => (chain === 5042 ? p.arcAddress : p.baseAddress) === token) || null),
    save: vi.fn(async (key, report, ps) => { cache.set(key,{ report, expiresAt: Date.now()+30000 }); pairs.push(...ps); }),
    limit: vi.fn(async () => true),
    claim: vi.fn(async i => { const row = rows.get(i.requestId); if(row) return {kind: row.inputKey === i.inputKey && row.recoveryHash === i.recoveryHash ? "existing" : "conflict", request: row}; rows.set(i.requestId,{...i,state:"processing"}); return {kind:"claimed"}; }),
    update: vi.fn(async (id, state, resultJson, receiptJson) => { const row = rows.get(id)!; Object.assign(row,{state},resultJson?{resultJson}:{},receiptJson?{receiptJson}:{}); }),
    recover: vi.fn(async (id, proof) => { const row = rows.get(id); return row && row.recoveryHash===proof ? row : null; }),
  };
}
const report: Report = { schemaVersion:"1", scope:"circle-ownerless-arc-base", input, status:"complete", candidates:[], observedAt:new Date().toISOString(), cached:false, cacheAgeMs:0, verificationMeaning:"test" };
const config = { price:"0.005",atomicPrice:"5000",payTo:a,rail:"gateway" as const,origin:"https://example.com",configured:true,enabled:true };
function proof(nonce = "1") { return {x402Version:2,accepted:{scheme:"exact",network:"eip155:5042",asset:a,amount:"5000",payTo:a,maxTimeoutSeconds:120},payload:{signature:`0x${"ab".repeat(65)}`,authorization:{from:b,to:a,value:"5000",validAfter:"0",validBefore:"9999999999",nonce:`0x${nonce.repeat(64)}`}}}; }
const req = (p: unknown = proof(), token = a) => new Request(`https://example.com/api/v1/bridge/lookup?token=${token}&chain=arc`,{headers:p?{"Payment-Signature":encode(p)}:{}});
function gateway(): PaymentGateway { return { challenge:vi.fn(async () => ({x402Version:2,resource:{url:"https://example.com"},accepts:[]})),verify:vi.fn(async () => proof().accepted as PaymentRequirements),settle:vi.fn(async () => ({success:true,network:"eip155:5042" as const,transaction:"receipt-id"})),cancel:vi.fn(async()=>{}) }; }
afterEach(()=>vi.restoreAllMocks());
describe("bridge lookup roles and persistence",()=>{
  it.each([5042,8453] as const)("labels both directions for an original on %s",async origin=>{
    const r = {...route, source:origin,destination:origin===5042?8453:5042,origin} as Route;
    const reader = new BridgeReads(false,true);
    vi.spyOn(reader,"route").mockResolvedValue(r); vi.spyOn(reader,"code").mockResolvedValue("0x01");
    vi.spyOn(reader,"read").mockImplementation(async (_c,_a,fn) => (fn === "name" ? "Wrapped Example" : fn === "symbol" ? "EX" : 0n) as never); vi.spyOn(reader,"canonical").mockResolvedValue();
    vi.spyOn(reader,"head").mockResolvedValue({number:100n,hash:`0x${"2".repeat(64)}`,timestamp:1n} as never);
    const forward = await inspect(origin,a,false,undefined,reader);
    expect(forward.candidate.original?.chainId).toBe(origin);
    expect(forward.candidate.wrapped?.chainId).toBe(r.destination);
    expect(forward.candidate.wrappedSupply?.raw).toBe("0");
    expect(forward.candidate.source?.role).toBe("original");
    vi.spyOn(reader,"route").mockResolvedValue(reverseRoute(r));
    const backward = await inspect(r.destination,b,false,undefined,reader);
    expect(backward.candidate.source?.role).toBe("wrapped");
    expect(backward.candidate.destination?.role).toBe("original");
    expect(backward.candidate.operation).toBe("burn_and_unlock");
    expect(backward.candidate.wrappedSupply?.chainId).toBe(r.destination);
  });
  it("serves repeat snapshots without repeating chain discovery",async()=>{
    const db=store(); const read=vi.fn(async(..._args: Parameters<typeof inspect>)=>({candidate:{inputChainId:5042,status:"verified",connectionExists:true,ownerlessVerified:true,source:{chainId:5042}} as never,route}));
    await lookupReport(input,db,read); const second=await lookupReport(input,db,read);
    expect(read).toHaveBeenCalledTimes(1); expect(second.cached).toBe(true);expect(db.pairs).toHaveLength(1);
    await lookupReport({...input,token:b,chain:"base"},db,read);
    expect(read.mock.calls[1]?.[3]).toMatchObject({source:8453,token:b,counterpart:a});
  });
  it("does not cache failed RPCs as missing bridges",async()=>{
    const db=store();const r=await lookupReport(input,db,async()=>{throw Error("RPC down https://secret-provider");});
    expect(r.status).toBe("unavailable");expect(r.candidates[0].connectionExists).toBeNull();expect(db.save).not.toHaveBeenCalled();expect(JSON.stringify(r)).not.toContain("secret-provider");
  });
  it("retains ambiguous same-address candidates instead of selecting one",async()=>{
    const r=await lookupReport({...input,chain:undefined},store(),async chain=>({candidate:{inputChainId:chain,status:"verified",source:{chainId:chain},connectionExists:true,ownerlessVerified:true} as never}));
    expect(r.status).toBe("ambiguous");expect(r.candidates).toHaveLength(2);
  });
  it("keeps paused connections visible",async()=>{
    const reader=new BridgeReads(false,true);reader.operationalIssues.add("8453:manager_paused");
    vi.spyOn(reader,"route").mockResolvedValue(route); vi.spyOn(reader,"code").mockResolvedValue("0x01");vi.spyOn(reader,"read").mockImplementation(async (_c,_a,fn) => (fn === "name" ? "Wrapped Example" : fn === "symbol" ? "EX" : 5n) as never);
    vi.spyOn(reader,"head").mockResolvedValue({number:1n,hash:"0xaa",timestamp:1n} as never);vi.spyOn(reader,"canonical").mockResolvedValue();
    const r=await inspect(5042,a,false,undefined,reader);expect(r.candidate.status).toBe("verified");expect(r.candidate.operational?.status).toBe("paused");
  });
});
describe("paid service lifecycle",()=>{
  it.each(["/api/v1/bridge/lookup", "/api/v1/bridge/lookup/direct"])("offers catalogue metadata without selecting a token at %s", async path => {
    const db=store(),g=gateway(),lookup=vi.fn();
    const response=await handleLookup(new Request("https://www.argosbot.io"+path),{config,store:db,gateway:g,lookup});
    expect(response.status).toBe(402);
    const body=await response.json();
    expect(body.parameters.find((p:{name:string})=>p.name==="token").required).toBe(true);
    expect(JSON.parse(Buffer.from(response.headers.get("payment-required")!,"base64").toString())).toEqual(body);
    expect(g.challenge).toHaveBeenCalledWith(expect.stringMatching(new RegExp(path+"$")));
    expect(lookup).not.toHaveBeenCalled();expect(g.verify).not.toHaveBeenCalled();expect(g.settle).not.toHaveBeenCalled();
    const paid=await handleLookup(new Request("https://www.argosbot.io"+path,{headers:{"Payment-Signature":encode(proof())}}),{config,store:db,gateway:g,lookup});
    expect(paid.status).toBe(400);expect(g.verify).not.toHaveBeenCalled();expect(db.claim).not.toHaveBeenCalled();
    expect((await handleLookup(new Request("https://www.argosbot.io"+path+"?chain=arc"),{config,store:db,gateway:g})).status).toBe(400);
    expect((await handleLookup(new Request("https://www.argosbot.io"+path),{config:{...config,enabled:false},store:db,gateway:g})).status).toBe(503);
  });
  it("returns a client-readable fresh challenge when verification rejects payment",async()=>{
    const db=store(),g=gateway();vi.mocked(g.verify).mockResolvedValue(null);
    const r=await handleLookup(req(),{config,store:db,gateway:g});
    expect(r.status).toBe(402);
    const body=await r.json();
    const challenge=new x402HTTPClient(new x402Client()).getPaymentRequiredResponse(name=>r.headers.get(name),body);
    expect(challenge).toEqual(body);expect(challenge.x402Version).toBe(2);
    expect(g.challenge).toHaveBeenCalledWith(expect.stringContaining("?token="));
    expect(db.claim).not.toHaveBeenCalled();expect(g.settle).not.toHaveBeenCalled();
  });
  it("recovers paid results while purchases are disabled without re-verification",async()=>{
    const db=store(),g=gateway();
    await handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>report});
    vi.mocked(g.verify).mockClear();
    const r=await handleLookup(req(),{config:{...config,enabled:false},store:db,gateway:g});
    expect(r.status).toBe(200);expect((await r.json()).recovered).toBe(true);
    expect(g.verify).not.toHaveBeenCalled();expect(g.settle).toHaveBeenCalledTimes(1);
    expect((await handleLookup(req(proof("2")),{config:{...config,enabled:false},store:db,gateway:g})).status).toBe(503);
    expect(g.verify).not.toHaveBeenCalled();
  });
  it("reconciles an existing uncertain payment while purchases are disabled",async()=>{
    const db=store(),g=gateway();vi.mocked(g.settle).mockRejectedValue(Error("lost response"));
    await handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>report});
    const r=await handleLookup(req(),{config:{...config,enabled:false},store:db,gateway:g,reconcile:async()=>({success:true,network:"eip155:5042",transaction:"confirmed"})});
    expect(r.status).toBe(200);expect(g.settle).toHaveBeenCalledTimes(1);
  });
  it("is disabled without explicit activation",async()=>{const g=gateway(); const r=await handleLookup(req(),{config:{...config,enabled:false},gateway:g});expect(r.status).toBe(503);expect(g.verify).not.toHaveBeenCalled();});
  it("quotes unpaid requests without running RPC lookups",async()=>{const read=vi.fn();const r=await handleLookup(req(null),{config,store:store(),gateway:gateway(),lookup:read});expect(r.status).toBe(402);expect(r.headers.get("payment-required")).toBeTruthy();expect(read).not.toHaveBeenCalled();});
  it("durably stores result before settlement and recovers without charging twice",async()=>{
    const db=store(),g=gateway(),read=vi.fn(async()=>report);
    vi.mocked(g.settle).mockImplementation(async()=>{expect([...db.rows.values()][0].state).toBe("settling");expect([...db.rows.values()][0].resultJson).toBeTruthy();return{success:true,network:"eip155:5042",transaction:"receipt"};});
    expect((await handleLookup(req(),{config,store:db,gateway:g,lookup:read})).status).toBe(200);
    const again=await handleLookup(req(),{config,store:db,gateway:g,lookup:read});expect(again.status).toBe(200);expect(g.settle).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledTimes(1);
    expect((await handleLookup(req(proof(),b),{config,store:db,gateway:g,lookup:read})).status).toBe(409);
    expect(again.headers.get("cache-control")).toContain("no-store");
  });
  it("does not settle an unavailable lookup",async()=>{
    const db=store(),g=gateway(); const r=await handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>({...report,status:"unavailable"})});
    expect(r.status).toBe(503);expect(g.settle).not.toHaveBeenCalled();expect([...db.rows.values()][0].state).toBe("not_charged");
  });
  it("never retries uncertain settlement",async()=>{
    const db=store(),g=gateway(); vi.mocked(g.settle).mockRejectedValue(Error("Timeout after possible settlement"));
    await handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>report});
    expect([...db.rows.values()][0].state).toBe("uncertain");
    expect((await handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>report})).status).toBe(409);expect(g.settle).toHaveBeenCalledTimes(1);
  });
  it("recovers a lost receipt through read-only reconciliation, without a second settlement",async()=>{
    const db=store(),g=gateway(); const originalUpdate=db.update;
    db.update=vi.fn(async(id,state,result,receipt)=>{if(state === "settled") throw Error("database unavailable after payment");return originalUpdate(id,state,result,receipt);});
    expect((await handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>report})).status).toBe(503);
    expect([...db.rows.values()][0].state).toBe("uncertain");db.update=originalUpdate;
    const reconcile=vi.fn(async()=>({success:true,network:"eip155:5042" as const,transaction:"confirmed-transfer"}));
    const r=await handleLookup(req(),{config,store:db,gateway:g,reconcile});
    expect(r.status).toBe(200);expect(g.settle).toHaveBeenCalledTimes(1);expect(reconcile).toHaveBeenCalledTimes(1);
  });
  it("never settles before the prepared result is durable",async()=>{
    const db=store(),g=gateway();const update=db.update;
    db.update=async(id,state,result,receipt)=>{if(state==="prepared")throw Error("write failed");return update(id,state,result,receipt);};
    const r=await handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>report});
    expect(r.status).toBe(503);expect(g.settle).not.toHaveBeenCalled();expect([...db.rows.values()][0].state).toBe("not_charged");
  });
  it("blocks duplicate settlements during concurrent requests",async()=>{
    const db=store(),g=gateway();await Promise.all([1,2].map(()=>handleLookup(req(),{config,store:db,gateway:g,lookup:async()=>report})));
    expect(g.settle).toHaveBeenCalledTimes(1);
  });
  it("nonce identity survives signature and untrusted metadata changes",()=>{
    const p=proof(); const first=parsePayment(encode(p));p.payload.signature=`0x${"cd".repeat(65)}`;
    const second=parsePayment(encode({...p,accepted:{...p.accepted,extra:{name:"attacker"}}}));expect(second.paymentKey).toBe(first.paymentKey);expect(second.recoveryHash).not.toBe(first.recoveryHash);
  });
  it("rejects invalid or duplicate query arguments before payment",async()=>{
    const g=gateway();const r=await handleLookup(new Request(`https://example.com/api/v1/bridge/lookup?token=${a}&token=${b}`),{config,gateway:g});expect(r.status).toBe(400);expect(g.verify).not.toHaveBeenCalled();
  });
});
