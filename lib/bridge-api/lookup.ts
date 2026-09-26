import { createHash } from "node:crypto";
import { formatUnits, type Address } from "viem";
import { BridgeReads } from "../bridge/read";
import { pins } from "../bridge/policy";
import { explorer, otherChain, SERVICE, TRANSMITTER, OWNERLESS, type BridgeChain, type Route } from "../bridge/contracts";
import { chainId, chainName, type Candidate, type LookupInput, type LookupStore, type Pair, type Report, type Token } from "./model";

export function policyKey() {
  return createHash("sha256").update(JSON.stringify({ version: 1, pins, blocked: process.env.BRIDGE_BLOCKED_ORIGINALS || "[]" })).digest("hex");
}
export function reverseRoute(route: Route): Route {
  if (!route.counterpart) throw Error("Missing counterpart");
  return { ...route, source: route.destination, destination: route.source, token: route.counterpart,
    counterpart: route.token, manager: route.destinationManager, destinationManager: route.manager };
}
function token(route: Route, chain: BridgeChain, address: Address): Token {
  return { address, chainId: chain, chain: chainName(chain), role: chain === route.origin ? "original" : "wrapped",
    isBridgedRepresentation: chain !== route.origin, name: route.name, symbol: route.symbol, decimals: route.decimals,
    explorerUrl: explorer(chain, "address", address) };
}
const identityFailure = /ownerless state|Unrecognized Circle|identity changed|binding mismatch|unverified bridge identity|Original token is not on|Inconsistent Circle|Unsupported token metadata|Circle (code|implementation|destination service mapping) changed|Circle route is paused, changed|Unsupported or paused Circle manager/;

export async function inspect(chain: BridgeChain, address: Address, finalized: boolean, hint?: Route, reads = new BridgeReads(finalized, true)) {
  const route = await reads.route(chain, address, hint);
  if (!route) { await reads.canonical(); return { candidate: { inputChainId: chain, status: "not_a_contract", connectionExists: false, ownerlessVerified: null } as Candidate }; }
  if (await reads.code(route.origin, route.original) === "0x") throw Error("Original token binding mismatch.");
  const original = token(route, route.origin, route.original);
  const wrappedChain = otherChain(route.origin);
  const wrappedAddress = route.origin === chain ? route.counterpart : route.token;
  const wrapped = wrappedAddress ? token(route, wrappedChain, wrappedAddress) : null;
  const source = route.origin === chain ? original : wrapped!;
  const destination = route.origin === chain ? wrapped : original;
  if (destination) {
    const [name, symbol] = await Promise.all([reads.read<string>(route.destination, destination.address, "name"), reads.read<string>(route.destination, destination.address, "symbol")]);
    if (typeof name !== "string" || typeof symbol !== "string") throw Error("Unsupported token metadata.");
    const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").slice(0,80);
    destination.name = clean(name); destination.symbol = clean(symbol);
  }
  const issues = [...reads.operationalIssues];
  if (!route.compatible) issues.push("original_blocked_by_policy");
  const supply = wrapped ? await reads.read<bigint>(wrappedChain, wrapped.address, "totalSupply") : null;
  const evidence = await Promise.all(([5042, 8453] as const).map(async c => {
    const b = await reads.head(c);
    return { chainId: c, chain: chainName(c), blockNumber: b.number!.toString(), blockHash: b.hash!, timestamp: new Date(Number(b.timestamp) * 1000).toISOString() };
  }));
  await reads.canonical();
  const contracts: NonNullable<Candidate["contracts"]> = [];
  for (const c of [5042, 8453] as const) {
    const add = (role: string, a: Address) => contracts.push({ chainId: c, chain: chainName(c), role, address: a, explorerUrl: explorer(c, "address", a) });
    add("cross_chain_token_service", SERVICE); add("message_transmitter", TRANSMITTER); add("ownerless_sentinel", OWNERLESS);
    const manager = c === chain ? route.manager : route.destinationManager;
    if (manager) add(c === route.origin ? "original_lock_unlock_manager" : "wrapped_mint_burn_manager", manager);
  }
  const candidate: Candidate = {
    inputChainId: chain, status: route.state === "ready" ? "verified" : route.state === "deploy" ? "wrapper_missing" : "not_registered",
    connectionExists: route.state === "ready", ownerlessVerified: route.state === "register" ? null : true,
    source, destination, original, wrapped, tokenId: route.tokenId,
    direction: `${chainName(chain)} → ${chainName(otherChain(chain))}`,
    operation: chain === route.origin ? "lock_and_mint" : "burn_and_unlock",
    operational: { status: !route.compatible ? "blocked" : route.state !== "ready" ? "setup_required" : issues.length ? "paused" : "available", issues },
    wrappedSupply: wrapped && supply !== null ? { chainId: wrappedChain, tokenAddress: wrapped.address, raw: supply.toString(), formatted: formatUnits(supply, wrapped.decimals), decimals: wrapped.decimals,
      meaning: `Outstanding wrapped supply on ${chainName(wrappedChain)}; excludes unminted inbound transfers and tokens already burned for return.` } : null,
    contracts, evidence,
  };
  return { candidate, route };
}

export async function lookupReport(input: LookupInput, store: LookupStore, inspectRoute = inspect): Promise<Report> {
  const policy = policyKey();
  const selected = chainId(input.chain);
  const key = `${policy}:${selected || "auto"}:${input.token}:${input.finality}`;
  const cached = await store.getCache(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.report, input, cached: true, cacheAgeMs: Math.max(0, Date.now() - Date.parse(cached.report.observedAt)) };
  const pairs: Pair[] = [];
  const candidates = await Promise.all((selected ? [selected] : [5042, 8453] as BridgeChain[]).map(async chain => {
    try {
      const known = await store.getPair(chain, input.token);
      const hint = known?.policy === policy ? (known.route.source === chain ? known.route : reverseRoute(known.route)) : undefined;
      const { candidate, route } = await inspectRoute(chain, input.token, input.finality === "finalized", hint);
      if (route?.state === "ready" && route.counterpart) pairs.push({ tokenId: route.tokenId, originalChain: route.origin,
        arcAddress: (chain === 5042 ? route.token : route.counterpart).toLowerCase(), baseAddress: (chain === 8453 ? route.token : route.counterpart).toLowerCase(),
        route, policy, verifiedAt: Date.now() });
      return candidate;
    } catch (error) {
      const verifiedFailure = error instanceof Error && error.constructor === Error && identityFailure.test(error.message);
      return { inputChainId: chain, status: verifiedFailure ? "verification_failed" : "unavailable", connectionExists: null, ownerlessVerified: null,
        error: verifiedFailure ? "Contract identity, metadata or ownerless checks failed. No compatible connection is asserted." : "Unable to determine: chain reads or snapshot verification failed. Retry later." } as Candidate;
    }
  }));
  const report: Report = { schemaVersion: "1", scope: "circle-ownerless-arc-base", input,
    status: candidates.some(c => c.status === "unavailable") ? "unavailable" : candidates.filter(c => c.source).length > 1 ? "ambiguous" : "complete",
    candidates, observedAt: new Date().toISOString(), cached: false, cacheAgeMs: 0,
    verificationMeaning: "Verifies the Circle ownerless connection at the reported blocks, not original-token transfer safety, trading liquidity, or guaranteed redemption. Operational status is not a wallet-specific transfer simulation." };
  // Never turn a failed read into a negative cache entry. Only verified pairs enter the token table.
  if (report.status !== "unavailable") await store.save(key, report, pairs);
  return report;
}
