import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import type { ArcConfig } from "./config.ts";
import { checkArcRpc, type ArcRpc } from "./rpc.ts";
import { minimumOutput, poolId, routeCurrencies, v3Path, type Route } from "./routing.ts";

export const V3_FACTORY = "0xf0db7b58379503491d857db50ac9ece64c653918" as const;
export const V3_QUOTER = "0x7dfd4f31be6814d2906bde155c3e1b146eac1468" as const;
export const V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as const;
export const V4_STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as const;
export const quoteAbi = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
  "function liquidity() view returns (uint128)",
  "function getLiquidity(bytes32) view returns (uint128)",
  "function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)",
  "function quoteExactInput(bytes,uint256) returns (uint256,uint160[],uint32[],uint256)",
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
export type RouteQuote = { route: Route; amountIn: bigint; amountOut: bigint; amountOutMinimum: bigint; gasEstimate: bigint;
  snapshot: { number: bigint; hash: string }; expiresAt: number; executionBlocker?: string };

/** Read-only quotes, including hooked-pool diagnostics. Hook quotes are never execution approval. */
export async function quoteRoutes(routes: Route[], amountIn: bigint, slippageBps: number, sender: Address, rpc: ArcRpc, config: ArcConfig, now = Date.now()) {
  if (routes.length > 32 || routes.length < 1) throw new Error("Provide 1–32 route candidates");
  if (amountIn <= 0n || amountIn >= 2n ** 256n) throw new Error("Invalid input amount");
  minimumOutput(10000n, slippageBps);
  const head = await checkArcRpc(rpc, config, now);
  const quotes: RouteQuote[] = [];
  const rejected: { index: number; reason: string }[] = [];
  const call = async (to: Address, functionName: typeof quoteAbi[number]["name"], args: readonly unknown[]): Promise<unknown> => {
    const data = encodeFunctionData({ abi: quoteAbi, functionName, args } as Parameters<typeof encodeFunctionData>[0]);
    const result = await rpc.call({ from: sender, to, data, value: 0n }, head.number);
    return decodeFunctionResult({ abi: quoteAbi, functionName, data: result });
  };
  const requireCode = async (address: Address) => {
    const code = await rpc.code(address, head.number);
    if (!code || code === "0x") throw new Error("Contract code missing");
  };
  for (const [index, route] of routes.entries()) {
    try {
      const currencies = routeCurrencies(route);
      if (route.pools.some(p => p.protocol !== route.pools[0].protocol)) throw new Error("Mixed-protocol quotes are unsupported");
      let amountOut: bigint; let gasEstimate: bigint;
      if (route.pools[0].protocol === "v3") {
        await requireCode(V3_QUOTER);
        for (const pool of route.pools) {
          if (pool.protocol !== "v3") throw new Error("Invalid V3 route");
          const registered = await call(V3_FACTORY, "getPool", [pool.currency0, pool.currency1, pool.fee]);
          if (typeof registered !== "string" || registered.toLowerCase() !== pool.address.toLowerCase()) throw new Error("V3 factory pool mismatch");
          await requireCode(pool.address);
          if (await call(pool.address, "liquidity", []) === 0n) throw new Error("No active liquidity");
        }
        const result = await call(V3_QUOTER, "quoteExactInput", [v3Path(route), amountIn]) as readonly [bigint, readonly bigint[], readonly number[], bigint];
        amountOut = result[0]; gasEstimate = result[3];
      } else {
        if (route.pools.length !== 1) throw new Error("V4 multihop quotes are unsupported");
        if (amountIn >= 2n ** 128n) throw new Error("V4 input exceeds uint128");
        const pool = route.pools[0];
        if (pool.protocol !== "v4") throw new Error("Invalid V4 route");
        await requireCode(V4_QUOTER); await requireCode(V4_STATE_VIEW);
        const id = poolId(pool);
        const slot = await call(V4_STATE_VIEW, "getSlot0", [id]) as readonly [bigint, number, number, number];
        if (!slot[0] || await call(V4_STATE_VIEW, "getLiquidity", [id]) === 0n) throw new Error("V4 pool is uninitialized or has no active liquidity");
        const result = await call(V4_QUOTER, "quoteExactInputSingle", [{ poolKey: pool, zeroForOne: currencies[0].toLowerCase() === pool.currency0.toLowerCase(), exactAmount: amountIn, hookData: "0x" }]) as readonly [bigint, bigint];
        [amountOut, gasEstimate] = result;
      }
      quotes.push({ route, amountIn, amountOut, amountOutMinimum: minimumOutput(amountOut, slippageBps), gasEstimate,
        snapshot: { number: head.number, hash: head.hash }, expiresAt: now + 30_000,
        ...(route.pools.some(p => p.protocol === "v4" && p.hooks.toLowerCase() !== zeroAddress) ? { executionBlocker: "Hook requires a reviewed adapter and sender-specific simulation" } : {}),
      });
    } catch (error) {
      // Do not include RPC errors that can carry endpoint credentials or request internals.
      const message = error instanceof Error ? error.message : "";
      const allowed = ["Mixed-protocol quotes are unsupported", "V3 factory pool mismatch", "No active liquidity", "V4 multihop quotes are unsupported", "V4 input exceeds uint128", "V4 pool is uninitialized or has no active liquidity", "Contract code missing"];
      rejected.push({ index, reason: allowed.includes(message) ? message : "Route validation or quote failed" });
    }
  }
  const pinned = await rpc.block(head.number);
  if (pinned.hash.toLowerCase() !== head.hash.toLowerCase()) throw new Error("Quote snapshot changed");
  // Compare output in the same asset only. Gas estimate is diagnostic, not an all-in fee quote.
  if (routes.some(r => r.tokenIn.toLowerCase() !== routes[0].tokenIn.toLowerCase() || r.tokenOut.toLowerCase() !== routes[0].tokenOut.toLowerCase())) throw new Error("Quote candidates must share input and output currencies");
  quotes.sort((a, b) => a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : 0);
  return { quotes, rejected };
}
