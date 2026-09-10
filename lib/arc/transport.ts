import { custom } from "viem";
import type { ArcConfig } from "./config";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isBlock = (value: unknown): value is { number: string; hash: string; timestamp: string } =>
  isRecord(value) && typeof value.number === "string" && typeof value.hash === "string" && typeof value.timestamp === "string";

const reads = new Set(["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getLogs", "eth_getTransactionReceipt", "eth_getTransactionByHash", "debug_traceCall", "debug_traceTransaction"]);
class RpcFailure extends Error {
  constructor(message: string, readonly code: number, readonly retryable: boolean, readonly data?: unknown) { super(message); }
}

/** Validated read failover; a broadcast is attempted on exactly one provider. */
export function arcTransport(config: ArcConfig) {
  const verifiedUntil = new Map<string, number>();
  const unavailableUntil = new Map<string, number>();
  const validating = new Map<string, Promise<void>>();
  const methodUnavailableUntil = new Map<string, number>();
  async function call(url: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
    } catch { throw new RpcFailure("Arc RPC connection unavailable", -32098, true); }
    if (!response.ok) throw new RpcFailure(`Arc RPC HTTP ${response.status}`, -32098, [401, 403, 408, 429].includes(response.status) || response.status >= 500);
    let body: unknown;
    try { body = await response.json(); } catch { throw new RpcFailure("Invalid Arc RPC response", -32098, true); }
    if (!isRecord(body)) throw new RpcFailure("Invalid Arc RPC response", -32098, true);
    if (body.error) {
      if (!isRecord(body.error)) throw new RpcFailure("Invalid Arc RPC error", -32098, true);
      const code = Number(body.error.code), message = String(body.error.message || "RPC error");
      const retryable = code === -32601 || /quota|rate.?limit|too many requests|temporarily unavailable|upstream|method_not_served/i.test(message) || (isRecord(body.error.data) && body.error.data.reason === "unreachable");
      // Never include endpoint URLs or provider diagnostics that might expose keys.
      throw new RpcFailure(retryable ? "Arc RPC capacity or method unavailable" : "Arc RPC rejected request", code, retryable, retryable ? undefined : body.error.data);
    }
    if (!Object.prototype.hasOwnProperty.call(body, "result")) throw new RpcFailure("Missing Arc RPC result", -32098, true);
    return body.result;
  }
  async function verify(url: string) {
    const chain = await call(url, "eth_chainId");
    if (chain !== "0x13b2") throw new RpcFailure("Arc RPC chain mismatch", -32098, true);
    const checkpoint = await call(url, "eth_getBlockByNumber", [`0x${config.checkpointNumber.toString(16)}`, false]);
    if (!isBlock(checkpoint) || BigInt(checkpoint.number) !== config.checkpointNumber || checkpoint.hash.toLowerCase() !== config.checkpointHash.toLowerCase()) throw new RpcFailure("Arc RPC checkpoint mismatch", -32098, true);
    const head = await call(url, "eth_getBlockByNumber", ["latest", false]);
    const age = isBlock(head) ? Math.floor(Date.now() / 1000) - Number(head.timestamp) : NaN;
    if (!isBlock(head) || !Number.isFinite(age) || age < -5 || age > config.maxHeadAgeSeconds || BigInt(head.number) < config.checkpointNumber) throw new RpcFailure("Arc RPC head is stale", -32098, true);
    verifiedUntil.set(url, Date.now() + Math.min(5000, Math.max(0, (config.maxHeadAgeSeconds - age) * 1000)));
  }
  async function validate(url: string) {
    if ((unavailableUntil.get(url) ?? 0) > Date.now()) throw new RpcFailure("Arc RPC cooling down", -32098, true);
    if ((verifiedUntil.get(url) ?? 0) > Date.now()) return;
    const pending = validating.get(url);
    if (pending) return pending;
    const check = verify(url).catch(error => {
      verifiedUntil.delete(url);
      unavailableUntil.set(url, Date.now() + 10000);
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
    for (const url of endpoints) {
      const methodKey = `${url}:${method}`;
      if (!broadcast && (methodUnavailableUntil.get(methodKey) ?? 0) > Date.now()) continue;
      try { await validate(url); } catch { continue; }
      // Do not fail over after a broadcast attempt: its outcome may be unknown.
      if (broadcast) return call(url, method, params as unknown[]);
      try { return await call(url, method, params as unknown[]); }
      catch (error) {
        if (!(error instanceof RpcFailure) || !error.retryable) throw error;
        methodUnavailableUntil.set(methodKey, Date.now() + 5000);
      }
    }
    throw new RpcFailure("No healthy Arc RPC supports this request", -32098, false);
  } }, { retryCount: 0 });
}
