import { toFunctionSelector, zeroAddress, type Hex } from "viem";
import { V3_QUOTER, V4_QUOTER } from "./quote-contracts";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const bytes = (v: unknown): v is Hex => typeof v === "string" && /^0x(?:[a-f0-9]{2})*$/i.test(v);
const address = (v: unknown): v is Hex => typeof v === "string" && /^0x[a-f0-9]{40}$/i.test(v);
const quantity = (v: unknown): v is Hex => typeof v === "string" && /^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(v);
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

// Only these getter signatures and the fixed quoters may use tracing. In
// particular, approve/transfer/router execute and native sends are excluded.
const getters = new Map<Hex, number>([
  ...["decimals()", "symbol()", "name()", "LAUNCH_STRUCT_WORDS()", "poolId()", "token()", "portal()", "splitter()",
    "poolManager()", "quoteAsset()", "poolFee()", "tickSpacing()", "registry()", "liquidity()", "currentTaxes()"]
    .map(signature => [toFunctionSelector(signature), 0] as const),
  ...["balanceOf(address)", "launches(address)", "isExempt(address)", "getLiquidity(bytes32)", "getSlot0(bytes32)"]
    .map(signature => [toFunctionSelector(signature), 1] as const),
  [toFunctionSelector("allowance(address,address)"), 2],
  [toFunctionSelector("allowance(address,address,address)"), 3],
  [toFunctionSelector("getPool(address,address,uint24)"), 3],
]);
const quoters = new Map<string, Set<Hex>>([
  [V3_QUOTER, new Set([toFunctionSelector("quoteExactInput(bytes,uint256)")])],
  [V4_QUOTER, new Set([
    toFunctionSelector("quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))"),
    toFunctionSelector("quoteExactInput((address,(address,uint24,int24,address,bytes)[],uint128))"),
  ])],
]);
const fields = new Set(["from", "to", "data", "value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas"]);
export type TraceRead = { call: Record<string, unknown> & {to: Hex; data: Hex}; block: Hex };

/** No latest/pending or state overrides: callers must pin the original read. */
export function traceRead(params: readonly unknown[]): TraceRead | null {
  if (params.length !== 2 || !record(params[0]) || !quantity(params[1])) return null;
  const call = params[0];
  if (Object.keys(call).some(key => !fields.has(key)) || !address(call.to) || !bytes(call.data)) return null;
  if (same(call.to, zeroAddress) || (call.from !== undefined && !address(call.from))) return null;
  for (const key of ["value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas"]) {
    if (call[key] !== undefined && !quantity(call[key])) return null;
  }
  if (BigInt(String(call.value ?? "0x0")) !== 0n) return null;
  const selector = call.data.slice(0, 10).toLowerCase() as Hex, words = getters.get(selector);
  const getter = words !== undefined && call.data.length === 10 + words * 64;
  const quoter = quoters.get(call.to.toLowerCase())?.has(selector)
    && call.data.length > 10 && (call.data.length - 10) % 64 === 0;
  return getter || quoter ? {call: {...call, to: call.to, data: call.data}, block: params[1]} : null;
}

export class TraceReadError extends Error {
  readonly code: number;
  readonly retryable: boolean;
  readonly data?: Hex;
  constructor(message: string, code: number, retryable: boolean, data?: Hex) {
    super(message); this.code = code; this.retryable = retryable; this.data = data;
  }
}
const invalid = () => new TraceReadError("Invalid Arc simulation trace", -32098, true);

/** Validate the root, not every nested call: quoters may catch inner reverts. */
export function traceReadOutput(value: unknown, expected: TraceRead): Hex {
  if (!record(value) || !Array.isArray(value.trace) || !bytes(value.output)) throw invalid();
  const roots = value.trace.filter(t => record(t) && Array.isArray(t.traceAddress) && t.traceAddress.length === 0);
  if (roots.length !== 1) throw invalid();
  const root: unknown = roots[0];
  if (!record(root) || root.type !== "call" || !record(root.action)) throw invalid();
  const action = root.action;
  if (action.callType !== "call" || !same(action.from, String(expected.call.from ?? zeroAddress))
    || !same(action.to, expected.call.to) || !same(action.input, expected.call.data)
    || !quantity(action.value) || BigInt(action.value) !== 0n) throw invalid();
  if (root.error !== undefined || value.error !== undefined) {
    const error = root.error ?? value.error;
    if (typeof error !== "string" || !error) throw invalid();
    // Diagnostic text can contain provider details. Preserve bytes, not text.
    const reverted = /^revert(?:ed)?$/i.test(error);
    throw new TraceReadError(reverted ? "Arc simulation reverted" : "Arc simulation failed", reverted ? 3 : -32000, false, value.output);
  }
  if (!record(root.result) || !bytes(root.result.output) || !same(root.result.output, value.output)) throw invalid();
  return value.output;
}
