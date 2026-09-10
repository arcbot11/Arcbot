import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicClient } from "viem";
import { arcConfig } from "../lib/arc/config";
import { arcTransport, clearArcTransportCache } from "../lib/arc/transport";

const hash = `0x${"ab".repeat(32)}`;
const primary = "https://primary.example", secondary = "https://secondary.example", readOnly = "https://read.example";
const config = arcConfig({ rpcUrl: primary, rpcFallbackUrls: [secondary], readOnlyRpcUrls: [readOnly], checkpointNumber: "10", checkpointHash: hash });
function fixture(handle: (url: string, method: string) => any) {
  const calls: { url: string; method: string; params: unknown[] }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: any) => {
    const { method, params } = JSON.parse(options.body); calls.push({ url, method, params });
    const override = handle(url, method);
    const result = override ?? (method === "eth_chainId" ? "0x13b2" : method === "eth_getBlockByNumber" ? { number: "0xa", hash, timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` } : "0x2");
    return new Response(JSON.stringify(result?.error ? result : { result }));
  }));
  const client = createPublicClient({ transport: arcTransport(config) });
  return { calls, client };
}
afterEach(() => { clearArcTransportCache(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Arc RPC failover", () => {
  it("shares provider validation across concurrent reads", async () => {
    const f = fixture(() => undefined);
    await Promise.all(Array.from({length:8},()=>f.client.getBalance({address:"0x1111111111111111111111111111111111111111"})));
    expect(f.calls.filter(c=>c.method==="eth_chainId")).toHaveLength(1);
    expect(f.calls.filter(c=>c.method==="eth_getBlockByNumber")).toHaveLength(2);
  });
  it("cools down failed providers and validates them again before recovery", async () => {
    let now=Date.now(), offline=true;
    vi.spyOn(Date,"now").mockImplementation(()=>now);
    const f=fixture((url)=>{if(url===primary&&offline)throw Error("offline");});
    await f.client.getBalance({address:"0x1111111111111111111111111111111111111111"});
    await f.client.getBalance({address:"0x1111111111111111111111111111111111111111"});
    expect(f.calls.filter(c=>c.url===primary)).toHaveLength(1);
    now+=11000;offline=false;
    await f.client.getBalance({address:"0x1111111111111111111111111111111111111111"});
    expect(f.calls.filter(c=>c.url===primary&&c.method==="eth_getBlockByNumber")).toHaveLength(2);
    expect(f.calls.at(-1)?.url).toBe(primary);
  });
  it("revalidates after the freshness cache expires",async()=>{
    let now=Date.now();vi.spyOn(Date,"now").mockImplementation(()=>now);
    const f=fixture(()=>undefined);
    await f.client.getBalance({address:"0x1111111111111111111111111111111111111111"});now+=6000;
    await f.client.getBalance({address:"0x1111111111111111111111111111111111111111"});
    expect(f.calls.filter(c=>c.method==="eth_chainId")).toHaveLength(2);
  });
  it("does not repeat a quota-failing method for each read",async()=>{
    const f=fixture((url,method)=>url===primary&&method==="eth_call"?{error:{code:-32600,message:"quota"}}:undefined);
    for(let i=0;i<3;i++)await f.client.request({method:"eth_call",params:[{},"latest"]});
    expect(f.calls.filter(c=>c.url===primary&&c.method==="eth_call")).toHaveLength(1);
  });
  it("falls back on contract-call quota errors", async () => {
    const f = fixture((url, method) => url !== readOnly && method === "eth_call" ? { error: { code: -32600, message: "project ID exceeded quota" } } : undefined);
    expect(await f.client.request({ method: "eth_call", params: [{ to: "0x1111111111111111111111111111111111111111" }, "latest"] })).toBe("0x2");
    expect(f.calls.filter(c => c.method === "eth_call").map(c => c.url)).toEqual([primary, readOnly]);
  });
  it("excludes a wrong-chain provider before a read", async () => {
    const f = fixture((url, method) => url === primary && method === "eth_chainId" ? "0x2105" : undefined);
    expect(await f.client.getBalance({ address: "0x1111111111111111111111111111111111111111" })).toBe(2n);
    expect(f.calls.some(c => c.url === primary && c.method === "eth_getBalance")).toBe(false);
  });
  it("rejects stale providers", async () => {
    const f = fixture((_url, method) => method === "eth_getBlockByNumber" ? { number: "0xa", hash, timestamp: "0x0" } : undefined);
    await expect(f.client.getBlockNumber()).rejects.toThrow();
    expect(f.calls.some(c => c.method === "eth_blockNumber")).toBe(false);
  });
  it("does not retry or fail over after an ambiguous broadcast", async () => {
    const f = fixture((_url, method) => { if (method === "eth_sendRawTransaction") throw new Error("connection reset"); });
    await expect(f.client.sendRawTransaction({ serializedTransaction: "0x02" })).rejects.toThrow();
    expect(f.calls.filter(c => c.method === "eth_sendRawTransaction")).toEqual([{ url: primary, method: "eth_sendRawTransaction", params: ["0x02"] }]);
  });
  it("never broadcasts through the read-only provider", async () => {
    const f = fixture((url) => { if (url !== readOnly) throw new Error("offline"); });
    await expect(f.client.sendRawTransaction({ serializedTransaction: "0x02" })).rejects.toThrow();
    expect(f.calls.some(c => c.url === readOnly)).toBe(false);
  });
  it("selects a healthy backup before the sole broadcast attempt", async () => {
    const f = fixture((url, method) => { if (url === primary) throw new Error("offline"); if (method === "eth_sendRawTransaction") return hash; });
    expect(await f.client.sendRawTransaction({ serializedTransaction: "0x02" })).toBe(hash);
    expect(f.calls.filter(c => c.method === "eth_sendRawTransaction").map(c => c.url)).toEqual([secondary]);
  });
  it("rejects an endpoint with the wrong checkpoint", async () => {
    const f = fixture((url, method) => url === primary && method === "eth_getBlockByNumber" ? { number: "0xa", hash: `0x${"cd".repeat(32)}` } : undefined);
    await f.client.getBlockNumber();
    expect(f.calls.filter(c => c.method === "eth_blockNumber").map(c => c.url)).toEqual([secondary]);
  });
  it("does not treat a contract revert as an outage", async () => {
    const f = fixture((_url, method) => method === "eth_call" ? { error: { code: 3, message: "execution reverted", data: "0x1234" } } : undefined);
    await expect(f.client.request({ method: "eth_call", params: [{}, "latest"] })).rejects.toThrow();
    expect(f.calls.filter(c => c.method === "eth_call")).toHaveLength(1);
  });
});

it("shares validated transports across clients with identical configuration",()=>{expect(arcTransport(config)).toBe(arcTransport({...config}));});
