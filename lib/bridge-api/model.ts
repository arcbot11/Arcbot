import { z } from "zod";
import { type Address, type Hex } from "viem";
import { type BridgeChain, type Route } from "../bridge/contracts";

export const inputSchema = z.object({
  token: z.string().regex(/^0x[\da-fA-F]{40}$/).transform(s => s.toLowerCase() as Address),
  chain: z.enum(["arc", "base", "5042", "8453"]).optional(),
  finality: z.enum(["latest", "finalized"]).default("latest"),
}).strict();
export type LookupInput = z.infer<typeof inputSchema>;
export const chainId = (chain: LookupInput["chain"]): BridgeChain | undefined =>
  chain === undefined ? undefined : chain === "arc" || chain === "5042" ? 5042 : 8453;
export const chainName = (chain: BridgeChain) => chain === 5042 ? "Arc" : "Base";
export const CACHE_MS = 30_000;
export const RECOVERY_MS = 24 * 60 * 60 * 1000;
export type Token = {
  address: Address; chainId: BridgeChain; chain: string;
  role: "original" | "wrapped"; isBridgedRepresentation: boolean;
  name: string; symbol: string; decimals: number; explorerUrl: string;
};
export type Evidence = { chainId: BridgeChain; chain: string; blockNumber: string; blockHash: Hex; timestamp: string };
export type Candidate = {
  inputChainId: BridgeChain;
  status: "not_a_contract" | "not_registered" | "wrapper_missing" | "verified" | "verification_failed" | "unavailable";
  connectionExists: boolean | null;
  ownerlessVerified: boolean | null;
  source?: Token; destination?: Token | null; original?: Token; wrapped?: Token | null;
  direction?: string; operation?: "lock_and_mint" | "burn_and_unlock";
  tokenId?: Hex;
  operational?: { status: "available" | "paused" | "blocked" | "setup_required"; issues: string[] };
  wrappedSupply?: { chainId: BridgeChain; tokenAddress: Address; raw: string; formatted: string; decimals: number; meaning: string } | null;
  contracts?: { chainId: BridgeChain; chain: string; role: string; address: Address; explorerUrl: string }[];
  evidence?: Evidence[];
  error?: string;
};
export type Report = {
  schemaVersion: "1"; scope: "circle-ownerless-arc-base"; input: LookupInput;
  status: "complete" | "ambiguous" | "unavailable"; candidates: Candidate[];
  observedAt: string; cached: boolean; cacheAgeMs: number;
  verificationMeaning: string;
};
export type Pair = {
  tokenId: string; arcAddress: string; baseAddress: string;
  originalChain: BridgeChain; route: Route; verifiedAt: number; policy: string;
};
export type LookupCache = { report: Report; expiresAt: number };
export interface LookupStore {
  getCache(key: string): Promise<LookupCache | null>;
  getPair(chain: BridgeChain, token: string): Promise<Pair | null>;
  save(key: string, report: Report, pairs: Pair[]): Promise<void>;
}
// Longer than the route's 120-second runtime; never renew across retries.
export const PRE_SETTLEMENT_LEASE_MS = 180_000;
