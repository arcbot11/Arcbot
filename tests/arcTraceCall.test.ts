import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData, zeroAddress, type Hex } from "viem";
import { arcConfig } from "../lib/arc/config";
import { arcTransport, clearArcTransportCache } from "../lib/arc/transport";
import { traceRead, traceReadOutput, TraceReadError } from "../lib/arc/trace-call";
import { quoteAbi, v4MultiQuoteAbi, V3_QUOTER, V4_QUOTER } from "../lib/arc/quotes";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const output = `0x${"0".repeat(63)}6` as Hex;
const call = {from: owner, to: token, data: "0x313ce567", value: "0x0"};
const params = [call, "0xa"];
const hash = `0x${"ab".repeat(32)}`;
const primary = "https://primary.example", secondary = "https://secondary.example";
const config = arcConfig({rpcUrl: primary, rpcFallbackUrls: [secondary], checkpointNumber: "10", checkpointHash: hash});
type Request = {method: string; params: unknown[]};
function trace(input: Record<string, unknown> = call) {
  return {output, trace: [{type: "call", traceAddress: [], action: {callType: "call", from: input.from ?? zeroAddress, to: input.to, input: input.data, value: input.value ?? "0x0"}, result: {output, gasUsed: "0x100"}}]};
}
const quota = {error: {code: -32600, message: "project ID exceeded quota"}};
function fixture(handle: (url: string, request: Request) => unknown, enabled = true) {
  const calls: (Request & {url: string})[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as Request;
    calls.push({url, method:request.method, params:request.params});
    const override = handle(url, request);
    if (override instanceof Response) return override;
    if (override !== undefined) return Response.json(override);
    const result = request.method === "eth_chainId" ? "0x13b2" : request.method === "eth_getBlockByNumber"
      ? {number: "0xa", hash, timestamp: `0x${Math.floor(Date.now()/1000).toString(16)}`} : output;
    return Response.json({result});
  }));
  const transport = arcTransport(config, {traceFallback: enabled})({chain: undefined});
  return {calls, request: (method = "eth_call", input: unknown[] = params) => transport.request({method, params: input})};
}
afterEach(() => {clearArcTransportCache(); vi.unstubAllGlobals(); vi.restoreAllMocks();});

describe("trace read scope", () => {
  it("permits pinned getters and preserves the complete call", () => {
    const input = {...call, gas: "0x100000", maxFeePerGas: "0x100", maxPriorityFeePerGas: "0x1"};
    expect(traceRead([input,"0xa"])).toEqual({call:input,block:"0xa"});
  });
  it.each([
    [{...call,value:"0x1"},"0xa"], [call,"latest"], [call,"pending"], [call,{blockHash:hash}],
    [call,"0xa",{}], [{...call,stateOverride:{}},"0xa"], [{...call,nonce:"0x1"},"0xa"],
    [{...call,gas:"invalid"},"0xa"], [{...call,to:zeroAddress},"0xa"], [{...call,from:"invalid"},"0xa"],
    [{...call,data:"0x"},"0xa"], [{...call,data:"0x313ce56700"},"0xa"],
    [{...call,data:"0x095ea7b3"+"0".repeat(128)},"0xa"], // approve
    [{...call,data:"0xa9059cbb"+"0".repeat(128)},"0xa"], // transfer
    [{...call,data:"0x3593564c"+"0".repeat(192)},"0xa"], // router execute
    [{...call,data:"0xdeadbeef"},"0xa"],
  ])("does not trace unsupported calls: %j", (...input) => {expect(traceRead(input)).toBeNull();});
  it("allows only the deployed quoters for V3 and both V4 quote shapes", () => {
    const poolKey = {currency0:owner,currency1:token,fee:10000,tickSpacing:200,hooks:zeroAddress};
    const quotes = [
      {to:V3_QUOTER,data:encodeFunctionData({abi:quoteAbi,functionName:"quoteExactInput",args:["0x1234",1n]})},
      {to:V4_QUOTER,data:encodeFunctionData({abi:quoteAbi,functionName:"quoteExactInputSingle",args:[{poolKey,zeroForOne:true,exactAmount:1n,hookData:"0x"}]})},
      {to:V4_QUOTER,data:encodeFunctionData({abi:v4MultiQuoteAbi,functionName:"quoteExactInput",args:[{exactCurrency:owner,path:[{intermediateCurrency:token,fee:10000,tickSpacing:200,hooks:zeroAddress,hookData:"0x"}],exactAmount:1n}]})},
    ];
    for (const q of quotes) {
      expect(traceRead([{...call,...q},"0xa"])).not.toBeNull();
      expect(traceRead([{...call,...q,to:token},"0xa"])).toBeNull();
    }
  });
});

describe("trace result validation", () => {
  const expected = traceRead(params)!;
  it("returns exact bytes and tolerates a caught nested revert", () => {
    const value = trace();
    const withNested = {...value,trace:[...value.trace,{type:"call",traceAddress:[0],error:"Reverted"}]};
    expect(traceReadOutput(withNested,expected)).toBe(output);
  });
  it.each(["Reverted","out of gas","Insufficient balance for transfer","invalid opcode"])("preserves root failure %s", error => {
    const value = trace();
    expect(() => traceReadOutput({...value,trace:[{...value.trace[0],error}]},expected)).toThrow(TraceReadError);
    try {traceReadOutput({...value,trace:[{...value.trace[0],error}]},expected);} catch (e) {
      expect(e).toMatchObject({retryable:false,data:output,code:error==="Reverted"?3:-32000});
    }
  });
  it.each(["to","from","input","value","callType"])("rejects mismatched root %s", field => {
    const value = trace();
    const bad = {...value,trace:[{...value.trace[0],action:{...value.trace[0].action,[field]:"0xbad"}}]};
    expect(() => traceReadOutput(bad,expected)).toThrow("Invalid Arc simulation trace");
  });
  it("rejects malformed or contradictory results", () => {
    const value=trace();
    for(const bad of [null,{}, {...value,output:"0x1"}, {...value,trace:[]}, {...value,trace:[...value.trace,...value.trace]},
      {...value,trace:[{...value.trace[0],result:{output:"0x00"}}]}, {...value,trace:[{...value.trace[0],result:null}]},
      {...value,trace:[{...value.trace[0],error:false}]}]) {
      expect(()=>traceReadOutput(bad,expected)).toThrow("Invalid Arc simulation trace");
    }
  });
});

describe("validated RPC trace fallback", () => {
  it("recovers quota errors with the same caller, calldata, gas and block", async () => {
    const f=fixture((_url,r)=>r.method==="eth_call"?quota:r.method==="trace_call"?{result:trace(r.params[0] as Record<string,unknown>)}:undefined);
    const input={...call,gas:"0x100000",gasPrice:"0x1"};
    expect(await f.request("eth_call",[input,"0xa"])).toBe(output);
    expect(f.calls.filter(c=>c.method==="trace_call")).toEqual([{url:primary,method:"trace_call",params:[input,["trace"],"0xa"]}]);
    expect(f.calls.filter(c=>c.url===primary&&c.method==="eth_chainId")).toHaveLength(1);
  });
  it.each([429,502,503])("recovers HTTP %s",async status=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?new Response("upstream",{status}):r.method==="trace_call"?{result:trace()}:undefined);
    expect(await f.request()).toBe(output);
  });
  it("keeps using a healthy trace while eth_call quota is cooling down",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?quota:r.method==="trace_call"?{result:trace()}:undefined);
    await f.request();await f.request();
    expect(f.calls.filter(c=>c.method==="eth_call")).toHaveLength(1);
    expect(f.calls.filter(c=>c.method==="trace_call")).toHaveLength(2);
  });
  it("deduplicates concurrent trace reads",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?quota:r.method==="trace_call"?{result:trace()}:undefined);
    await Promise.all([f.request(),f.request(),f.request()]);
    expect(f.calls.filter(c=>c.method==="trace_call")).toHaveLength(1);
  });
  it("does not retry execution reverts even if the revert text mentions quota",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?{error:{code:3,message:"execution reverted: upstream quota",data:"0x1234"}}:undefined);
    await expect(f.request()).rejects.toThrow();
    expect(f.calls.filter(c=>c.method==="eth_call")).toHaveLength(1);
    expect(f.calls.some(c=>c.method==="trace_call")).toBe(false);
  });
  it("does not fail over past a trace execution failure",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?quota:r.method==="trace_call"?{result:{...trace(),trace:[{...trace().trace[0],error:"Reverted"}]}}:undefined);
    await expect(f.request()).rejects.toThrow();
    expect(f.calls.filter(c=>c.method==="trace_call")).toHaveLength(1);
    expect(f.calls.some(c=>c.url===secondary)).toBe(false);
  });
  it.each([401,403])("does not bypass HTTP %s, including on later requests",async status=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?new Response("denied",{status}):undefined);
    await expect(f.request()).rejects.toThrow();await expect(f.request()).rejects.toThrow();
    expect(f.calls.some(c=>c.method==="trace_call")).toBe(false);
  });
  it("does not trace authorization errors encoded in JSON",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?{error:{code:-32603,message:"upstream access denied"}}:undefined);
    await expect(f.request()).rejects.toThrow();
    expect(f.calls.some(c=>c.method==="trace_call")).toBe(false);
  });
  it("tries a verified backup when the trace is malformed",async()=>{
    const f=fixture((url,r)=>r.method==="eth_call"?quota:r.method==="trace_call"?{result:url===primary?{output:"0x",trace:[]}:trace()}:undefined);
    expect(await f.request()).toBe(output);
    expect(f.calls.filter(c=>c.method==="trace_call").map(c=>c.url)).toEqual([primary,secondary]);
  });
  it("an unsupported trace does not cool down a merely transient eth_call",async()=>{
    let attempt=0;
    const f=fixture((url,r)=>{
      if(url!==primary)return;
      if(r.method==="eth_call")return ++attempt===1?{error:{code:-32603,message:"upstream unreachable"}}:{result:output};
      if(r.method==="trace_call")return {error:{code:-32601,message:"method not found"}};
    });
    await f.request();await f.request();
    expect(attempt).toBe(2);
    expect(f.calls.filter(c=>c.method==="trace_call")).toHaveLength(1);
  });
  it.each(["chain","checkpoint","head"])("excludes a provider with invalid %s before tracing",async failure=>{
    const f=fixture((url,r)=>{
      if(url===primary&&failure==="chain"&&r.method==="eth_chainId")return {result:"0x2105"};
      if(url===primary&&r.method==="eth_getBlockByNumber"&&failure!=="chain")return {result:{number:"0xa",hash:failure==="checkpoint"?`0x${"cd".repeat(32)}`:hash,timestamp:failure==="head"?"0x0":`0x${Math.floor(Date.now()/1000).toString(16)}`}};
      if(r.method==="eth_call")return quota;
      if(r.method==="trace_call")return {result:trace()};
    });
    expect(await f.request()).toBe(output);
    expect(f.calls.some(c=>c.url===primary&&["eth_call","trace_call"].includes(c.method))).toBe(false);
  });
  it("supports explicit disable for transaction preflight and settlement clients",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?quota:undefined,false);
    await expect(f.request()).rejects.toThrow();
    expect(f.calls.some(c=>c.method==="trace_call")).toBe(false);
    expect(arcTransport(config)).not.toBe(arcTransport(config,{traceFallback:false}));
  });
  it("does not trace actual approvals, transfers, or router execution",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_call"?quota:undefined);
    for(const data of ["0x", "0x095ea7b3"+"0".repeat(128), "0xa9059cbb"+"0".repeat(128), "0x3593564c"+"0".repeat(192)]){
      await expect(f.request("eth_call",[{...call,data},"0xa"])).rejects.toThrow();
    }
    expect(f.calls.some(c=>c.method==="trace_call")).toBe(false);
  });
  it("does not expose arbitrary traces or retry broadcasts",async()=>{
    const f=fixture((_url,r)=>r.method==="eth_sendRawTransaction"?new Response("upstream",{status:502}):undefined);
    await expect(f.request("trace_call",[call,["trace"],"0xa"])).rejects.toThrow();
    await expect(f.request("eth_sendRawTransaction",["0x02"])).rejects.toThrow();
    expect(f.calls.some(c=>c.method==="trace_call")).toBe(false);
    expect(f.calls.filter(c=>c.method==="eth_sendRawTransaction")).toHaveLength(1);
  });
});
