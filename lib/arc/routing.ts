import { encodeAbiParameters, encodeFunctionData, encodePacked, getAddress, keccak256, parseAbi, parseAbiParameters, zeroAddress, type Address, type Hex } from "viem";

export const ARC_ROUTER = "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1" as const;
// Matched against successful Arc calldata and runtime code on 2026-09-09.
export const ARC_ROUTER_CODE_HASH = "0x7f949fe75d3483670e17a9ab398a3dc71f285026bba755b48fffd1e42aefad71" as const;
export const poolKeyParameters = parseAbiParameters("address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks");
export const v4SingleParameters = parseAbiParameters("((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)");
export const routerAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
export type V3Pool = { protocol: "v3"; address: Address; currency0: Address; currency1: Address; fee: number };
export type V4Pool = { protocol: "v4"; currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
export type ArcPool = V3Pool | V4Pool;
export type Route = { tokenIn: Address; tokenOut: Address; pools: ArcPool[] };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function poolId(pool: ArcPool): string {
  if (pool.protocol === "v3") return getAddress(pool.address).toLowerCase();
  return keccak256(encodeAbiParameters(poolKeyParameters, [pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks]));
}

export function validatePool(pool: ArcPool) {
  getAddress(pool.currency0); getAddress(pool.currency1);
  if (BigInt(pool.currency0) >= BigInt(pool.currency1)) throw new Error("Pool currencies must be sorted and distinct");
  if (!Number.isInteger(pool.fee) || pool.fee < 0 || pool.fee > 1_000_000) throw new Error("Unsupported pool fee");
  if (pool.protocol === "v3") {
    if (same(pool.currency0, zeroAddress) || same(pool.address, zeroAddress)) throw new Error("V3 requires ERC-20 currencies and a pool address");
    getAddress(pool.address);
  } else {
    getAddress(pool.hooks);
    if (!Number.isInteger(pool.tickSpacing) || pool.tickSpacing < 1 || pool.tickSpacing > 32767) throw new Error("Invalid tick spacing");
  }
}

export function routeCurrencies(route: Route): Address[] {
  getAddress(route.tokenIn); getAddress(route.tokenOut);
  if (same(route.tokenIn, route.tokenOut) || route.pools.length < 1 || route.pools.length > 2) throw new Error("Route must have one or two hops between distinct currencies");
  const currencies: Address[] = [route.tokenIn];
  const seen = new Set<string>();
  for (const pool of route.pools) {
    validatePool(pool);
    const id = pool.protocol + poolId(pool);
    if (seen.has(id)) throw new Error("Repeated pool");
    seen.add(id);
    const input = currencies.at(-1)!;
    const output = same(input, pool.currency0) ? pool.currency1 : same(input, pool.currency1) ? pool.currency0 : undefined;
    if (!output || currencies.some(c => same(c, output))) throw new Error("Disconnected or cyclic route");
    currencies.push(output);
  }
  if (!same(currencies.at(-1)!, route.tokenOut)) throw new Error("Wrong route output");
  return currencies;
}

/** Discovery candidates only. Every candidate still needs on-chain validation and a quote. */
export function findRoutes(tokenIn: Address, tokenOut: Address, pools: ArcPool[]): Route[] {
  if (pools.length > 100) throw new Error("Too many pool candidates");
  pools.forEach(validatePool);
  const routes: Route[] = [];
  const ids = new Set<string>();
  const add = (path: ArcPool[]) => {
    const route = { tokenIn, tokenOut, pools: path };
    try { routeCurrencies(route); } catch { return; }
    const id = path.map(p => p.protocol + poolId(p)).join(":");
    if (!ids.has(id)) { ids.add(id); routes.push(route); }
  };
  for (const a of pools) { add([a]); for (const b of pools) add([a, b]); }
  return routes;
}

export function v3Path(route: Route): Hex {
  const currencies = routeCurrencies(route);
  if (route.pools.some(p => p.protocol !== "v3")) throw new Error("V3 path requires V3 pools");
  let path: Hex = currencies[0];
  route.pools.forEach((pool, i) => { path = `${path}${encodePacked(["uint24", "address"], [pool.fee, currencies[i + 1]]).slice(2)}`; });
  return path;
}

export function minimumOutput(quoted: bigint, slippageBps: number): bigint {
  if (quoted <= 0n || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1000) throw new Error("Invalid output or slippage (maximum 10%)");
  const minimum = quoted * BigInt(10000 - slippageBps) / 10000n;
  if (!minimum) throw new Error("Minimum output rounds to zero");
  return minimum;
}

/** Calldata only. This does not authorize signing; callers must verify runtime, allowances and simulate. */
export function encodeArcSwap(route: Route, amountIn: bigint, amountOutMinimum: bigint, deadline: bigint, verifiedHookPoolId?: string) {
  const currencies = routeCurrencies(route);
  if (amountIn <= 0n || amountOutMinimum <= 0n || deadline <= 0n) throw new Error("Swap limits must be positive");
  const protocol = route.pools[0].protocol;
  if (route.pools.some(p => p.protocol !== protocol)) throw new Error("Mixed V3/V4 execution is unsupported");
  let commands: Hex; let input: Hex;
  if (protocol === "v3") {
    commands = "0x00";
    input = encodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool"), ["0x0000000000000000000000000000000000000001", amountIn, amountOutMinimum, v3Path(route), true]);
  } else {
    if (amountIn >= 2n ** 128n || amountOutMinimum >= 2n ** 128n) throw new Error("V4 amount exceeds uint128");
    if (route.pools.some(p => p.protocol === "v4" && !same(p.hooks, zeroAddress) && poolId(p)!==verifiedHookPoolId)) throw new Error("Hook execution requires a reviewed adapter");
    if (route.pools.length !== 1) throw new Error("V4 multihop execution awaits an observed codec fixture");
    const pool = route.pools[0] as V4Pool;
    const swap = encodeAbiParameters(v4SingleParameters, [{ poolKey: pool, zeroForOne: same(currencies[0], pool.currency0), amountIn, amountOutMinimum, minHopPriceX36: 0n, hookData: "0x" }]);
    // TAKE_ALL delivers to msgSender; SETTLE_ALL bounds the input, including native USDC.
    input = encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), ["0x060c0f", [swap,
      encodeAbiParameters(parseAbiParameters("address,uint256"), [route.tokenIn, amountIn]),
      encodeAbiParameters(parseAbiParameters("address,uint256"), [route.tokenOut, amountOutMinimum]),
    ]]);
    commands = "0x10";
  }
  return { to: ARC_ROUTER, value: same(route.tokenIn, zeroAddress) ? amountIn : 0n,
    data: encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [commands, [input], deadline] }) };
}
