import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, encodePacked, getAddress, keccak256, parseAbi, parseAbiParameters, zeroAddress, type Address, type Hex } from "viem";

export const ARC_ROUTER = "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1" as const;
// Matched against successful Arc calldata and runtime code on 2026-09-09.
export const ARC_ROUTER_CODE_HASH = "0x7f949fe75d3483670e17a9ab398a3dc71f285026bba755b48fffd1e42aefad71" as const;
export const poolKeyParameters = parseAbiParameters("address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks");
export const v4SingleParameters = parseAbiParameters("((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)");
export const v4MultiParameters=parseAbiParameters("(address currencyIn,(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)[] path,uint256[] minHopPriceX36,uint128 amountIn,uint128 amountOutMinimum)");
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
  if (same(route.tokenIn, route.tokenOut) || route.pools.length < 1 || route.pools.length > 3) throw new Error("Route must have one to three hops between distinct currencies");
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
  // Bounded breadth-first discovery keeps short routes ahead of longer paths.
  let paths:ArcPool[][]=[[]];
  for(let depth=0;depth<3;depth++){
    const next:ArcPool[][]=[];
    for(const path of paths){
      let current=tokenIn;
      for(const p of path)current=same(current,p.currency0)?p.currency1:p.currency0;
      for(const p of pools){
        if(!same(current,p.currency0)&&!same(current,p.currency1))continue;
        const candidate=[...path,p],out=same(current,p.currency0)?p.currency1:p.currency0;
        try{routeCurrencies({tokenIn,tokenOut:out,pools:candidate});}catch{continue;}
        if(same(out,tokenOut))add(candidate);else if(next.length<512)next.push(candidate);
      }
    }
    paths=next;
  }
  return routes;
}

export function v3Path(route: Route): Hex {
  const currencies = routeCurrencies(route);
  if (route.pools.some(p => p.protocol !== "v3")) throw new Error("V3 path requires V3 pools");
  let path: Hex = currencies[0];
  route.pools.forEach((pool, i) => { path = `${path}${encodePacked(["uint24", "address"], [pool.fee, currencies[i + 1]]).slice(2)}`; });
  return path;
}

export function v4Path(route:Route){
  const currencies=routeCurrencies(route);
  return route.pools.map((pool,i)=>{
    if(pool.protocol!=="v4")throw new Error("V4 path requires V4 pools");
    return {intermediateCurrency:currencies[i+1],fee:pool.fee,tickSpacing:pool.tickSpacing,hooks:pool.hooks,hookData:"0x" as Hex};
  });
}

export function minimumOutput(quoted: bigint, slippageBps: number): bigint {
  if (quoted <= 0n || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1000) throw new Error("Invalid output or slippage (maximum 10%)");
  const minimum = quoted * BigInt(10000 - slippageBps) / 10000n;
  if (!minimum) throw new Error("Minimum output rounds to zero");
  return minimum;
}

/** Calldata only. This does not authorize signing; callers must verify runtime, allowances and simulate. */
export const ARC_DEAD_ADDRESS="0x000000000000000000000000000000000000dEaD" as const;
export function encodeArcSwap(route: Route, amountIn: bigint, amountOutMinimum: bigint, deadline: bigint, verifiedHookPoolId?: string | readonly string[], delivery: boolean | Address=false) {
  const recipient=delivery===true?ARC_DEAD_ADDRESS:delivery?getAddress(delivery):undefined;
  if(recipient && BigInt(recipient)<=2n)throw new Error("Use a valid recipient wallet.");
  const currencies = routeCurrencies(route);
  if (amountIn <= 0n || amountOutMinimum <= 0n || deadline <= 0n) throw new Error("Swap limits must be positive");
  const protocol = route.pools[0].protocol;
  if (route.pools.some(p => p.protocol !== protocol)) return encodeMixedSwap(route, amountIn, amountOutMinimum, deadline, verifiedHookPoolId, recipient);
  let commands: Hex; let input: Hex;
  if (protocol === "v3") {
    commands = "0x00";
    // The deployed router requires one minimum-hop-price entry per pool. Zero
    // disables that optional bound; amountOutMinimum still protects total output.
    input = encodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"), [recipient??"0x0000000000000000000000000000000000000001", amountIn, amountOutMinimum, v3Path(route), true, route.pools.map(() => 0n)]);
  } else {
    if (amountIn >= 2n ** 128n || amountOutMinimum >= 2n ** 128n) throw new Error("V4 amount exceeds uint128");
    if (route.pools.some(p => p.protocol === "v4" && !same(p.hooks, zeroAddress) && !(typeof verifiedHookPoolId==="string"?[verifiedHookPoolId]:verifiedHookPoolId??[]).includes(poolId(p)))) throw new Error("Hook execution requires a reviewed adapter");
    const pool = route.pools[0] as V4Pool;
    const multi=route.pools.length>1;
    const swap = multi?encodeAbiParameters(v4MultiParameters,[{currencyIn:route.tokenIn,path:v4Path(route),minHopPriceX36:route.pools.map(()=>0n),amountIn,amountOutMinimum}]):encodeAbiParameters(v4SingleParameters, [{ poolKey: pool, zeroForOne: same(currencies[0], pool.currency0), amountIn, amountOutMinimum, minHopPriceX36: 0n, hookData: "0x" }]);
    // TAKE_ALL delivers to msgSender; SETTLE_ALL bounds the input, including native USDC.
    input = encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [multi?(recipient?"0x070c0e":"0x070c0f"):(recipient?"0x060c0e":"0x060c0f"), [swap,
      encodeAbiParameters(parseAbiParameters("address,uint256"), [route.tokenIn, amountIn]),
      recipient?encodeAbiParameters(parseAbiParameters("address,address,uint256"),[route.tokenOut,recipient,0n]):encodeAbiParameters(parseAbiParameters("address,uint256"), [route.tokenOut, amountOutMinimum]),
    ]]);
    commands = "0x10";
  }
  return { to: ARC_ROUTER, value: same(route.tokenIn, zeroAddress) ? amountIn : 0n,
    data: encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [commands, [input], deadline] }) };
}

const ROUTER_SELF = "0x0000000000000000000000000000000000000002" as const;
const MSG_SENDER = "0x0000000000000000000000000000000000000001" as const;
const CONTRACT_BALANCE = 1n << 255n;
export function mixedRouteSupported(route: Route) {
  const currencies = routeCurrencies(route);
  return route.pools.length >= 2 && route.pools.length <= 3 && route.pools.some(p=>p.protocol!==route.pools[0].protocol)
    && currencies.every(c => !same(c, zeroAddress));
}
function encodeMixedSwap(route: Route, amountIn: bigint, minimum: bigint, deadline: bigint, verified?: string | readonly string[], recipient?: Address) {
  if (!mixedRouteSupported(route)) throw Error("Mixed routes require two or three pools and ERC-20 currencies");
  if (amountIn >= 2n ** 128n || minimum >= 2n ** 128n) throw Error("V4 amount exceeds uint128");
  const currencies = routeCurrencies(route), verifiedIds = typeof verified === "string" ? [verified] : verified ?? [];
  for (const pool of route.pools) if (pool.protocol === "v4" && !same(pool.hooks, zeroAddress) && !verifiedIds.includes(poolId(pool))) throw Error("Hook execution requires a reviewed adapter");
  const inputs: Hex[] = [];
  let commands: Hex = "0x";
  for (let i = 0; i < route.pools.length; i++) {
    const pool = route.pools[i], first = i === 0, last=i===route.pools.length-1, destination = last ? recipient ?? MSG_SENDER : ROUTER_SELF;
    if (pool.protocol === "v3") {
      commands += "00";
      inputs.push(encodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"), [destination, first ? amountIn : CONTRACT_BALANCE, last ? minimum : 1n,
        v3Path({ tokenIn: currencies[i], tokenOut: currencies[i + 1], pools: [pool] }), first, [0n]]));
    } else {
      commands += "10";
      const swap = encodeAbiParameters(v4SingleParameters, [{ poolKey: pool, zeroForOne: same(currencies[i], pool.currency0), amountIn: first ? amountIn : 0n, amountOutMinimum: last ? minimum : 1n, minHopPriceX36: 0n, hookData: "0x" }]);
      const take = encodeAbiParameters(parseAbiParameters("address,address,uint256"), [currencies[i + 1], destination, 0n]);
      // V3 -> V4: settle the router's actual USDC balance first, then swap the
      // resulting open credit. V4 -> V3: take USDC into the router, not the user.
      inputs.push(encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), first
        ? ["0x060c0e", [swap, encodeAbiParameters(parseAbiParameters("address,uint256"), [currencies[i], amountIn]), take]]
        : ["0x0b060e0e", [encodeAbiParameters(parseAbiParameters("address,uint256,bool"), [currencies[i], CONTRACT_BALANCE, false]), swap, take, encodeAbiParameters(parseAbiParameters("address,address,uint256"), [currencies[i], MSG_SENDER, 0n])]]));
    }
  }
  // A price-limit partial fill must not strand intermediate USDC in the router.
  for(const currency of currencies.slice(1,-1)){
    commands = `${commands}04`;
    inputs.push(encodeAbiParameters(parseAbiParameters("address,address,uint256"), [currency, MSG_SENDER, 0n]));
  }
  return { to: ARC_ROUTER, value: 0n, data: encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [commands, inputs, deadline] }) };
}

/** No allow-revert flag: a failed postcondition rolls back every swap command. */
export function guardArcSwap(call: { to: Address; value: bigint; data: Hex }, checks: readonly { owner: Address; token: Address; minimumBalance: bigint }[]) {
  if (!same(call.to, ARC_ROUTER)) throw Error("Invalid swap router");
  const { args } = decodeFunctionData({ abi: routerAbi, data: call.data });
  const inputs = [...args[1]];
  let commands = args[0];
  for (const check of checks) {
    getAddress(check.owner); getAddress(check.token);
    if (same(check.token, zeroAddress) || check.minimumBalance < 0n || check.minimumBalance >= 2n ** 256n) throw Error("Invalid token balance guard");
    commands += "0e";
    inputs.push(encodeAbiParameters(parseAbiParameters("address,address,uint256"), [check.owner, check.token, check.minimumBalance]));
  }
  return { ...call, data: encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [commands, inputs, args[2]] }) };
}
