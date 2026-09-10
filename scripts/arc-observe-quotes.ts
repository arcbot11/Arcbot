// Bounded, read-only diagnostic against ArgusPad's public frontend RPC. No signer or broadcast.
import { writeFile } from "node:fs/promises";
import { createPublicClient, http, encodeFunctionData, decodeFunctionResult, zeroAddress, type Address } from "viem";
import { quoteAbi, V3_QUOTER, V4_QUOTER } from "../lib/arc/quotes.ts";
import { v3Path, poolId, type ArcPool } from "../lib/arc/routing.ts";
import { ARC_USDC } from "../lib/arc/config.ts";
const rpc = createPublicClient({ transport: http("https://arguspad.io/api/rpc", { batch: false, retryCount: 0, timeout: 12000 }) });
const block = await rpc.getBlock();
if (await rpc.getChainId() !== 5042) throw new Error("Unexpected chain");
const pools: ArcPool[] = [
  { protocol: "v3", address: "0x6a3bacaa6493734c1ac221ebf42cf530a96c1e02", currency0: ARC_USDC, currency1: "0xece5ca8bf9220718e5727754026757512212cb3c", fee: 10000 },
  { protocol: "v4", currency0: zeroAddress, currency1: "0x0aaa41b455a4edcc75333e62d2bbe9d17379ed84", fee: 2500, tickSpacing: 25, hooks: zeroAddress },
  { protocol: "v4", currency0: ARC_USDC, currency1: "0x62249dd3f1f359607408d4a3682f2f3bcea09f2e", fee: 10000, tickSpacing: 200, hooks: "0xfee72808cae93a795049966eddc101d700fe6044" },
];
const results = [];
for (const pool of pools) {
  for (const direction of ["buy", "sell"] as const) {
    const tokenIn = direction === "buy" ? pool.currency0 : pool.currency1;
    const tokenOut = direction === "buy" ? pool.currency1 : pool.currency0;
    const amountIn = direction === "buy" && tokenIn === ARC_USDC ? 1_000_000n : 10n ** 18n;
    const functionName = pool.protocol === "v3" ? "quoteExactInput" : "quoteExactInputSingle";
    const data = pool.protocol === "v3"
      ? encodeFunctionData({ abi: quoteAbi, functionName: "quoteExactInput", args: [v3Path({ tokenIn, tokenOut, pools: [pool] }), amountIn] })
      : encodeFunctionData({ abi: quoteAbi, functionName: "quoteExactInputSingle", args: [{ poolKey: pool, zeroForOne: direction === "buy", exactAmount: amountIn, hookData: "0x" }] });
    try {
      const result = await rpc.call({ account: "0xb4fc9f15dd417731c9e380fbfbeafaccf16ad05d" as Address, to: pool.protocol === "v3" ? V3_QUOTER : V4_QUOTER, data, blockNumber: block.number });
      const decoded = decodeFunctionResult({ abi: quoteAbi, functionName, data: result.data! });
      results.push({ pool, poolId: poolId(pool), direction, amountIn, result: decoded });
    } catch { results.push({ pool, poolId: poolId(pool), direction, amountIn, error: "Quote call failed" }); }
  }
}
const report = { observedAt: new Date().toISOString(), source: "https://arguspad.io/api/rpc", chainId: 5042, block: { number: block.number, hash: block.hash, timestamp: block.timestamp }, results };
await writeFile("docs/arc/observed-quotes-2026-09-09.json", JSON.stringify(report, (_, v) => typeof v === "bigint" ? v.toString() : v, 2) + "\n");
console.log(JSON.stringify(report, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
