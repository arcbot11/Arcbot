import { expect, it, vi } from "vitest";
import { decodeAbiParameters, decodeFunctionData, encodeFunctionResult, parseAbiParameters, zeroAddress, type Hex } from "viem";
import { encodeArcSwap, guardArcSwap, poolId, routerAbi, v4SingleParameters, type Route, type V3Pool, type V4Pool } from "../lib/arc/routing";
import { quoteRoutes, quoteAbi } from "../lib/arc/quotes";
import { arcConfig } from "../lib/arc/config";
import type { ArcRpc } from "../lib/arc/rpc";
const a = "0x1111111111111111111111111111111111111111", b = "0x2222222222222222222222222222222222222222", usd = "0x3600000000000000000000000000000000000000";
const self = "0x0000000000000000000000000000000000000002";
const v3: V3Pool = { protocol: "v3", address: "0x4444444444444444444444444444444444444444", currency0: a, currency1: usd, fee: 3000 };
const v4: V4Pool = { protocol: "v4", currency0: b, currency1: usd, fee: 10000, tickSpacing: 200, hooks: "0x5555555555555555555555555555555555555555" };
const forward: Route = { tokenIn: a, tokenOut: b, pools: [v3, v4] };
const reverse: Route = { tokenIn: b, tokenOut: a, pools: [v4, v3] };

it("passes the actual first-hop balance to V4 without a second user debit", () => {
  const tx = encodeArcSwap(forward, 100n, 90n, 1000n, [poolId(v4)]);
  const { args } = decodeFunctionData({ abi: routerAbi, data: tx.data });
  expect(args[0]).toBe("0x001004");
  const first = decodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"), args[1][0]);
  expect(first[0]).toBe(self); expect(first[1]).toBe(100n); expect(first[4]).toBe(true);
  const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes,bytes[]"), args[1][1]);
  expect(actions).toBe("0x0b060e0e");
  expect(decodeAbiParameters(parseAbiParameters("address,uint256,bool"), params[0])).toEqual([usd, 1n << 255n, false]);
  expect(decodeAbiParameters(v4SingleParameters, params[1])[0]).toMatchObject({ amountIn: 0n, amountOutMinimum: 90n });
  expect(tx.value).toBe(0n);
});
it("takes V4 output into the router and spends it through V3", () => {
  const { args } = decodeFunctionData({ abi: routerAbi, data: encodeArcSwap(reverse, 100n, 90n, 1000n, [poolId(v4)]).data });
  expect(args[0]).toBe("0x100004");
  const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes,bytes[]"), args[1][0]);
  expect(actions).toBe("0x060c0e");
  expect(decodeAbiParameters(parseAbiParameters("address,address,uint256"), params[2])).toEqual([usd, self, 0n]);
  const second = decodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"), args[1][1]);
  expect(second[1]).toBe(1n << 255n); expect(second[2]).toBe(90n); expect(second[4]).toBe(false);
});
it("refuses unverified hooks and unsupported bridge assets", () => {
  expect(() => encodeArcSwap(forward, 100n, 90n, 1000n)).toThrow("Hook");
  const other = "0x3333333333333333333333333333333333333333";
  expect(() => encodeArcSwap({ ...forward, pools: [{ ...v3, currency1: other }, { ...v4, currency1: other }] }, 100n, 90n, 1000n)).toThrow("ERC-20 USDC");
  expect(() => encodeArcSwap({ tokenIn: zeroAddress, tokenOut: a, pools: [{ ...v4, currency0: zeroAddress, currency1: usd }, v3] }, 100n, 90n, 1000n)).toThrow("ERC-20");
});
it("appends mandatory sender and recipient balance guards without allow-revert flags", () => {
  const tx = guardArcSwap(encodeArcSwap(forward, 100n, 90n, 1000n, [poolId(v4)]), [
    { owner: a, token: a, minimumBalance: 899n }, { owner: a, token: b, minimumBalance: 140n },
  ]);
  const { args } = decodeFunctionData({ abi: routerAbi, data: tx.data });
  expect(args[0]).toBe("0x0010040e0e");
  expect(decodeAbiParameters(parseAbiParameters("address,address,uint256"), args[1][3])).toEqual([a, a, 899n]);
  expect(decodeAbiParameters(parseAbiParameters("address,address,uint256"), args[1][4])).toEqual([a, b, 140n]);
  expect(() => guardArcSwap(tx, [{ owner: a, token: zeroAddress, minimumBalance: 0n }])).toThrow("guard");
});
it.each([forward, reverse])("quotes mixed legs against one block and passes the first output into the second", async route => {
  const hash = `0x${"11".repeat(32)}` as Hex;
  const config = arcConfig({ rpcUrl: "https://example.com", checkpointNumber: "1", checkpointHash: hash });
  const amounts: bigint[] = [], blocks: bigint[] = [];
  const call = vi.fn(async ({ data }: {data: Hex}, block: bigint) => {
    blocks.push(block);
    const d = decodeFunctionData({ abi: quoteAbi, data });
    if (d.functionName === "getPool") return encodeFunctionResult({ abi: quoteAbi, functionName: d.functionName, result: v3.address });
    if (d.functionName === "getSlot0") return encodeFunctionResult({ abi: quoteAbi, functionName: d.functionName, result: [1n, 0, 0, 10000] });
    if (d.functionName === "liquidity" || d.functionName === "getLiquidity") return encodeFunctionResult({ abi: quoteAbi, functionName: d.functionName, result: 100n });
    const amount = d.functionName === "quoteExactInput" ? d.args[1] : d.args[0].exactAmount;
    amounts.push(amount);
    return d.functionName === "quoteExactInput"
      ? encodeFunctionResult({ abi: quoteAbi, functionName: d.functionName, result: [amount * 2n, [], [], 50000n] })
      : encodeFunctionResult({ abi: quoteAbi, functionName: d.functionName, result: [amount * 2n, 70000n] });
  });
  const rpc = { chainId: async () => 5042, block: async (number = 2n) => ({ number, hash, timestamp: 1000n }), code: async () => "0x6000", call } as unknown as ArcRpc;
  const result = await quoteRoutes([route], 100n, 100, a, rpc, config, 1000000);
  expect(result.quotes[0]).toMatchObject({ amountOut: 400n, amountOutMinimum: 396n, gasEstimate: 120000n });
  expect(amounts).toEqual([100n, 200n]); expect(blocks.every(b => b === 2n)).toBe(true);
});
