import { createPublicClient, parseAbi, zeroAddress, type Address } from "viem";
import { reliableHttp } from "../lib/rpc-http";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const factoryAbi = parseAbi([
  "function approvedPairTokens(address asset) view returns (bool)",
  "function pairTokenEconomics(address asset) view returns (uint256 phantomQuote, uint256 graduationThreshold)",
]);
const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
export type ArgusPairAsset = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  native: boolean;
  verifiedAt: number;
};

/**
 * Argus's allowlist is a mapping, not an enumerable array. Candidate ERC-20
 * addresses must therefore come from configuration (or a future event indexer),
 * and are revalidated against the factory every time this function runs.
 */
export async function discoverLegacyLaunchPairAssets(options: {
  rpcUrl?: string;
  factory?: Address;
  candidates?: Address[];
} = {}): Promise<ArgusPairAsset[]> {
  const rpcUrl = options.rpcUrl || process.env.LEGACY_NETWORK_RPC_URL || "https://legacy-rpc.invalid";
  const factory = options.factory;
  if (!factory) throw new Error("Argus factory is required from the contract registry");
  const configured = options.candidates || [];
  const client = createPublicClient({ transport: reliableHttp(rpcUrl) });
  const verifiedAt = Date.now();
  const results: ArgusPairAsset[] = [{
    address: zeroAddress, symbol: "ETH", name: "Ethereum", decimals: 18, native: true, verifiedAt,
  }];

  for (const address of [...new Set(configured.map((value) => value.toLowerCase()))] as Address[]) {
    if (address === zeroAddress) continue;
    try {
      const [approved, economics, symbol, name, decimals] = await Promise.all([
        client.readContract({ address: factory, abi: factoryAbi, functionName: "approvedPairTokens", args: [address] }),
        client.readContract({ address: factory, abi: factoryAbi, functionName: "pairTokenEconomics", args: [address] }),
        client.readContract({ address, abi: tokenAbi, functionName: "symbol" }),
        client.readContract({ address, abi: tokenAbi, functionName: "name" }),
        client.readContract({ address, abi: tokenAbi, functionName: "decimals" }),
      ]);
      if (approved && economics[0] > 0n && economics[1] > 0n) {
        results.push({ address, symbol, name, decimals, native: false, verifiedAt });
      }
    } catch (error) {
      console.error("legacy_launch_pair_candidate_failed", { address, message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return results;
}

export function parsePairCandidates(value: string): Address[] {
  return value.split(/[\s,;]+/).map((item) => item.trim()).filter((item): item is Address => /^0x[a-fA-F0-9]{40}$/.test(item));
}

export function formatArgusPairReply(assets: ArgusPairAsset[]) {
  const labels = assets.map((asset) => asset.native ? "ETH" : `${asset.symbol} (${asset.name})`);
  return `Required: Argus currently accepts these launch pairs: ${labels.join(", ")}. I verified the ERC-20 options against the factory just now.`;
}

// The retired network catalog must never populate Arc token indexes.
export const refreshRegistry = internalAction({
  args: { identifier: v.optional(v.string()) },
  handler: async (): Promise<ArgusPairAsset[]> => {
    throw new Error("Token creation is unavailable.");
  },
});
