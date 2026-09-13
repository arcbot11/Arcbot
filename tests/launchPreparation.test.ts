import { expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, encodePacked, getCreate2Address, keccak256, toHex, type Abi, type Address, type Hex } from "viem";
import { prepareLaunch, type LaunchReadRpc } from "../lib/launches/prepare";
import { parseLaunchInput } from "../lib/launches/input";
import { approvalAbi, configAbi, portalAbi, PORTAL6, reviewedImplementations } from "../lib/launches/contracts";
import type { ArcConfig } from "../lib/arc/config";
import type { ArcCall } from "../lib/arc/rpc";

vi.mock("viem", async original => {
  const actual = await original<typeof import("viem")>();
  return { ...actual, keccak256: (value: Hex) => value === "0x6000"
    ? "0xe0c3db1cba754430a88582b593b819e40484e778f9121ece798f74b4dcee5863" : actual.keccak256(value) };
});
const creator = "0x1111111111111111111111111111111111111111" as const;
const predicted = "0x2222222222222222222222222222222222222222" as const;
const splitter = "0x3333333333333333333333333333333333333333" as const;
const cfg = "0x8Bf56C35faEA89D81E8eEe45c2FfB3994148A840";
const abi: Abi = [...portalAbi, ...approvalAbi, ...configAbi];
function fixture() {
  const now = Date.now(), blockHash = toHex(10n, { size: 32 }), initCodeHash = keccak256("0x1234");
  const state = { chain: 5042, code: "0x6000" as Hex, mode: 0, minimum: 0n, allowance: 0n,
    pendingNonce: 1, quote: true, balance: 1000n * 10n ** 18n, deployed: false, pointerChanged: false, approvalResult: true };
  const config: ArcConfig = { rpcUrl: "https://unused.invalid", rpcFallbackUrls: [], readOnlyRpcUrls: [], checkpointNumber: 1n,
    checkpointHash: blockHash, maxHeadAgeSeconds: 30, maxGas: 5_000_000n, maxFeePerGas: 100_000_000_000n };
  const call = vi.fn(async (tx: ArcCall) => {
    const decoded = decodeFunctionData({ abi, data: tx.data }), fn = decoded.functionName!, args = decoded.args ?? [];
    let result: unknown;
    switch (fn) {
      case "LAUNCH_STRUCT_WORDS": result = 11n; break;
      case "quoteApproved": result = state.quote; break;
      case "tokenImpl": case "splitterImpl": case "lockerImpl": result = state.pointerChanged ? creator : reviewedImplementations[fn]; break;
      case "launchConfig": result = cfg; break;
      case "configFor": result = [state.mode, state.minimum]; break;
      case "allowance": result = state.allowance; break;
      case "predictSplitter": result = splitter; break;
      case "hookInitCodeHash": result = initCodeHash; break;
      case "hookCreate2Salt": result = keccak256(encodePacked(["address", "bytes32"], [args[0] as Address, args[1] as Hex])); break;
      case "predictHook": result = [getCreate2Address({ from: PORTAL6, bytecodeHash: initCodeHash,
        salt: keccak256(encodePacked(["address", "bytes32"], [creator, args[2] as Hex])) }), 0x2044n, true]; break;
      case "predictToken": case "launch": result = predicted; break;
      case "setConfig": return "0x" as Hex;
      case "approve": result = state.approvalResult; break;
      default: throw Error(`Unexpected read: ${fn}`);
    }
    return encodeFunctionResult({ abi, functionName: fn, result });
  });
  const rpc: LaunchReadRpc = {
    chainId: async () => state.chain, block: async (number = 200n) => ({ number, hash: blockHash, timestamp: BigInt(Math.floor(now / 1000)) }),
    balance: async () => state.balance, code: async address => address === PORTAL6 ? state.code : state.deployed ? "0x1234" : undefined,
    decimals: async () => 6, tokenBalance: async () => { throw Error("Native USDC must not be counted twice"); },
    call, nonce: async (_address, pending) => pending ? state.pendingNonce : 1,
    fees: async () => ({ maxFeePerGas: 10_000_000_000n, maxPriorityFeePerGas: 1n }),
    estimateGas: async tx => decodeFunctionData({ abi, data: tx.data }).functionName === "launch" ? 3_000_000n : 100_000n,
  };
  const input = parseLaunchInput({ name: "Example", symbol: "EXAMPLE", imageURI: "ipfs://Qm" + "a".repeat(44),
    buyTaxBps: 100, sellTaxBps: 100, creatorBps: 10000, burnBps: 0, dividendBps: 0, liquidityBps: 0 });
  const options = { identity: { owner: "1", address: creator }, input, tokenSalt: toHex(100n, { size: 32 }), rpc, config,
    reservedWei: 0n, activeTransaction: false, now };
  return { state, options, call };
}
it("fully simulates a no-dev-buy launch without signing or approval", async () => {
  const f = fixture(), p = await prepareLaunch(f.options);
  expect(p.status).toBe("simulated"); expect(p.executionEnabled).toBe(false);
  expect(p.steps.map(s => s.kind)).toEqual(["launch"]);
  expect(p.steps[0].call).toMatchObject({ from: creator, to: PORTAL6, value: 0n });
  expect(p.predictedToken.toLowerCase()).toBe(predicted); expect(BigInt(p.gasWei!)).toBeGreaterThan(0n);
});
it("reports approval prerequisites without pretending deployment was simulated", async () => {
  const f = fixture(); f.options.input.devBuyUSDC = "10";
  const p = await prepareLaunch(f.options);
  expect(p.status).toBe("needs_setup"); expect(p.steps.map(s => s.kind)).toEqual(["approval", "launch"]);
  expect(p.requiredWei).toBeNull(); expect(p.gasWei).toBeNull(); expect(p.steps.at(-1)?.gas).toBeNull();
  expect(f.call.mock.calls.some(([c]) => decodeFunctionData({ abi, data: c.data }).functionName === "launch")).toBe(false);
});
it("does not add another approval when existing allowance covers the dev buy", async () => {
  const f = fixture(); f.options.input.devBuyUSDC = "10"; f.state.allowance = 10_000_000n;
  const p = await prepareLaunch(f.options);
  expect(p.status).toBe("simulated"); expect(p.steps.map(s => s.kind)).toEqual(["launch"]);
  expect(BigInt(p.requiredWei!)).toBe(10n * 10n ** 18n + BigInt(p.gasWei!));
});
it.each([true, false])("plans changed creator rewards, dividends=%s", async dividends => {
  const f = fixture();
  if (dividends) { f.options.input.creatorBps = 0; f.options.input.dividendBps = 10000; }
  else { f.state.mode = 1; f.state.minimum = 1000n * 10n ** 18n; }
  const p = await prepareLaunch(f.options);
  expect(p.status).toBe("needs_setup"); expect(p.steps[0].kind).toBe("rewards");
  const decoded = decodeFunctionData({ abi: configAbi, data: p.steps[0].call.data });
  expect(decoded.args?.[0]).toEqual({ mode: dividends ? 1 : 0, minimumShareBalance: dividends ? 100000n * 10n ** 18n : 0n });
});
it.each(["chain", "code", "nonce", "balance", "reserved", "active", "pointer", "quote", "deployed"])("stops for changed %s", async mode => {
  const f = fixture();
  if (mode === "chain") f.state.chain = 8453;
  if (mode === "code") f.state.code = "0x6001";
  if (mode === "nonce") f.state.pendingNonce = 2;
  if (mode === "balance") f.state.balance = 0n;
  if (mode === "reserved") f.options.reservedWei = f.state.balance;
  if (mode === "active") f.options.activeTransaction = true;
  if (mode === "pointer") f.state.pointerChanged = true;
  if (mode === "quote") f.state.quote = false;
  if (mode === "deployed") f.state.deployed = true;
  await expect(prepareLaunch(f.options)).rejects.toThrow();
});
it("rejects a false ERC-20 approval result", async () => {
  const f = fixture(); f.options.input.devBuyUSDC = "10"; f.state.approvalResult = false;
  await expect(prepareLaunch(f.options)).rejects.toThrow("approval simulation failed");
});
