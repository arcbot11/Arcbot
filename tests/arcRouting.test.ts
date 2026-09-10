import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeAbiParameters, decodeFunctionData, parseAbiParameters, zeroAddress, type Address } from "viem";
import { encodeArcSwap, findRoutes, minimumOutput, poolId, routerAbi, v3Path, v4SingleParameters, type V3Pool, type V4Pool } from "../lib/arc/routing.ts";
const a = "0x0000000000000000000000000000000000000010" as Address;
const b = "0x0000000000000000000000000000000000000020" as Address;
const c = "0x0000000000000000000000000000000000000030" as Address;
const p: V3Pool = { protocol: "v3", address: c, currency0: a, currency1: b, fee: 3000 };
const q: V4Pool = { protocol: "v4", currency0: b, currency1: c, fee: 10000, tickSpacing: 200, hooks: zeroAddress };
describe("Arc routing", () => {
  it("finds direct and mixed discovery routes without cycles or duplicates", () => {
    expect(findRoutes(a, c, [p, p, q])).toHaveLength(1);
    expect(findRoutes(a, a, [p, q])).toEqual([]);
    expect(findRoutes(c, a, [p, q])[0].pools).toEqual([q, p]);
  });
  it("encodes V3 fees and currency order in both directions", () => {
    expect(v3Path({ tokenIn: a, tokenOut: b, pools: [p] })).toBe(`${a}000bb8${b.slice(2)}`);
    expect(v3Path({ tokenIn: b, tokenOut: a, pools: [p] })).toBe(`${b}000bb8${a.slice(2)}`);
  });
  it("encodes V3 multihop atomically with final minimum", () => {
    const second: V3Pool = { ...p, address: a, currency0: b, currency1: c, fee: 500 };
    const tx = encodeArcSwap({ tokenIn: a, tokenOut: c, pools: [p, second] }, 100n, 90n, 123n);
    const { args } = decodeFunctionData({ abi: routerAbi, data: tx.data });
    expect(args[0]).toBe("0x00");
    const values = decodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool"), args[1][0]);
    expect(values.slice(1, 3)).toEqual([100n, 90n]);
    expect(values[3]).toBe(`${a}000bb8${b.slice(2)}0001f4${c.slice(2)}`);
    expect(tx.value).toBe(0n);
  });
  it("includes hook identity in pool IDs", () => {
    expect(poolId(q)).not.toBe(poolId({ ...q, hooks: a }));
  });
  it("rejects unreviewed hooks and mixed execution", () => {
    expect(() => encodeArcSwap({ tokenIn: b, tokenOut: c, pools: [{ ...q, hooks: a }] }, 1n, 1n, 1n)).toThrow(/Hook/);
    expect(() => encodeArcSwap({ tokenIn: a, tokenOut: c, pools: [p, q] }, 1n, 1n, 1n)).toThrow(/Mixed/);
  });
  it("bounds slippage and refuses zero output", () => {
    expect(minimumOutput(101n, 100)).toBe(99n);
    expect(() => minimumOutput(1n, 100)).toThrow();
    expect(() => minimumOutput(100n, 1001)).toThrow();
  });
  it("reproduces successful Arc V4 buy and sell calldata byte for byte", () => {
    const evidence = JSON.parse(readFileSync(new URL("../docs/arc/activity-probe-2026-09-09.json", import.meta.url), "utf8"));
    const samples = evidence.checks.filter((x: { name: string }) => x.name === "routerTransaction");
    for (const index of [0, 2]) {
      const tx = samples[index].value;
      const { args } = decodeFunctionData({ abi: routerAbi, data: tx.input });
      const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes,bytes[]"), args[1][0]);
      expect(actions).toBe("0x060c0f");
      const [swap] = decodeAbiParameters(v4SingleParameters, params[0]);
      const key = swap.poolKey;
      const result = encodeArcSwap({ tokenIn: swap.zeroForOne ? key.currency0 : key.currency1,
        tokenOut: swap.zeroForOne ? key.currency1 : key.currency0, pools: [{ protocol: "v4", ...key }] },
        swap.amountIn, swap.amountOutMinimum, args[2]);
      expect(result.data.toLowerCase()).toBe(tx.input.toLowerCase());
      expect(result.value).toBe(BigInt(tx.value));
    }
  });
});
