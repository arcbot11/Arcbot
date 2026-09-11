import { readFile } from "node:fs/promises";
import { getAddress, type Address } from "viem";
import { z } from "zod";
import { arcConfigFromEnv } from "../lib/arc/config.ts";
import { createArcRpc } from "../lib/arc/rpc.ts";
import { findRoutes } from "../lib/arc/routing.ts";
import { quoteRoutes } from "../lib/arc/quotes.ts";
import { discoverArcV3Pools } from "../lib/arc/discovery.ts";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => getAddress(value) as Address);
const common = { currency0: address, currency1: address, fee: z.number().int() };
const request = z.object({ sender: address, tokenIn: address, tokenOut: address,
  amountIn: z.string().regex(/^[1-9][0-9]{0,77}$/).transform(BigInt),
  slippageBps: z.number().int().min(0).max(1000),
  pools: z.array(z.discriminatedUnion("protocol", [
    z.object({ ...common, protocol: z.literal("v3"), address }).strict(),
    z.object({ ...common, protocol: z.literal("v4"), hooks: address, tickSpacing: z.number().int() }).strict(),
  ])).min(1).max(100).optional(),
}).strict();
if(process.argv.includes("--help")){console.log("Usage: npm run arc:quote -- --request request.json");process.exit(0);}
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--request") throw new Error("Usage");
  const input = request.parse(JSON.parse(await readFile(args[1], "utf8")));
  const config = arcConfigFromEnv();
  const discovery = input.pools ? undefined : await discoverArcV3Pools(input.tokenIn, input.tokenOut);
  const routes = findRoutes(input.tokenIn, input.tokenOut, input.pools ?? discovery!.pools);
  const result = await quoteRoutes(routes.slice(0,32), input.amountIn, input.slippageBps, input.sender, createArcRpc(config), config);
  console.log(JSON.stringify({ ...result, discovery, executionReady: false }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  if (!result.quotes.length) process.exitCode = 2;
} catch {
  console.error("Quote failed. Check Arc RPC/checkpoint settings and --request JSON. Amounts use base units.");
  process.exitCode = 1;
}
