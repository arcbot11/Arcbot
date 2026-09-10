import { internalAction } from "./_generated/server";
import { encodeFunctionData, parseAbi } from "viem";

// Admin-only, fixed destinations and methods. Never signs or submits a valid transaction.
export const probe = internalAction({
  args: {},
  handler: async () => {
    const rows = [];
    const from = "0x96145386E08123F311EBe5c3548EBe706f0d85Dc";
    const to = "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC";
    const usdc = "0x3600000000000000000000000000000000000000";
    const abi = parseAbi(["function transfer(address,uint256) returns(bool)", "function approve(address,uint256) returns(bool)"]);
    const native = { from, to, value: "0xde0b6b3a7640000" }; // $1, simulation only.
    const erc20 = { from, to: usdc, data: encodeFunctionData({ abi, functionName: "transfer", args: [to, 1000000n] }) };
    for (const endpoint of ["https://rpc.arc-scan.org", "https://arguspad.io/api/rpc", "https://arcexplorer.org/rpc"]) {
      for (const [method, params] of [
        ["eth_chainId", []],
        ["eth_getBlockByNumber", ["latest", false]],
        ["eth_getBalance", ["0x96145386E08123F311EBe5c3548EBe706f0d85Dc", "latest"]],
        ["eth_getBlockByNumber", ["finalized", false]],
        ["eth_getBlockByNumber", ["0x1199e0e", false]],
        ["eth_getTransactionCount", [from, "pending"]],
        ["eth_gasPrice", []],
        ["eth_maxPriorityFeePerGas", []],
        ["eth_feeHistory", ["0x2", "latest", [50]]],
        ["eth_call", [native, "latest"]],
        ["eth_estimateGas", [native]],
        ["eth_call", [erc20, "latest"]],
        ["eth_estimateGas", [erc20]],
        ["eth_call", [{ from, to: usdc, data: encodeFunctionData({ abi, functionName: "approve", args: [to, 1000000n] }) }, "latest"]],
        ["debug_traceCall", [native, "latest", { tracer: "prestateTracer", tracerConfig: { diffMode: true } }]],
        ["eth_sendRawTransaction", ["0x"]],
      ] as const) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(endpoint, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: controller.signal,
          });
          const body = await response.json();
          rows.push({ endpoint, method, params, http: response.status, ...body.error ? { error: body.error } : {
            result: method === "eth_getBlockByNumber" && body.result ? {
              number: body.result.number, hash: body.result.hash, timestamp: body.result.timestamp,
              ageSeconds: Math.floor(Date.now() / 1000) - Number(body.result.timestamp),
            } : body.result ?? null,
          } });
        } catch (error) {
          rows.push({ endpoint, method, error: String(error) });
        } finally { clearTimeout(timer); }
      }
    }
    return { checkedAt: new Date().toISOString(), location: "Convex", rows };
  },
});
