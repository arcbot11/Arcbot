import { custom } from "viem";
import type { ArcConfig } from "./config";
import { paceArcRpc, quickNodeEndpoint, retryAfterMs } from "./rpc-pacing";
import {roleEndpoints,rpcRole} from './rpc-role';
import { traceRead, traceReadOutput, TraceReadError, type TraceRead } from "./trace-call";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isBlock = (value: unknown): value is { number: string; hash: string; timestamp: string } =>
  isRecord(value) && typeof value.number === "string" && typeof value.hash === "string" && typeof value.timestamp === "string";

const reads = new Set(["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getLogs", "eth_getTransactionReceipt", "eth_getTransactionByHash", "debug_traceCall", "debug_traceTransaction"]);
class RpcFailure extends Error {
  readonly code:number;readonly retryable:boolean;readonly data?:unknown;readonly transient:boolean;readonly cooldownMs:number;readonly traceFallback:boolean;
  constructor(message:string,code:number,retryable:boolean,data?:unknown,transient=false,cooldownMs=5000,traceFallback=false){super(message);this.code=code;this.retryable=retryable;this.data=data;this.transient=transient;this.cooldownMs=cooldownMs;this.traceFallback=traceFallback;}
}

const transports=new Map<string,ReturnType<typeof createArcTransport>>();
export function clearArcTransportCache(){transports.clear();}
export function arcTransport(config:ArcConfig,options:{traceFallback?:boolean}={}){
  const traceFallback=options.traceFallback!==false;
  const key=JSON.stringify([config,traceFallback],(_,value)=>typeof value==="bigint"?value.toString():value);
  let transport=transports.get(key);
  if(!transport){if(transports.size>=16)transports.delete(transports.keys().next().value!);transport=createArcTransport(config,traceFallback);transports.set(key,transport);}
  return transport;
}

/** Validated read failover; a broadcast is attempted on exactly one provider. */
function createArcTransport(config: ArcConfig, traceFallback: boolean) {
  const verifiedUntil = new Map<string, number>();
  const unavailableUntil = new Map<string, number>();
  const validating = new Map<string, Promise<void>>();
  const methodUnavailableUntil = new Map<string, number>();
  const traceAllowedUntil = new Map<string, number>();
  const validationEvidence=new Map<string,{chain:unknown;checkpoint:unknown}>();
  const inFlightReads=new Map<string,Promise<unknown>>();
  async function observedCall(url:string,method:string,params:readonly unknown[]){
    const started=Date.now();let category='ok';
    try{return await rawCall(url,method,params);}
    catch(error){category=error instanceof RpcFailure?(error.code===429?'rate_limited':error.retryable?'provider_unavailable':'request_rejected'):'invalid_response';throw error;}
    finally{if(category!=='ok'||Date.now()-started>1500)console.info('arc_rpc',{role:rpcRole(method,traceFallback),provider:url===config.rpcUrl?'primary':config.rpcFallbackUrls.includes(url)?'fallback':'gateway',method,durationMs:Date.now()-started,category});}
  }
  async function call(url:string,method:string,params:readonly unknown[]=[]):Promise<unknown>{
    if(method==="eth_sendRawTransaction")return observedCall(url,method,params);
    const key=JSON.stringify([url,method,params]),existing=inFlightReads.get(key);
    if(existing)return existing;
    const request=observedCall(url,method,params);inFlightReads.set(key,request);
    try{return await request;}finally{if(inFlightReads.get(key)===request)inFlightReads.delete(key);}
  }
  async function rawCall(url: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
    let response: Response;
    const admit=async()=>{try{await paceArcRpc(url);}catch{throw new RpcFailure("Arc RPC capacity service busy",429,true,undefined,true,1000,false);}};
    await admit();
    try {
      response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
      // Retry only reads. Never retry a broadcast with an uncertain outcome.
      if(response.status===429&&quickNodeEndpoint(url)&&method!=="eth_sendRawTransaction"){
        await new Promise(resolve=>setTimeout(resolve,retryAfterMs(response.headers.get("retry-after"))));
        await admit();
        response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(12000)});
      }
    } catch(error) { if(error instanceof RpcFailure)throw error;throw new RpcFailure("Arc RPC connection unavailable", -32098, true, undefined, true); }
    if(response.status===429)throw new RpcFailure("Arc RPC rate limit reached",429,true,undefined,true,retryAfterMs(response.headers.get("retry-after")),false);
    if (!response.ok) throw new RpcFailure(`Arc RPC HTTP ${response.status}`, -32098, [401, 403, 408, 429].includes(response.status) || response.status >= 500, undefined, response.status === 408 || response.status >= 500,[401,403,429].includes(response.status)?60000:5000,[408,429].includes(response.status)||response.status>=500);
    let body: unknown;
    try { body = await response.json(); } catch { throw new RpcFailure("Invalid Arc RPC response", -32098, true); }
    if (!isRecord(body)) throw new RpcFailure("Invalid Arc RPC response", -32098, true);
    if (body.error) {
      if (!isRecord(body.error)) throw new RpcFailure("Invalid Arc RPC error", -32098, true);
      const code = Number(body.error.code), message = String(body.error.message || "RPC error");
      const executionFailure = code === 3 || /execution reverted|out of gas|outoffunds|insufficient (?:funds|balance)|invalid opcode/i.test(message);
      const authorizationFailure = /unauthori[sz]ed|forbidden|invalid (?:api|project) key|access denied|not authorized/i.test(message);
      // A provider may serve a fresh head before its state backend has that
      // exact block. Retry the same pinned request elsewhere, never at latest.
      const missingState=/header not found|block not found|unknown block|missing trie node|state (?:is )?(?:not available|unavailable)|historical state (?:is )?unavailable/i.test(message);
      const retryable = !executionFailure && (missingState || code === -32601 || /quota|rate.?limit|too many requests|temporarily unavailable|upstream|method_not_served/i.test(message) || (isRecord(body.error.data) && body.error.data.reason === "unreachable"));
      // Never include endpoint URLs or provider diagnostics that might expose keys.
      const transient = missingState || /temporarily unavailable|upstream/i.test(message) || (isRecord(body.error.data) && body.error.data.reason === "unreachable");
      throw new RpcFailure(retryable ? "Arc RPC capacity or method unavailable" : "Arc RPC rejected request", code, retryable, retryable ? undefined : body.error.data, transient,code===-32601||/quota|rate.?limit|too many requests|method_not_served/i.test(message)?60000:5000,retryable&&!authorizationFailure);
    }
    if (!Object.prototype.hasOwnProperty.call(body, "result")) throw new RpcFailure("Missing Arc RPC result", -32098, true);
    if(body.result===null&&(method==="eth_getBlockByNumber"||method==="eth_getBlockByHash"))throw new RpcFailure("Arc RPC block unavailable",-32098,true,undefined,true);
    return body.result;
  }
  // Cool down only the method that actually failed. A quota on eth_call must
  // not suppress a working trace_call, or vice versa.
  async function readAttempt(url:string,method:string,params:readonly unknown[]):Promise<unknown>{
    try{return await call(url,method,params);}catch(error){
      if(error instanceof RpcFailure&&error.retryable&&!error.transient){
        const until=Date.now()+error.cooldownMs;
        methodUnavailableUntil.set(`${url}:${method}`,until);
        if(method==="eth_call"){
          if(error.traceFallback)traceAllowedUntil.set(url,until);else traceAllowedUntil.delete(url);
        }
      }
      throw error;
    }
  }
  async function readCall(url:string,method:string,params:readonly unknown[],trace:TraceRead|null):Promise<unknown>{
    if((methodUnavailableUntil.get(`${url}:${method}`)??0)<=Date.now()){
      try{return await readAttempt(url,method,params);}catch(error){
        if(!trace||!(error instanceof RpcFailure)||!error.traceFallback)throw error;
      }
    }else if(!trace||(traceAllowedUntil.get(url)??0)<=Date.now())throw new RpcFailure("Arc RPC method cooling down",-32098,true);
    if(!trace||(methodUnavailableUntil.get(`${url}:trace_call`)??0)>Date.now())throw new RpcFailure("Arc simulation method unavailable",-32098,true);
    try{
      return traceReadOutput(await readAttempt(url,"trace_call",[trace.call,["trace"],trace.block]),trace);
    }catch(error){
      if(error instanceof TraceReadError){
        if(error.retryable)methodUnavailableUntil.set(`${url}:trace_call`,Date.now()+5000);
        throw new RpcFailure(error.message,error.code,error.retryable,error.data);
      }
      throw error;
    }
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
      // A brief gateway identity-read outage used to disable that provider for
      // a full minute, even if it recovered immediately. Reprobe short upstream
      // failures after five seconds; keep connection outages and quotas backed
      // off. Every recovery must still recheck chain, checkpoint and fresh head.
      const cooldown=error instanceof RpcFailure&&error.transient
        ?error.message==="Arc RPC connection unavailable"?60000:5000
        :Math.max(10000,error instanceof RpcFailure?error.cooldownMs:0);
      unavailableUntil.set(url, Date.now() + cooldown);
      throw error;
    }).finally(() => validating.delete(url));
    validating.set(url, check);
    return check;
  }
  return custom({ request: async ({ method, params }) => {
    const broadcast = method === "eth_sendRawTransaction";
    if (!broadcast && !reads.has(method)) throw new RpcFailure("Arc RPC method not authorized", -32601, false);
    // Direct arbitrary trace requests stay unauthorized. Only scoped eth_call
    // fallbacks enter readCall's internal trace path.
    const trace=traceFallback&&method==="eth_call"&&Array.isArray(params)?traceRead(params):null;
    const endpoints = roleEndpoints(config,rpcRole(method,traceFallback),method);
    const transientReads = new Set<string>();
    let capacityLimited=false;
    for (const url of endpoints) {
      const methodKey = `${url}:${method}`;
      if (!broadcast && !trace && (methodUnavailableUntil.get(methodKey) ?? 0) > Date.now()) continue;
      try { await validate(url); } catch(error) { if(error instanceof RpcFailure&&error.code===429)capacityLimited=true;continue; }
      // Do not fail over after a broadcast attempt: its outcome may be unknown.
      if (broadcast) {
        try{return await call(url,method,params as unknown[]);}
        catch(error){
          // Never fail over inside this request. A later durable recovery can
          // resubmit the same saved bytes on another validated write provider.
          if(error instanceof RpcFailure&&error.retryable)unavailableUntil.set(url,Date.now()+30_000);
          throw error;
        }
      }
      // Reuse only the identity checks just performed, within the existing
      // five-second validation window. Prices, balances and latest blocks are fresh.
      const evidence=(verifiedUntil.get(url)??0)>Date.now()?validationEvidence.get(url):undefined;
      if(evidence&&method==="eth_chainId")return evidence.chain;
      if(evidence&&method==="eth_getBlockByNumber"&&Array.isArray(params)&&params[0]===`0x${config.checkpointNumber.toString(16)}`&&params[1]===false)return evidence.checkpoint;
      try { return await readCall(url, method, (params ?? []) as unknown[],trace); }
      catch (error) {
        if (!(error instanceof RpcFailure) || !error.retryable) throw error;
        if(error.code===429)capacityLimited=true;
        // Fail over a connection timeout, but do not multiply twelve-second
        // waits on that same connection inside a single user request.
        if (error.transient&&error.code!==429&&error.message!=="Arc RPC connection unavailable") transientReads.add(url);
        // An upstream miss can be specific to this calldata or block. Do not
        // poison every other token's eth_call while this exact read retries.
      }
    }
    // A gateway can briefly lose its upstream while serving a fresh block.
    // Prefer working alternatives, then retry brief upstream failures. Preserve
    // its exact params/block; never retry a broadcast or a quota/revert here.
    if (!broadcast && transientReads.size) {
      // Contract reads/simulations currently depend on a gateway that can miss
      // several times consecutively. Four bounded retries add at most 3.25s of
      // backoff; all other reads keep the existing two-retry policy.
      const delays=method==="eth_call"?[250,500,1000,1500]:[500,1000];
      for(const delay of delays){
      if(!transientReads.size)break;
      await new Promise(resolve => setTimeout(resolve, delay));
      for (const url of transientReads) {
        if(!trace&&(methodUnavailableUntil.get(`${url}:${method}`)??0)>Date.now())continue;
        try { await validate(url); } catch { continue; }
        try {
          const result = await readCall(url, method, (params ?? []) as unknown[],trace);
          return result;
        } catch (error) {
          if (!(error instanceof RpcFailure) || !error.retryable) throw error;
          if(error.code===429||error.message==="Arc RPC connection unavailable"||!error.transient)transientReads.delete(url);
        }
      }
      }
    }
    if(capacityLimited)throw new RpcFailure("Arc RPC capacity is busy. Retry shortly.",429,true,undefined,true,1000,false);
    throw new RpcFailure("No healthy Arc RPC supports this request", -32098, true);
  } }, { retryCount: 0 });
}
