import { ARC_GAS_POLICY } from "../project-config";
import { defineChain, type Hex } from "viem";
import { z } from "zod";

export const ARC_CHAIN_ID = 5042 as const;
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(BigInt);
const rpcUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Arc RPC must be an explicit HTTPS endpoint without embedded user credentials");
const configuration = z.object({
  rpcUrl,
  rpcFallbackUrls: z.array(rpcUrl).default([]),
  readOnlyRpcUrls: z.array(rpcUrl).default([]),
  quoteRpcUrls: z.array(rpcUrl).optional(),
  checkpointNumber: uint,
  checkpointHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  maxHeadAgeSeconds: z.number().int().min(1).max(300).default(30),
  maxGas: uint.default(ARC_GAS_POLICY.maxGas),
  maxFeePerGas: uint.default(ARC_GAS_POLICY.maxFeePerGas),
}).strict();

export function arcConfig(input: unknown) {
  const config = configuration.parse(input);
  if (config.maxGas <= 0n || config.maxFeePerGas <= 0n) throw new Error("Gas limits must be positive");
  return { ...config, checkpointHash: config.checkpointHash as Hex };
}
export type ArcConfig = ReturnType<typeof arcConfig>;

export function arcConfigFromEnv(env: Record<string, string | undefined> = process.env): ArcConfig {
  // Deliberately no inherited RPC, testnet, or shared-project fallback.
  if (!env.ARC_MAINNET_RPC_URL || !env.ARC_CHECKPOINT_NUMBER || !env.ARC_CHECKPOINT_HASH) {
    throw new Error("Configure ARC_MAINNET_RPC_URL, ARC_CHECKPOINT_NUMBER and ARC_CHECKPOINT_HASH before preparing Arc transactions");
  }
  // Advance only the project's known legacy anchor. Both independent providers
  // returned this block/hash on 2026-09-15; the public RPC rejects the old height.
  const legacy = env.ARC_CHECKPOINT_NUMBER === '18456078' &&
    env.ARC_CHECKPOINT_HASH.toLowerCase() === '0xdd5a48032af8571d6a262f39e5cde7e6b91625aaa4330289f03e5a346dd3c358';
  const fallback = env.ARC_RPC_FALLBACK_URLS === undefined ? ['https://rpc.mainnet.arc.io'] :
    env.ARC_RPC_FALLBACK_URLS.split(',').map(url=>url.trim()).filter(Boolean);
  return arcConfig({ rpcUrl: env.ARC_MAINNET_RPC_URL,
    rpcFallbackUrls: fallback,
    readOnlyRpcUrls: [],
    quoteRpcUrls: [env.ARC_MAINNET_RPC_URL, ...fallback],
    checkpointNumber: legacy ? '21065497' : env.ARC_CHECKPOINT_NUMBER,
    checkpointHash: legacy ? '0xdba68d53cfd9677309247a79359fe7d01599447d69f84f69a958bc179a6cdf07' : env.ARC_CHECKPOINT_HASH,
    ...ARC_GAS_POLICY,
  });
}

export function arcChain(config: ArcConfig) {
  return defineChain({ id: ARC_CHAIN_ID, name: "Arc Mainnet", nativeCurrency: {
    name: "USDC", symbol: "USDC", decimals: 18,
  }, rpcUrls: { default: { http: [config.rpcUrl] } } });
}
