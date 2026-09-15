import { launchQuote, type LaunchQuote } from "./quote";
import { verifyLaunchHookStore } from "./hook-review";
import type { LaunchImageEvidence } from "./image-preflight";
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, encodePacked, getAddress, getCreate2Address,
  keccak256, parseAbiParameters, parseUnits, toHex, type Abi, type Address, type Hex } from "viem";
import { type ArcConfig } from "../arc/config";
import { checkArcRpc, type ArcRpc, type ArcCall } from "../arc/rpc";
import { LaunchError, LAUNCH_PREVIEW_MS, LAUNCH_MAX_GAS, LAUNCH_TOTAL_GAS_WEI } from "./policy";
import { parseLaunchInput, launchFingerprint, type LaunchIdentity, type LaunchInput } from "./input";
import { approvalAbi, configAbi, LAUNCH_DEFAULTS, portalAbi, PORTAL6, PORTAL6_CODE_HASH, reviewedImplementations } from "./contracts";

// Deliberately lacks a broadcast or signing capability.
export type LaunchReadRpc = Omit<ArcRpc, "broadcast" | "receipt">;
export type LaunchStep = { kind: "rewards" | "approval" | "launch"; call: ArcCall; estimatedGas?: string; gas: string | null; gasWei: string | null };
export type LaunchPreview = {
  quote?: LaunchQuote; image?: LaunchImageEvidence;
  version: 1; executionEnabled: false; fingerprint: Hex; creator: Address; portal: typeof PORTAL6;
  tokenSalt: Hex; hookSalt: Hex; predictedToken: Address; predictedHook: Address; predictedSplitter: Address;
  hookInitCodeHash: Hex; rewardConfig: Address; block: string; blockHash: Hex; nonce: number;
  createdAt: number; expiresAt: number; status: "simulated" | "needs_setup";
  steps: LaunchStep[]; devBuyWei: string; gasWei: string | null; requiredWei: string | null;
  availableWei: string; maxFeePerGas: string; maxPriorityFeePerGas: string;
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hash = /^0x[0-9a-fA-F]{64}$/;
export function encodeLaunch(input: LaunchInput, tokenSalt: Hex, hookSalt: Hex, quote?: LaunchQuote): Hex {
  const p = parseLaunchInput(input);
  if (p.pairToken !== "USDC" && (!quote || quote.symbol !== p.pairToken)) throw new LaunchError("PAIRED_PREPARATION", "Prepare the paired asset amount first.");
  return encodeFunctionData({ abi: portalAbi, functionName: "launch", args: [{
    name: p.name, symbol: p.symbol, ...LAUNCH_DEFAULTS, buyTaxBps: p.buyTaxBps, sellTaxBps: p.sellTaxBps,
    creatorBps: p.creatorBps, burnBps: p.burnBps, dividendBps: p.dividendBps, liquidityBps: p.liquidityBps,
    devBuyQuote: quote ? BigInt(quote.devBuy) : parseUnits(p.devBuyUSDC, 6),
    ...(quote ? { quoteAsset: quote.address, startFdvUsdc6: BigInt(quote.start), bondFdvUsdc6: BigInt(quote.bond) } : {}),
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
  reservedWei: bigint; activeTransaction: boolean; now?: number; image?: LaunchImageEvidence; frozenQuote?: LaunchQuote;
  verifiedHook?: Pick<LaunchPreview, "creator" | "tokenSalt" | "hookSalt" | "hookInitCodeHash" | "predictedHook">;
}): Promise<LaunchPreview> {
  const { identity, rpc, config, tokenSalt } = options, input = parseLaunchInput(options.input);
  if (!hash.test(tokenSalt) || options.reservedWei < 0n) throw new LaunchError("INVALID_DRAFT", "Invalid launch draft.");
  if (options.activeTransaction) throw new LaunchError("WALLET_BUSY", "A wallet transaction is pending.");

  let head = await checkArcRpc(rpc, config, options.now);
  let quote = options.frozenQuote ?? await launchQuote(input.pairToken, parseUnits(input.devBuyUSDC,6), rpc, head.number);
  if (quote.symbol !== input.pairToken) throw new LaunchError("QUOTE_ASSET", "Launch pair changed.");
  const read = async <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> => {
    const data = encodeFunctionData({ abi, functionName, args });
    const raw = await rpc.call({ from: identity.address, to: address, value: 0n, data }, head.number);
    return decodeFunctionResult({ abi, functionName, data: raw }) as T;
  };
  const code = await rpc.code(PORTAL6, head.number);
  if (!code || !same(keccak256(code), PORTAL6_CODE_HASH)) throw new LaunchError("PORTAL_CHANGED", "Launch contract needs review.");
  const reviewedHookStore = await verifyLaunchHookStore(rpc,head.number);
  const [words, quoteApproved, balance, nonce, pendingNonce, fees, impls] = await Promise.all([
    read<bigint>(PORTAL6, portalAbi, "LAUNCH_STRUCT_WORDS"), read<boolean>(PORTAL6, portalAbi, "quoteApproved", [quote.address]),
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
  let available = balance - options.reservedWei, devBuy = BigInt(quote.devBuy), devBuyWei = input.pairToken === "USDC" ? devBuy * 10n ** 12n : 0n;
  if (available <= devBuyWei) throw new LaunchError("BALANCE", "Not enough USDC for the dev buy and gas.");
  if (input.pairToken !== "USDC" && await rpc.tokenBalance(quote.address, identity.address, head.number) < devBuy)
    throw new LaunchError("BALANCE", `Not enough ${input.pairToken} for the creator buy. Fund this wallet with the paired asset first.`);
  const rewardConfig = await read<Address>(impls[0], configAbi, "launchConfig");
  if (!same(rewardConfig, "0x8Bf56C35faEA89D81E8eEe45c2FfB3994148A840")) throw new LaunchError("PORTAL_CHANGED", "Reward configuration needs review.");
  const [initialReward, initialAllowance, predictedSplitter] = await Promise.all([
    read<readonly [number, bigint]>(rewardConfig, configAbi, "configFor", [identity.address]),
    read<bigint>(quote.address, approvalAbi, "allowance", [identity.address, PORTAL6]),
    read<Address>(PORTAL6, portalAbi, "predictSplitter", [identity.address, tokenSalt]),
  ]);
  let currentReward=initialReward,allowance=initialAllowance;
  if (currentReward[0] !== 0 && currentReward[0] !== 1) throw new LaunchError("REWARD_MODE", "Creator reward mode needs review.");
  const hookInitCodeHash = await read<Hex>(PORTAL6, portalAbi, "hookInitCodeHash", [predictedSplitter, input.buyTaxBps, input.sellTaxBps, quote.address]);
  const saltSample = await read<Hex>(PORTAL6, portalAbi, "hookCreate2Salt", [identity.address, tokenSalt]);
  const saved = options.verifiedHook;
  // Reuse only the salt; live Portal prediction and code checks below remain mandatory.
  const mined = saved && same(saved.creator, identity.address) && same(saved.tokenSalt, tokenSalt) && same(saved.hookInitCodeHash, hookInitCodeHash)
    ? { salt: saved.hookSalt, address: saved.predictedHook }
    : await mineHook(identity.address, hookInitCodeHash, tokenSalt, saltSample);
  const [predictedHook, mask, valid] = await read<readonly [Address, bigint, boolean]>(PORTAL6, portalAbi, "predictHook", [identity.address, tokenSalt, mined.salt, input.buyTaxBps, input.sellTaxBps, quote.address]);
  if (!valid || mask !== 0x2044n || !same(predictedHook, mined.address)) throw new LaunchError("PREDICTION", "Hook prediction could not be verified.");
  const predictedToken = await read<Address>(PORTAL6, portalAbi, "predictToken", [identity.address, tokenSalt, predictedHook, quote.address]);
  for (const address of [predictedToken, predictedHook, predictedSplitter]) {
    const deployed = await rpc.code(address, head.number);
    if (deployed && deployed !== "0x") throw new LaunchError("ALREADY_DEPLOYED", "This draft already has deployed contracts. Reconcile its launch first.");
  }
  // Mining and remote discovery can be slow. Refresh prices, balances and setup
  // at a new block before producing the calls that the user actually reviews.
  if(options.now===undefined){
    head=await checkArcRpc(rpc,config);
    if(!same(await verifyLaunchHookStore(rpc,head.number),reviewedHookStore))throw new LaunchError("HOOK_CHANGED","Launch hook changed during preparation.");
    for(const [name,expected] of Object.entries(reviewedImplementations))if(!same(await read<Address>(PORTAL6,portalAbi,name),expected))
      throw new LaunchError("POINTER_CHANGED","Launch implementation changed during preparation.");
    quote=options.frozenQuote??await launchQuote(input.pairToken,parseUnits(input.devBuyUSDC,6),rpc,head.number);
    devBuy=BigInt(quote.devBuy);devBuyWei=input.pairToken==="USDC"?devBuy*10n**12n:0n;
    available=(await rpc.balance(identity.address,head.number))-options.reservedWei;
    [currentReward,allowance]=await Promise.all([read<readonly [number,bigint]>(rewardConfig,configAbi,"configFor",[identity.address]),read<bigint>(quote.address,approvalAbi,"allowance",[identity.address,PORTAL6])]);
    if(input.pairToken!=="USDC"&&await rpc.tokenBalance(quote.address,identity.address,head.number)<devBuy)throw new LaunchError("BALANCE", "Not enough paired tokens for the creator buy.");
    if(await rpc.nonce(identity.address,true)!==nonce)throw new LaunchError("WALLET_BUSY","Wallet nonce changed. Prepare again.");
    if(!await read<boolean>(PORTAL6,portalAbi,"quoteApproved",[quote.address]))throw new LaunchError("QUOTE_ASSET","Paired asset is no longer approved.");
  }
  const target = rewardTarget(input), steps: LaunchStep[] = [];
  const add = (kind: LaunchStep["kind"], to: Address, data: Hex) => steps.push({ kind, call: { from: identity.address, to, data, value: 0n }, gas: null, gasWei: null });
  if (currentReward[0] !== target.mode || currentReward[1] !== target.minimumShareBalance)
    add("rewards", rewardConfig, encodeFunctionData({ abi: configAbi, functionName: "setConfig", args: [target] }));
  if (allowance < devBuy) add("approval", quote.address, encodeFunctionData({ abi: approvalAbi, functionName: "approve", args: [PORTAL6, devBuy] }));
  add("launch", PORTAL6, encodeLaunch(input, tokenSalt, mined.salt, quote));
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
    if (estimate <= 0n || gas > (step.kind === "launch" ? LAUNCH_MAX_GAS : config.maxGas)) throw new LaunchError("GAS_LIMIT", "Launch gas estimate exceeds the configured limit.");
    const cost = gas * fees.maxFeePerGas;
    step.estimatedGas = estimate.toString(); step.gas = gas.toString(); step.gasWei = cost.toString(); gasWei += cost;
  }
  if (gasWei > LAUNCH_TOTAL_GAS_WEI) throw new LaunchError("GAS_LIMIT", "Launch gas estimate exceeds 0.5 USDC.");
  if (available < devBuyWei + gasWei) throw new LaunchError("BALANCE", "Not enough USDC for the dev buy and gas.");
  if (!same((await rpc.block(head.number)).hash, head.hash)) throw new LaunchError("BLOCK_CHANGED", "Arc block changed. Prepare again.");
  if(options.now===undefined && Date.now()-Number(head.timestamp)*1000>config.maxHeadAgeSeconds*1000)throw new LaunchError("STALE_SIMULATION","Network checks took too long. Prepare again for a fresh simulation.");
  return { version: 1, executionEnabled: false, fingerprint: launchFingerprint(identity, input), creator: getAddress(identity.address), portal: PORTAL6,
    tokenSalt, hookSalt: mined.salt, predictedToken, predictedHook, predictedSplitter, hookInitCodeHash, rewardConfig,
    block: head.number.toString(), blockHash: head.hash, nonce, createdAt: options.now ?? Date.now(), expiresAt: (options.now ?? Date.now()) + LAUNCH_PREVIEW_MS, quote, ...(options.image ? {image: options.image} : {}),
    status: setup ? "needs_setup" : "simulated", steps, devBuyWei: devBuyWei.toString(), availableWei: available.toString(),
    gasWei: setup ? null : gasWei.toString(), requiredWei: setup ? null : (devBuyWei + gasWei).toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(), maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString() };
}
