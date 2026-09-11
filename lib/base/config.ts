import { BASE_GAS_POLICY } from "../project-config";
import { type Hex } from "viem";
import { base } from "viem/chains";
import { z } from "zod";

export const BASE_CHAIN_ID = 8453 as const;
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(BigInt);
const rpcUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Base RPC must be an explicit HTTPS endpoint without embedded user credentials");
const configuration = z.object({
  rpcUrl,
  rpcFallbackUrls: z.array(rpcUrl).max(4).default(["https://base.gateway.tenderly.co"]),
  checkpointNumber: uint,
  checkpointHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  maxHeadAgeSeconds: z.number().int().min(1).max(300).default(30),
  maxGas: uint.default(BASE_GAS_POLICY.maxGas),
  maxFeePerGas: uint.default(BASE_GAS_POLICY.maxFeePerGas),
  maxTotalFeeWei: uint.default(BASE_GAS_POLICY.maxTotalFeeWei),
}).strict();

export function baseConfig(input: unknown) {
  const config = configuration.parse(input);
  if (config.maxGas <= 0n || config.maxFeePerGas <= 0n || config.maxTotalFeeWei <= 0n) throw new Error("Gas limits must be positive");
  return { ...config, checkpointHash: config.checkpointHash as Hex };
}
export type BaseConfig = ReturnType<typeof baseConfig>;

export function baseConfigFromEnv(env: Record<string, string | undefined> = process.env): BaseConfig {
  // Deliberately no inherited RPC, testnet, or shared-project fallback.
  if (!env.BASE_MAINNET_RPC_URL || !env.BASE_CHECKPOINT_NUMBER || !env.BASE_CHECKPOINT_HASH) {
    throw new Error("Configure BASE_MAINNET_RPC_URL, BASE_CHECKPOINT_NUMBER and BASE_CHECKPOINT_HASH before preparing Base transactions");
  }
  return baseConfig({ rpcUrl: env.BASE_MAINNET_RPC_URL,
    ...(env.BASE_RPC_FALLBACK_URLS!==undefined?{rpcFallbackUrls:env.BASE_RPC_FALLBACK_URLS.split(",").map(v=>v.trim()).filter(Boolean)}:{}),
    checkpointNumber: env.BASE_CHECKPOINT_NUMBER, checkpointHash: env.BASE_CHECKPOINT_HASH,
    ...BASE_GAS_POLICY,
  });
}

export function baseChain(config: BaseConfig) {
  return { ...base, rpcUrls: { default: { http: [config.rpcUrl] } } };
}
