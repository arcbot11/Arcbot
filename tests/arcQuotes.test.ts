import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, zeroAddress, type Hex } from "viem";
import { arcConfig } from "../lib/arc/config.ts";
import { quoteAbi, quoteRoutes } from "../lib/arc/quotes.ts";
import type { ArcRpc } from "../lib/arc/rpc.ts";
import type { Route, V3Pool, V4Pool } from "../lib/arc/routing.ts";
const a = "0x0000000000000000000000000000000000000010";
const b = "0x0000000000000000000000000000000000000020";
const c = "0x0000000000000000000000000000000000000030";
const hash = `0x${"12".repeat(32)}` as Hex;
const config = arcConfig({ rpcUrl: "https://example.com", checkpointNumber: "1", checkpointHash: hash });
const now = 1_000_000;
const v3: V3Pool = { protocol: "v3", address: c, currency0: a, currency1: b, fee: 3000 };
const v4: V4Pool = { protocol: "v4", currency0: a, currency1: b, fee: 10000, tickSpacing: 200, hooks: zeroAddress };
const route = (pool: V3Pool | V4Pool): Route => ({ tokenIn: a, tokenOut: b, pools: [pool] });
function mockRpc() {
  return { chainId: vi.fn(async () => 5042), block: vi.fn(async (number = 2n) => ({ number, hash, timestamp: 1000n })), code: vi.fn(async () => "0x1234"),
    call: vi.fn(async (tx: { data: Hex }, block: bigint) => {
      expect(block).toBe(2n);
      const { functionName } = decodeFunctionData({ abi: quoteAbi, data: tx.data });
      switch (functionName) {
        case "getPool": return encodeFunctionResult({ abi: quoteAbi, functionName, result: c });
        case "liquidity": case "getLiquidity": return encodeFunctionResult({ abi: quoteAbi, functionName, result: 100n });
        case "getSlot0": return encodeFunctionResult({ abi: quoteAbi, functionName, result: [100n, 0, 0, 10000] });
        case "quoteExactInput": return encodeFunctionResult({ abi: quoteAbi, functionName, result: [1000n, [100n], [0], 50000n] });
        case "quoteExactInputSingle": return encodeFunctionResult({ abi: quoteAbi, functionName, result: [1100n, 60000n] });
      }
    }), broadcast: vi.fn(),
  };
}
describe("Arc quotes", () => {
  it("reuses the caller's verified head while checking pools and the final block hash", async () => {
    const rpc = mockRpc();
    const head = {number:2n,hash,timestamp:1000n};
    const result = await quoteRoutes([route(v3)],100n,100,a,rpc as unknown as ArcRpc,config,now,head);
    expect(result.quotes).toHaveLength(1);
    expect(rpc.chainId).not.toHaveBeenCalled();
    expect(rpc.call).toHaveBeenCalled();
    expect(rpc.block).toHaveBeenCalledExactlyOnceWith(2n);
    await expect(quoteRoutes([route(v3)],100n,100,a,rpc as unknown as ArcRpc,config,now+60000,head)).rejects.toThrow(/stale/);
    rpc.block.mockResolvedValue({ ...head,hash:`0x${"34".repeat(32)}` });
    await expect(quoteRoutes([route(v3)],100n,100,a,rpc as unknown as ArcRpc,config,now,head)).rejects.toThrow(/snapshot/);
  });
  it("ranks V3 and V4 quotes with a shared snapshot and bounded minimum", async () => {
    const rpc = mockRpc();
    const result = await quoteRoutes([route(v3), route(v4)], 100n, 100, a, rpc as unknown as ArcRpc, config, now);
    expect(result.rejected).toEqual([]);
    expect(result.quotes.map(q => q.amountOut)).toEqual([1100n, 1000n]);
    expect(result.quotes[0].amountOutMinimum).toBe(1089n);
    expect(result.quotes[0].expiresAt).toBe(now + 30000);
    expect(rpc.broadcast).not.toHaveBeenCalled();
  });
  it("keeps hook diagnostics distinct from execution support", async () => {
    const result = await quoteRoutes([route({ ...v4, hooks: c })], 100n, 100, a, mockRpc() as unknown as ArcRpc, config, now);
    expect(result.quotes[0].executionBlocker).toMatch(/Hook/);
  });
  it("rejects a factory mismatch while retaining another valid candidate", async () => {
    const result = await quoteRoutes([route({ ...v3, address: a }), route(v4)], 100n, 100, a, mockRpc() as unknown as ArcRpc, config, now);
    expect(result.quotes).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/factory/);
  });
  it("rejects stale RPC before quoting", async () => {
    const rpc = mockRpc();
    await expect(quoteRoutes([route(v3)], 100n, 100, a, rpc as unknown as ArcRpc, config, now + 60000)).rejects.toThrow(/stale/);
    expect(rpc.call).not.toHaveBeenCalled();
  });
  it("fails the entire result on a changed snapshot", async () => {
    const rpc = mockRpc();
    rpc.block.mockResolvedValueOnce({ number: 1n, hash, timestamp: 1000n }).mockResolvedValueOnce({ number: 2n, hash, timestamp: 1000n }).mockResolvedValueOnce({ number: 2n, hash: `0x${"34".repeat(32)}`, timestamp: 1000n });
    await expect(quoteRoutes([route(v3)], 100n, 100, a, rpc as unknown as ArcRpc, config, now)).rejects.toThrow(/snapshot/);
  });
  it("redacts upstream RPC failures", async () => {
    const rpc = mockRpc();
    rpc.call.mockRejectedValue(new Error("private endpoint credentials"));
    const result = await quoteRoutes([route(v3)], 100n, 100, a, rpc as unknown as ArcRpc, config, now);
    expect(result.rejected).toEqual([{ index: 0, reason: "Route validation or quote failed" }]);
  });
});
