import "server-only";
import type { CreatorSelfBurnDisplay } from "./creator-fee-display";
import { ConvexHttpClient } from "convex/browser";
import { unstable_cache } from "next/cache";
import { formatUnits, isAddress } from "viem";
import { arcWalletBalance } from "./arc/wallet-balance";
import { arcTokenBalances } from "./arc/wallet-tokens";
import { arcAddressUrl, ARC_EXPLORER_URL } from "./public-links";
import { api } from "@/convex/_generated/api";
import type { PublicHolding, KnownWalletToken } from "./wallet-holdings";
export type { PublicHolding } from "./wallet-holdings";

export type PublicLaunch = {
  name: string; symbol: string; imageUri: string; description?: string;
  website?: string; twitter?: string; telegram?: string; tokenAddress?: string;
  transactionHash: string; devBuySucceeded?: boolean; creatorAddress?: string; createdAt: number;
  pairToken?: string; pairSymbol?: string; poolAddress?: string; launcherUsername?: string; marketCapUsd?: number; marketCapUpdatedAt?: number; lastBuyAt?: number; storedMarketCapUsd?: number; volume24hUsd?: number; volume24hUpdatedAt?: number; graduated?: boolean; graduationUpdatedAt?: number;
  launchPostUrl?: string;
  creatorFeeRecipient?: string; feeRecipientUsername?: string; holderFeeSharing?: boolean; feesReassignedAt?: number;
  automatedFeeBuybackEnabled?: boolean;
  creatorSelfBurn?: CreatorSelfBurnDisplay;
};

export class SiteDataUnavailableError extends Error {}

export async function listLaunches(limit = 24): Promise<PublicLaunch[]> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new SiteDataUnavailableError("Public site data is not configured");
  try {
    const client = new ConvexHttpClient(url);
    const launches = await client.query(api.site.listLaunches, { limit });
    return launches.map((launch) => launch.storedMarketCapUsd === undefined ? launch : { ...launch, marketCapUsd: launch.storedMarketCapUsd });
  } catch (error) {
    console.error("public_launch_list_failed", error instanceof Error ? error.message : "unknown");
    throw new SiteDataUnavailableError("Launch data is temporarily unavailable");
  }
}

export async function highestMarketCapLaunches(): Promise<PublicLaunch[]> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new SiteDataUnavailableError("Public site data is not configured");
  const result = await new ConvexHttpClient(url).query(api.site.listLaunchesPage, {
    paginationOpts: { cursor: null, numItems: 20 }, sort: "mcap",
  });
  return result.page;
}

export type PlatformStats = {
  launches: number;
  wallets: number;
  lifetimeVolumeUsd: number;
  lifetimeVolumeCoverage: number;
  feesClaimed: Array<{ symbol: string; amount: number }>;
  feesClaimedUsd: number;
  feeValuationVersion?: number;
  feeClaimsUnpriced?: number;
  feeClaimTransactions: number;
  marketUpdatedAt: number;
};

const cachedPlatformStats = unstable_cache(async (): Promise<PlatformStats> => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new SiteDataUnavailableError("Public site data is not configured");
  const client = new ConvexHttpClient(url);
  const stats = await client.query(api.site.platformStats, {});
  return {
    ...stats,
    lifetimeVolumeUsd: finiteStat(stats.lifetimeVolumeUsd),
    lifetimeVolumeCoverage: finiteStat(stats.lifetimeVolumeCoverage),
    feesClaimedUsd: finiteStat(stats.feesClaimedUsd),
  };
}, ["public-platform-stats-v6-historical-fees"], { revalidate: 5 * 60 });

function finiteStat(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    return await cachedPlatformStats();
  } catch (error) {
    console.error("public_platform_stats_failed", error instanceof Error ? error.message : "unknown");
    throw new SiteDataUnavailableError("Platform statistics are temporarily unavailable");
  }
}

export async function getLaunch(tokenAddress: string): Promise<PublicLaunch | null> {
  if (!isAddress(tokenAddress)) return null;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new SiteDataUnavailableError("Public site data is not configured");
  try {
    const client = new ConvexHttpClient(url);
    const launch = await client.query(api.site.getLaunch, { tokenAddress });
    if (!launch) return null;
    return launch.storedMarketCapUsd === undefined ? launch : { ...launch, marketCapUsd: launch.storedMarketCapUsd };
  } catch (error) {
    console.error("public_launch_lookup_failed", error instanceof Error ? error.message : "unknown");
    throw new SiteDataUnavailableError("Launch data is temporarily unavailable");
  }
}

export type PublicWalletRecord = { address: string; createdAt: number; username?: string; tokens?: KnownWalletToken[] };
export async function getArcBotWallet(address: string): Promise<PublicWalletRecord | null> {
  if (!isAddress(address)) return null;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new SiteDataUnavailableError("Public site data is not configured");
  try {
    return await new ConvexHttpClient(url).query(api.site.getWallet, { address }) as PublicWalletRecord | null;
  } catch {
    throw new SiteDataUnavailableError("Wallet data is temporarily unavailable");
  }
}

export async function isArcBotWallet(address: string) {
  return Boolean(await getArcBotWallet(address));
}

export async function getWalletHoldings(address: string, knownWallet?: PublicWalletRecord): Promise<{ holdings: PublicHolding[]; available: boolean; username?: string }> {
  if (!isAddress(address)) return { holdings: [], available: false };
  const wallet = knownWallet ?? await getArcBotWallet(address);
  const [native, tokens] = await Promise.allSettled([arcWalletBalance(address), arcTokenBalances(address, wallet?.tokens?.map(token => token.address) ?? [])]);
  const holdings: PublicHolding[] = [];
  if (native.status === "fulfilled") {
    const balance = formatUnits(BigInt(native.value.balanceWei), 18);
    holdings.push({ name: "USD Coin", symbol: "USDC", balance, usdValue: Number(balance) });
  }
  if (tokens.status === "fulfilled") holdings.push(...tokens.value.tokens.map(token => ({ name: token.name, symbol: token.symbol, address: token.address, balance: token.balance, ...(typeof token.usdValue === "number" ? { usdValue: token.usdValue } : {}) })));
  return { holdings, available: native.status === "fulfilled" && tokens.status === "fulfilled" && !tokens.value.partial, username: wallet?.username };
}

// Retain the existing server-page import without exposing data/cache code to clients.
export { shortAddress } from "./address-display";

export const explorerAddress = (address: string) => arcAddressUrl(address);
export const explorerToken = (address: string) => `${ARC_EXPLORER_URL}/token/${address}`;
