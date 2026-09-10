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
  checkpointNumber: uint,
  checkpointHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  maxHeadAgeSeconds: z.number().int().min(1).max(300).default(30),
  maxGas: uint.default("1000000"),
  maxFeePerGas: uint.default("1000000000000"),
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
  return arcConfig({ rpcUrl: env.ARC_MAINNET_RPC_URL,
    checkpointNumber: env.ARC_CHECKPOINT_NUMBER, checkpointHash: env.ARC_CHECKPOINT_HASH,
    ...(env.ARC_MAX_GAS ? { maxGas: env.ARC_MAX_GAS } : {}),
    ...(env.ARC_MAX_FEE_PER_GAS ? { maxFeePerGas: env.ARC_MAX_FEE_PER_GAS } : {}),
  });
}

export function arcChain(config: ArcConfig) {
  return defineChain({ id: ARC_CHAIN_ID, name: "Arc Mainnet", nativeCurrency: {
    name: "USDC", symbol: "USDC", decimals: 18,
  }, rpcUrls: { default: { http: [config.rpcUrl] } } });
}
