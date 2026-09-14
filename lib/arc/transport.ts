import { custom } from "viem";
import type { ArcConfig } from "./config";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isBlock = (value: unknown): value is { number: string; hash: string; timestamp: string } =>
  isRecord(value) && typeof value.number === "string" && typeof value.hash === "string" && typeof value.timestamp === "string";

const reads = new Set(["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getLogs", "eth_getTransactionReceipt", "eth_getTransactionByHash", "debug_traceCall", "debug_traceTransaction"]);
class RpcFailure extends Error {
  readonly code:number;readonly retryable:boolean;readonly data?:unknown;readonly transient:boolean;readonly cooldownMs:number;
  constructor(message:string,code:number,retryable:boolean,data?:unknown,transient=false,cooldownMs=5000){super(message);this.code=code;this.retryable=retryable;this.data=data;this.transient=transient;this.cooldownMs=cooldownMs;}
}

const transports=new Map<string,ReturnType<typeof createArcTransport>>();
export function clearArcTransportCache(){transports.clear();}
export function arcTransport(config:ArcConfig){
  const key=JSON.stringify(config,(_,value)=>typeof value==="bigint"?value.toString():value);
  let transport=transports.get(key);
  if(!transport){if(transports.size>=16)transports.delete(transports.keys().next().value!);transport=createArcTransport(config);transports.set(key,transport);}
  return transport;
}

/** Validated read failover; a broadcast is attempted on exactly one provider. */
function createArcTransport(config: ArcConfig) {
  const verifiedUntil = new Map<string, number>();
  const unavailableUntil = new Map<string, number>();
  const validating = new Map<string, Promise<void>>();
  const methodUnavailableUntil = new Map<string, number>();
  const validationEvidence=new Map<string,{chain:unknown;checkpoint:unknown}>();
  const inFlightReads=new Map<string,Promise<unknown>>();
  async function call(url:string,method:string,params:readonly unknown[]=[]):Promise<unknown>{
    if(method==="eth_sendRawTransaction")return rawCall(url,method,params);
    const key=JSON.stringify([url,method,params]),existing=inFlightReads.get(key);
    if(existing)return existing;
    const request=rawCall(url,method,params);inFlightReads.set(key,request);
    try{return await request;}finally{if(inFlightReads.get(key)===request)inFlightReads.delete(key);}
  }
  async function rawCall(url: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
    } catch { throw new RpcFailure("Arc RPC connection unavailable", -32098, true, undefined, true); }
    if (!response.ok) throw new RpcFailure(`Arc RPC HTTP ${response.status}`, -32098, [401, 403, 408, 429].includes(response.status) || response.status >= 500, undefined, response.status === 408 || response.status >= 500,[401,403,429].includes(response.status)?60000:5000);
    let body: unknown;
    try { body = await response.json(); } catch { throw new RpcFailure("Invalid Arc RPC response", -32098, true); }
    if (!isRecord(body)) throw new RpcFailure("Invalid Arc RPC response", -32098, true);
    if (body.error) {
      if (!isRecord(body.error)) throw new RpcFailure("Invalid Arc RPC error", -32098, true);
      const code = Number(body.error.code), message = String(body.error.message || "RPC error");
      const retryable = code === -32601 || /quota|rate.?limit|too many requests|temporarily unavailable|upstream|method_not_served/i.test(message) || (isRecord(body.error.data) && body.error.data.reason === "unreachable");
      // Never include endpoint URLs or provider diagnostics that might expose keys.
      const transient = /temporarily unavailable|upstream/i.test(message) || (isRecord(body.error.data) && body.error.data.reason === "unreachable");
      throw new RpcFailure(retryable ? "Arc RPC capacity or method unavailable" : "Arc RPC rejected request", code, retryable, retryable ? undefined : body.error.data, transient,code===-32601||/quota|rate.?limit|too many requests|method_not_served/i.test(message)?60000:5000);
    }
    if (!Object.prototype.hasOwnProperty.call(body, "result")) throw new RpcFailure("Missing Arc RPC result", -32098, true);
    return body.result;
  }
  async function verify(url: string) {
    // A transient identity-read miss is not proof that an otherwise healthy
    // provider is unusable for every wallet. Retry quick upstream failures;
    // connection timeouts still fail over without multiplying their delay.
    const identityRead=async(method:string,params:readonly unknown[] = [])=>{
      for(let attempt=0;;attempt++){
        try{return await call(url,method,params);}
        catch(error){
          if(attempt===2||!(error instanceof RpcFailure)||!error.transient||error.message==="Arc RPC connection unavailable")throw error;
          await new Promise(resolve=>setTimeout(resolve,(attempt+1)*500));
        }
      }
    };
    const chain = await identityRead("eth_chainId");
    if (chain !== "0x13b2") throw new RpcFailure("Arc RPC chain mismatch", -32098, true);
    const [checkpoint,head] = await Promise.all([
      identityRead("eth_getBlockByNumber", [`0x${config.checkpointNumber.toString(16)}`, false]),
      identityRead("eth_getBlockByNumber", ["latest", false]),
    ]);
    if (!isBlock(checkpoint) || BigInt(checkpoint.number) !== config.checkpointNumber || checkpoint.hash.toLowerCase() !== config.checkpointHash.toLowerCase()) throw new RpcFailure("Arc RPC checkpoint mismatch", -32098, true);
    const age = isBlock(head) ? Math.floor(Date.now() / 1000) - Number(head.timestamp) : NaN;
    if (!isBlock(head) || !Number.isFinite(age) || age < -5 || age > config.maxHeadAgeSeconds || BigInt(head.number) < config.checkpointNumber) throw new RpcFailure("Arc RPC head is stale", -32098, true);
    verifiedUntil.set(url, Date.now() + Math.min(5000, Math.max(0, (config.maxHeadAgeSeconds - age) * 1000)));
    validationEvidence.set(url,{chain,checkpoint});
  }
  async function validate(url: string) {
    if ((unavailableUntil.get(url) ?? 0) > Date.now()) throw new RpcFailure("Arc RPC cooling down", -32098, true);
    if ((verifiedUntil.get(url) ?? 0) > Date.now()) return;
    const pending = validating.get(url);
    if (pending) return pending;
    const check = verify(url).catch(error => {
      verifiedUntil.delete(url);
      validationEvidence.delete(url);
      unavailableUntil.set(url, Date.now() + Math.max(10000,error instanceof RpcFailure?(error.transient?60000:error.cooldownMs):0));
      throw error;
    }).finally(() => validating.delete(url));
    validating.set(url, check);
    return check;
  }
  return custom({ request: async ({ method, params }) => {
    const broadcast = method === "eth_sendRawTransaction";
    if (!broadcast && !reads.has(method)) throw new RpcFailure("Arc RPC method not authorized", -32601, false);
    // Argus currently serves contract calls that the supplied Infura project rejects for quota.
    const backups = broadcast ? config.rpcFallbackUrls : method === "eth_call"
      ? [...config.readOnlyRpcUrls, ...config.rpcFallbackUrls]
      : [...config.rpcFallbackUrls, ...config.readOnlyRpcUrls];
    const endpoints = [...new Set([config.rpcUrl, ...backups])];
    const transientReads: string[] = [];
    for (const url of endpoints) {
      const methodKey = `${url}:${method}`;
      if (!broadcast && (methodUnavailableUntil.get(methodKey) ?? 0) > Date.now()) continue;
      try { await validate(url); } catch { continue; }
      // Do not fail over after a broadcast attempt: its outcome may be unknown.
      if (broadcast) return call(url, method, params as unknown[]);
      // Reuse only the identity checks just performed, within the existing
      // five-second validation window. Prices, balances and latest blocks are fresh.
      const evidence=(verifiedUntil.get(url)??0)>Date.now()?validationEvidence.get(url):undefined;
      if(evidence&&method==="eth_chainId")return evidence.chain;
      if(evidence&&method==="eth_getBlockByNumber"&&Array.isArray(params)&&params[0]===`0x${config.checkpointNumber.toString(16)}`&&params[1]===false)return evidence.checkpoint;
      try { return await call(url, method, params as unknown[]); }
      catch (error) {
        if (!(error instanceof RpcFailure) || !error.retryable) throw error;
        if (error.transient) transientReads.push(url);
        // An upstream miss can be specific to this calldata or block. Do not
        // poison every other token's eth_call while this exact read retries.
        if(!error.transient)methodUnavailableUntil.set(methodKey, Date.now() + error.cooldownMs);
      }
    }
    // A gateway can briefly lose its upstream while serving a fresh block.
    // Prefer working alternatives, then retry that same read twice. Preserve
    // its exact params/block; never retry a broadcast or a quota/revert here.
    if (!broadcast && transientReads.length) {
      for(let attempt=0;attempt<2;attempt++){
      await new Promise(resolve => setTimeout(resolve, (attempt+1)*500));
      for (const url of transientReads) {
        if((methodUnavailableUntil.get(`${url}:${method}`)??0)>Date.now())continue;
        try { await validate(url); } catch { continue; }
        try {
          const result = await call(url, method, params as unknown[]);
          methodUnavailableUntil.delete(`${url}:${method}`);
          return result;
        } catch (error) {
          if (!(error instanceof RpcFailure) || !error.retryable) throw error;
          if(!error.transient)methodUnavailableUntil.set(`${url}:${method}`,Date.now()+error.cooldownMs);
        }
      }
      }
    }
    throw new RpcFailure("No healthy Arc RPC supports this request", -32098, true);
  } }, { retryCount: 0 });
}
