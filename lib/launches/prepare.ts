import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, encodePacked, getAddress, getCreate2Address,
  keccak256, parseAbiParameters, parseUnits, toHex, type Abi, type Address, type Hex } from "viem";
import { ARC_USDC, type ArcConfig } from "../arc/config";
import { checkArcRpc, type ArcRpc, type ArcCall } from "../arc/rpc";
import { LaunchError, LAUNCH_PREVIEW_MS } from "./policy";
import { parseLaunchInput, launchFingerprint, type LaunchIdentity, type LaunchInput } from "./input";
import { approvalAbi, configAbi, LAUNCH_DEFAULTS, portalAbi, PORTAL6, PORTAL6_CODE_HASH, reviewedImplementations } from "./contracts";

// Deliberately lacks a broadcast or signing capability.
export type LaunchReadRpc = Omit<ArcRpc, "broadcast" | "receipt">;
export type LaunchStep = { kind: "rewards" | "approval" | "launch"; call: ArcCall; gas: string | null; gasWei: string | null };
export type LaunchPreview = {
  version: 1; executionEnabled: false; fingerprint: Hex; creator: Address; portal: typeof PORTAL6;
  tokenSalt: Hex; hookSalt: Hex; predictedToken: Address; predictedHook: Address; predictedSplitter: Address;
  hookInitCodeHash: Hex; rewardConfig: Address; block: string; blockHash: Hex; nonce: number;
  createdAt: number; expiresAt: number; status: "simulated" | "needs_setup";
  steps: LaunchStep[]; devBuyWei: string; gasWei: string | null; requiredWei: string | null;
  availableWei: string; maxFeePerGas: string; maxPriorityFeePerGas: string;
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hash = /^0x[0-9a-fA-F]{64}$/;
export function encodeLaunch(input: LaunchInput, tokenSalt: Hex, hookSalt: Hex): Hex {
  const p = parseLaunchInput(input);
  return encodeFunctionData({ abi: portalAbi, functionName: "launch", args: [{
    name: p.name, symbol: p.symbol, ...LAUNCH_DEFAULTS, buyTaxBps: p.buyTaxBps, sellTaxBps: p.sellTaxBps,
    creatorBps: p.creatorBps, burnBps: p.burnBps, dividendBps: p.dividendBps, liquidityBps: p.liquidityBps,
    devBuyQuote: parseUnits(p.devBuyUSDC, 6),
  }, { imageURI: p.imageURI, description: p.description, website: p.website, twitter: p.twitter, telegram: p.telegram }, tokenSalt, hookSalt] });
}
export function rewardTarget(input: LaunchInput) {
  return { mode: input.dividendBps ? 1 : 0, minimumShareBalance: input.dividendBps ? parseUnits(input.dividendMinimumTokens, 18) : 0n };
}

/** Bounded local mining; confirm the salt derivation against the Portal first. */
export async function mineHook(creator: Address, initCodeHash: Hex, sampleSalt: Hex, sampleDerived: Hex, yieldWork = () => new Promise<void>(resolve => setTimeout(resolve, 0))) {
  const abiSalt = (salt: Hex) => keccak256(encodeAbiParameters(parseAbiParameters("address, bytes32"), [creator, salt]));
  const packedSalt = (salt: Hex) => keccak256(encodePacked(["address", "bytes32"], [creator, salt]));
  const derive = same(abiSalt(sampleSalt), sampleDerived) ? abiSalt : same(packedSalt(sampleSalt), sampleDerived) ? packedSalt : null;
  if (!derive) throw new LaunchError("PORTAL_CHANGED", "Portal salt derivation needs review.");
  const start = BigInt(sampleSalt);
  for (let i = 0; i < 262_144; i++) {
    const salt = toHex((start + BigInt(i)) % (1n << 256n), { size: 32 });
    const address = getCreate2Address({ from: PORTAL6, salt: derive(salt), bytecodeHash: initCodeHash });
    if ((BigInt(address) & 0x3fffn) === 0x2044n) return { salt, address };
    if (i && i % 1024 === 0) await yieldWork();
  }
  throw new LaunchError("MINING_LIMIT", "Hook preparation reached its work limit.");
}

/** Read-only preparation. Missing prerequisites are reported, never submitted. */
export async function prepareLaunch(options: {
  identity: LaunchIdentity; input: LaunchInput; tokenSalt: Hex; rpc: LaunchReadRpc; config: ArcConfig;
  reservedWei: bigint; activeTransaction: boolean; now?: number;
}): Promise<LaunchPreview> {
  const { identity, rpc, config, tokenSalt } = options, input = parseLaunchInput(options.input), now = options.now ?? Date.now();
  if (!hash.test(tokenSalt) || options.reservedWei < 0n) throw new LaunchError("INVALID_DRAFT", "Invalid launch draft.");
  if (options.activeTransaction) throw new LaunchError("WALLET_BUSY", "A wallet transaction is pending.");
  const head = await checkArcRpc(rpc, config, now);
  const read = async <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> => {
    const data = encodeFunctionData({ abi, functionName, args });
    const raw = await rpc.call({ from: identity.address, to: address, value: 0n, data }, head.number);
    return decodeFunctionResult({ abi, functionName, data: raw }) as T;
  };
  const code = await rpc.code(PORTAL6, head.number);
  if (!code || !same(keccak256(code), PORTAL6_CODE_HASH)) throw new LaunchError("PORTAL_CHANGED", "Launch contract needs review.");
  const [words, quoteApproved, balance, nonce, pendingNonce, fees, impls] = await Promise.all([
    read<bigint>(PORTAL6, portalAbi, "LAUNCH_STRUCT_WORDS"), read<boolean>(PORTAL6, portalAbi, "quoteApproved", [ARC_USDC]),
    rpc.balance(identity.address, head.number), rpc.nonce(identity.address, false), rpc.nonce(identity.address, true), rpc.fees(),
    Promise.all(Object.entries(reviewedImplementations).map(async ([name, expected]) => {
      const address = await read<Address>(PORTAL6, portalAbi, name);
      if (!same(address, expected)) throw new LaunchError("POINTER_CHANGED", "Launch implementation changed. Review is required.");
      return address;
    })),
  ]);
  if (words !== 11n || !quoteApproved) throw new LaunchError("PORTAL_CHANGED", "Launch contract or quote asset changed.");
  if (nonce !== pendingNonce) throw new LaunchError("WALLET_BUSY", "A wallet transaction is pending.");
  if (fees.maxFeePerGas <= 0n || fees.maxFeePerGas > config.maxFeePerGas || fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > fees.maxFeePerGas)
    throw new LaunchError("GAS_LIMIT", "Launch gas estimate exceeds the configured limit.");
  const available = balance - options.reservedWei, devBuy = parseUnits(input.devBuyUSDC, 6), devBuyWei = devBuy * 10n ** 12n;
  if (available <= devBuyWei) throw new LaunchError("BALANCE", "Not enough USDC for the dev buy and gas.");
  const rewardConfig = await read<Address>(impls[0], configAbi, "launchConfig");
  if (!same(rewardConfig, "0x8Bf56C35faEA89D81E8eEe45c2FfB3994148A840")) throw new LaunchError("PORTAL_CHANGED", "Reward configuration needs review.");
  const [currentReward, allowance, predictedSplitter] = await Promise.all([
    read<readonly [number, bigint]>(rewardConfig, configAbi, "configFor", [identity.address]),
    read<bigint>(ARC_USDC, approvalAbi, "allowance", [identity.address, PORTAL6]),
    read<Address>(PORTAL6, portalAbi, "predictSplitter", [identity.address, tokenSalt]),
  ]);
  if (currentReward[0] !== 0 && currentReward[0] !== 1) throw new LaunchError("REWARD_MODE", "Creator reward mode needs review.");
  const hookInitCodeHash = await read<Hex>(PORTAL6, portalAbi, "hookInitCodeHash", [predictedSplitter, input.buyTaxBps, input.sellTaxBps, ARC_USDC]);
  const saltSample = await read<Hex>(PORTAL6, portalAbi, "hookCreate2Salt", [identity.address, tokenSalt]);
  const mined = await mineHook(identity.address, hookInitCodeHash, tokenSalt, saltSample);
  const [predictedHook, mask, valid] = await read<readonly [Address, bigint, boolean]>(PORTAL6, portalAbi, "predictHook", [identity.address, tokenSalt, mined.salt, input.buyTaxBps, input.sellTaxBps, ARC_USDC]);
  if (!valid || mask !== 0x2044n || !same(predictedHook, mined.address)) throw new LaunchError("PREDICTION", "Hook prediction could not be verified.");
  const predictedToken = await read<Address>(PORTAL6, portalAbi, "predictToken", [identity.address, tokenSalt, predictedHook, ARC_USDC]);
  for (const address of [predictedToken, predictedHook, predictedSplitter]) {
    const deployed = await rpc.code(address, head.number);
    if (deployed && deployed !== "0x") throw new LaunchError("ALREADY_DEPLOYED", "This draft already has deployed contracts. Reconcile its launch first.");
  }
  const target = rewardTarget(input), steps: LaunchStep[] = [];
  const add = (kind: LaunchStep["kind"], to: Address, data: Hex) => steps.push({ kind, call: { from: identity.address, to, data, value: 0n }, gas: null, gasWei: null });
  if (currentReward[0] !== target.mode || currentReward[1] !== target.minimumShareBalance)
    add("rewards", rewardConfig, encodeFunctionData({ abi: configAbi, functionName: "setConfig", args: [target] }));
  if (allowance < devBuy) add("approval", ARC_USDC, encodeFunctionData({ abi: approvalAbi, functionName: "approve", args: [PORTAL6, devBuy] }));
  add("launch", PORTAL6, encodeLaunch(input, tokenSalt, mined.salt));
  const setup = steps.length > 1;
  let gasWei = 0n;
  for (const step of steps) {
    if (step.kind === "launch" && setup) continue; // Never claim a simulation passed with unmet prerequisites.
    const raw = await rpc.call(step.call, head.number);
    if (step.kind === "approval" && !decodeFunctionResult({ abi: approvalAbi, functionName: "approve", data: raw }))
      throw new LaunchError("APPROVAL", "USDC approval simulation failed.");
    if (step.kind === "launch" && !same(decodeFunctionResult({ abi: portalAbi, functionName: "launch", data: raw }), predictedToken))
      throw new LaunchError("PREDICTION", "Launch simulation returned a different token.");
    const estimate = await rpc.estimateGas(step.call, head.number), gas = (estimate * 120n + 99n) / 100n;
    if (estimate <= 0n || gas > 5_000_000n) throw new LaunchError("GAS_LIMIT", "Launch gas estimate exceeds the configured limit.");
    const cost = gas * fees.maxFeePerGas;
    step.gas = gas.toString(); step.gasWei = cost.toString(); gasWei += cost;
  }
  if (gasWei > 500_000_000_000_000_000n) throw new LaunchError("GAS_LIMIT", "Launch gas estimate exceeds 0.5 USDC.");
  if (available < devBuyWei + gasWei) throw new LaunchError("BALANCE", "Not enough USDC for the dev buy and gas.");
  if (!same((await rpc.block(head.number)).hash, head.hash)) throw new LaunchError("BLOCK_CHANGED", "Arc block changed. Prepare again.");
  return { version: 1, executionEnabled: false, fingerprint: launchFingerprint(identity, input), creator: getAddress(identity.address), portal: PORTAL6,
    tokenSalt, hookSalt: mined.salt, predictedToken, predictedHook, predictedSplitter, hookInitCodeHash, rewardConfig,
    block: head.number.toString(), blockHash: head.hash, nonce, createdAt: now, expiresAt: now + LAUNCH_PREVIEW_MS,
    status: setup ? "needs_setup" : "simulated", steps, devBuyWei: devBuyWei.toString(), availableWei: available.toString(),
    gasWei: setup ? null : gasWei.toString(), requiredWei: setup ? null : (devBuyWei + gasWei).toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(), maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString() };
}
