import { v } from "convex/values";
import {
  marketEventKey,
  marketFieldsChanged,
  marketRefreshAllowed,
} from "../lib/market-index-policy";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { lifetimeVolumeSummary } from "../lib/lifetime-volume";
import type { QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { isTokenIndexExcluded } from "../lib/token-index-exclusions";
import { hasPublicFeeBuyback } from "../lib/burn-stats";
import { isArcBotHalfTotal } from "../lib/creator-burn-percentage";

function publicLaunch(
  launch: {
    requestId: string;
    sourcePostId?: string;
    name: string;
    symbol: string;
    imageUri: string;
    description?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    tokenAddress?: string;
    transactionHash: string;
    devBuySucceeded?: boolean;
    createdAt: number;
    pairToken?: string;
    poolAddress?: string;
    launcherUsername?: string;
    creatorAddress?: string;
    pairSymbol?: string;
    publicLastBuyAt?: number;
    publicMarketCapUsd?: number;
    publicMarketCapUpdatedAt?: number;
    publicVolume24hUsd?: number;
    publicVolume24hUpdatedAt?: number;
    publicGraduated?: boolean;
    publicGraduationUpdatedAt?: number;
    creatorFeeRecipient?: string;
    holderFeeSharing?: boolean;
    feesReassignedAt?: number;
  },
  creatorAddress?: string,
  launcherUsername?: string,
  pairSymbol?: string,
  lastBuyAt?: number,
  storedMarketCapUsd?: number,
  volume24hUsd?: number,
  graduated?: boolean,
  feeRecipientUsername?: string,
  marketCapUpdatedAt?: number,
  volume24hUpdatedAt?: number,
  graduationUpdatedAt?: number,
) {
  const effectiveLauncher = launch.launcherUsername || launcherUsername;
  const useMarketCap = marketCapUpdatedAt !== undefined && marketCapUpdatedAt > (launch.publicMarketCapUpdatedAt ?? 0);
  const useVolume = volume24hUpdatedAt !== undefined && volume24hUpdatedAt > (launch.publicVolume24hUpdatedAt ?? 0);
  const cap = useMarketCap ? storedMarketCapUsd : launch.publicMarketCapUsd ?? storedMarketCapUsd;
  const sourcePostId =
    launch.sourcePostId || launch.requestId.match(/^x:(\d+):/)?.[1];
  return {
    name: launch.name,
    symbol: launch.symbol,
    imageUri: launch.imageUri,
    description: launch.description,
    website: launch.website,
    twitter: launch.twitter,
    telegram: launch.telegram,
    tokenAddress: launch.tokenAddress,
    transactionHash: launch.transactionHash,
    devBuySucceeded: launch.devBuySucceeded,
    pairToken: launch.pairToken,
    pairSymbol: launch.pairSymbol || pairSymbol,
    poolAddress: launch.poolAddress,
    creatorAddress: launch.creatorAddress || creatorAddress,
    launcherUsername: effectiveLauncher,
    launchPostUrl:
      sourcePostId && effectiveLauncher
        ? `https://x.com/${effectiveLauncher.replace(/^@/, "")}/status/${sourcePostId}`
        : undefined,
    creatorFeeRecipient: launch.creatorFeeRecipient,
    holderFeeSharing: launch.holderFeeSharing,
    feeRecipientUsername,
    feesReassignedAt: launch.feesReassignedAt,
    createdAt: launch.createdAt,
    lastBuyAt: Math.max(launch.publicLastBuyAt ?? 0, lastBuyAt ?? 0) || undefined,
    marketCapUsd: cap,
    storedMarketCapUsd: cap,
    marketCapUpdatedAt: useMarketCap ? marketCapUpdatedAt : launch.publicMarketCapUpdatedAt ?? marketCapUpdatedAt,
    volume24hUsd: useVolume ? volume24hUsd : launch.publicVolume24hUsd ?? volume24hUsd,
    volume24hUpdatedAt: useVolume ? volume24hUpdatedAt : launch.publicVolume24hUpdatedAt ?? volume24hUpdatedAt,
    graduated: launch.publicGraduated === true || graduated === true,
    graduationUpdatedAt: Math.max(launch.publicGraduationUpdatedAt ?? 0, graduationUpdatedAt ?? 0) || undefined,
  };
}

export const listLaunches = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const launches = await ctx.db
      .query("tokenLaunches")
      .withIndex("by_public_created_at", (q) => q.eq("publicPublished", true))
      .order("desc")
      .take(Math.min(Math.max(limit || 24, 1), 100));
    return launches.filter((launch) => !isTokenIndexExcluded(launch.tokenAddress)).map((launch) =>
      publicLaunch(
        launch,
        undefined,
        launch.launcherUsername,
        launch.pairToken === "0x0000000000000000000000000000000000000000"
          ? "ETH"
          : launch.pairSymbol,
      ),
    );
  },
});

type PlatformStatsValue = {
  launches: number;
  wallets: number;
  lifetimeVolumeUsd: number;
  lifetimeVolumeCoverage: number;
  feesClaimed: Array<{ symbol: string; amount: number }>;
  feesClaimedUsd: number;
  feeValuationVersion: number;
  feeClaimsUnpriced: number;
  feeClaimTransactions: number;
  marketUpdatedAt: number;
};

async function computePlatformStats(ctx: QueryCtx): Promise<PlatformStatsValue> {
  const [launches, wallets, feeStats, lifetimeVolumes] =
    await Promise.all([
      ctx.db
        .query("tokenLaunches")
        .withIndex("by_public_created_at", (q) => q.eq("publicPublished", true))
        .collect(),
      ctx.db.query("cryptoWallets").collect(),
      ctx.db.query("creatorFeeStats").withIndex("by_key", q => q.eq("key", "public")).unique(),
      ctx.db.query("tokenLifetimeVolumes").collect(),
    ]);
  const amounts: Record<string, number> = feeStats ? JSON.parse(feeStats.amountsJson) : {};
  const feesClaimed = Object.entries(amounts)
    .map(([symbol, amount]) => ({ symbol, amount }))
    .sort((a, b) => b.amount - a.amount || a.symbol.localeCompare(b.symbol));
  const coveredLifetimeVolumes = lifetimeVolumes.filter((item) => item.lastSuccessAt !== undefined && item.enabled !== false);
  const lifetime = lifetimeVolumeSummary(coveredLifetimeVolumes);
  return {
    launches: launches.length,
    wallets: new Set(wallets.map((wallet) => wallet.ownerXUserId)).size,
    lifetimeVolumeUsd: lifetime.totalUsd,
    // Coverage describes launched tokens represented in the total, rather
    // than source rows (graduated tokens legitimately have curve + V4 rows).
    lifetimeVolumeCoverage: lifetime.tokenCoverage,
    feesClaimed,
    feesClaimedUsd: feeStats?.totalUsd ?? 0,
    feeValuationVersion: feeStats && feeStats.pricedCount > 0 ? 1 : 0,
    feeClaimsUnpriced: (feeStats?.claimCount ?? 0) - (feeStats?.pricedCount ?? 0),
    feeClaimTransactions: feeStats?.claimCount ?? 0,
    marketUpdatedAt: Math.max(
      launches.reduce((latest, launch) => Math.max(latest, launch.updatedAt), 0),
      lifetimeVolumes.reduce((latest, item) => Math.max(latest, item.lastSuccessAt || 0), 0),
    ),
  };
}

function cachedStats(cache: Doc<"platformStatsCache">): PlatformStatsValue {
  let feesClaimed: PlatformStatsValue["feesClaimed"] = [];
  try {
    const parsed = JSON.parse(cache.feesClaimedJson) as unknown;
    if (Array.isArray(parsed)) feesClaimed = parsed.filter((item): item is { symbol: string; amount: number } =>
      typeof item === "object" && item !== null &&
      typeof (item as { symbol?: unknown }).symbol === "string" &&
      typeof (item as { amount?: unknown }).amount === "number");
  } catch {}
  return {
    launches: cache.launches,
    wallets: cache.wallets,
    lifetimeVolumeUsd: cache.lifetimeVolumeUsd ?? 0,
    lifetimeVolumeCoverage: cache.lifetimeVolumeCoverage ?? 0,
    feesClaimed,
    // Never expose a previous mark-to-market total as historical valuation.
    feesClaimedUsd: cache.feeValuationVersion === 1 ? cache.feesClaimedUsd : 0,
    feeValuationVersion: cache.feeValuationVersion ?? 0,
    feeClaimsUnpriced: cache.feeClaimsUnpriced ?? 0,
    feeClaimTransactions: cache.feeClaimTransactions,
    marketUpdatedAt: cache.marketUpdatedAt,
  };
}

export const refreshPlatformStatsCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stats = await computePlatformStats(ctx);
    const existing = await ctx.db
      .query("platformStatsCache")
      .withIndex("by_key", (q) => q.eq("key", "public"))
      .unique();
    const lifetimeWorker = await ctx.db.query("lifetimeVolumeWorker").withIndex("by_key", q => q.eq("key", "global")).unique();
    if (existing && lifetimeWorker?.importManifestId) {
      stats.lifetimeVolumeUsd = existing.lifetimeVolumeUsd ?? 0;
      stats.lifetimeVolumeCoverage = existing.lifetimeVolumeCoverage ?? 0;
    }
    const value = {
      ...stats,
      // Retain the legacy fields while existing deployed documents migrate.
      // They are no longer displayed or treated as lifetime volume.
      volume24hUsd: existing?.volume24hUsd ?? 0,
      volumeCoverage: existing?.volumeCoverage ?? 0,
      feesClaimedJson: JSON.stringify(stats.feesClaimed),
      computedAt: Date.now(),
    };
    const { feesClaimed: _feesClaimed, ...stored } = value;
    if (existing) await ctx.db.patch(existing._id, stored);
    else await ctx.db.insert("platformStatsCache", { key: "public", ...stored });
    return stats;
  },
});

export const countLaunches = query({
  args: {},
  handler: async (ctx) => {
    const cache = await ctx.db
      .query("platformStatsCache")
      .withIndex("by_key", (q) => q.eq("key", "public"))
      .unique();
    if (cache) return cache.launches;
    const launches = await ctx.db
      .query("tokenLaunches")
      .withIndex("by_public_created_at", (q) => q.eq("publicPublished", true))
      .collect();
    return launches.length;
  },
});

/**
 * Public platform totals assembled entirely from data already held in Convex.
 * Volume and prices come from records already maintained by the market index;
 * loading this query never calls an external service.
 */
export const platformStats = query({
  args: {},
  handler: async (ctx) => {
    const cache = await ctx.db
      .query("platformStatsCache")
      .withIndex("by_key", (q) => q.eq("key", "public"))
      .unique();
    return cache ? cachedStats(cache) : computePlatformStats(ctx);
  },
});

/** Aggregate only: no vault identities, private tests, or transaction details. */
export const automatedFeeBurnStats = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query("automatedFeeEngineState")
      .withIndex("by_key", (q) => q.eq("key", "arcbot-automated-buyback-burn-v1"))
      .unique();
    return {
      arcbotBurned: (
        BigInt(state?.lifetimeArcBotBurned ?? "0")
        + BigInt(state?.lifetimeCreatorSelfArcBotBurned ?? "0")
      ).toString(),
    };
  },
});

export const listLaunchesPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sort: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("mcap"),
        v.literal("volume"),
      ),
    ),
  },
  handler: async (ctx, { paginationOpts, sort }) => {
    const options = {
      ...paginationOpts,
      numItems: Math.min(paginationOpts.numItems, 40),
    };
    const result =
      sort === "oldest"
        ? await ctx.db
            .query("tokenLaunches")
            .withIndex("by_public_created_at", (q) =>
              q.eq("publicPublished", true),
            )
            .order("asc")
            .paginate(options)
        : sort === "mcap"
          ? await ctx.db
              .query("tokenLaunches")
              .withIndex("by_public_market_cap", (q) =>
                q.eq("publicPublished", true),
              )
              .order("desc")
              .paginate(options)
          : sort === "volume"
            ? await ctx.db
                .query("tokenLaunches")
                .withIndex("by_public_volume", (q) =>
                  q.eq("publicPublished", true),
                )
                .order("desc")
                .paginate(options)
            : await ctx.db
                .query("tokenLaunches")
                .withIndex("by_public_created_at", (q) =>
                  q.eq("publicPublished", true),
                )
                .order("desc")
                .paginate(options);
    const page = result.page.filter((launch) => !isTokenIndexExcluded(launch.tokenAddress)).map((launch) =>
      publicLaunch(
        launch,
        undefined,
        launch.launcherUsername,
        launch.pairToken === "0x0000000000000000000000000000000000000000"
          ? "ETH"
          : launch.pairSymbol,
      ),
    );
    return { ...result, page };
  },
});

export const searchLaunches = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
    sort: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("mcap"),
        v.literal("volume"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const search = args.search.trim().replace(/^\$/, "").slice(0, 64);
    if (!search) return [];
    const readLimit = Math.min(Math.max(args.limit || 40, 1), 40);
    const [byName, bySymbol] = await Promise.all([
      ctx.db
        .query("tokenLaunches")
        .withSearchIndex("search_public_name", (q) =>
          q.search("name", search).eq("publicPublished", true),
        )
        .take(readLimit),
      ctx.db
        .query("tokenLaunches")
        .withSearchIndex("search_public_symbol", (q) =>
          q.search("symbol", search.toUpperCase()).eq("publicPublished", true),
        )
        .take(readLimit),
    ]);
    const matches = [
      ...new Map(
        [...bySymbol, ...byName].map((launch) => [launch._id, launch]),
      ).values(),
    ];
    matches.sort((left, right) =>
      args.sort === "oldest"
        ? left.createdAt - right.createdAt
        : args.sort === "mcap"
          ? (right.publicMarketCapUsd ?? -1) - (left.publicMarketCapUsd ?? -1)
          : args.sort === "volume"
            ? (right.publicVolume24hUsd ?? -1) - (left.publicVolume24hUsd ?? -1)
            : right.createdAt - left.createdAt,
    );
    return matches
      .filter((launch) => !isTokenIndexExcluded(launch.tokenAddress))
      .slice(0, readLimit)
      .map((launch) =>
        publicLaunch(
          launch,
          undefined,
          launch.launcherUsername,
          launch.pairToken === "0x0000000000000000000000000000000000000000"
            ? "ETH"
            : launch.pairSymbol,
        ),
      );
  },
});

export const getLaunch = query({
  args: { tokenAddress: v.string() },
  handler: async (ctx, { tokenAddress }) => {
    const normalized = tokenAddress.toLowerCase();
    if (isTokenIndexExcluded(normalized)) return null;
    const launch = await ctx.db
      .query("tokenLaunches")
      .withIndex("by_normalized_token_address", (q) =>
        q.eq("normalizedTokenAddress", normalized),
      )
      .unique();
    if (!launch || launch.publicPublished !== true) return null;
    const wallet = await ctx.db.get(launch.walletId);
    const user = launch.launcherUsername
      ? null
      : await ctx.db
          .query("xReplyUsers")
          .withIndex("by_x_user_id", (q) =>
            q.eq("xUserId", launch.ownerXUserId),
          )
          .unique();
    const pair = launch.pairToken
      ? await ctx.db
          .query("tokenRegistry")
          .withIndex("by_normalized_address", (q) =>
            q.eq("normalizedAddress", launch.pairToken!.toLowerCase()),
          )
          .unique()
      : null;
    const market = await ctx.db
      .query("tokenMarketState")
      .withIndex("by_normalized_token", (q) =>
        q.eq("normalizedTokenAddress", normalized),
      )
      .unique();
    // An active automated-fee vault becomes Argus' on-chain fee recipient, but
    // the public assignment remains the program beneficiary. Keep presenting
    // the person/wallet receiving the 95% allocation rather than the vault.
    const automatedFeeProgram = await ctx.db
          .query("automatedFeePrograms")
          .withIndex("by_token", (q) =>
            q.eq("normalizedTokenAddress", normalized),
          )
          .unique();
    const pendingControllerChanges = automatedFeeProgram ? (await Promise.all(
      (["reserved", "prepared", "broadcast", "failed"] as const).map(status =>
        ctx.db.query("automatedFeeControllerChanges").withIndex("by_program_status", q =>
          q.eq("programId", automatedFeeProgram._id).eq("status", status)).collect())))
      .flat().filter(change => change.workflowRoot && !change.workflowCompletedAt && change.selfBurnBps === undefined && !change.enrollmentLayer)
      .sort((a, b) => b.updatedAt - a.updatedAt) : [];
    const pendingControllerChange = pendingControllerChanges[0];
    const pendingHolderSharing = pendingControllerChange?.operation === "holders";
    const assignedFeeRecipient = pendingControllerChange?.operation === "reassign" && pendingControllerChange.newBeneficiaryAddress
      ? pendingControllerChange.newBeneficiaryAddress
      : automatedFeeProgram && automatedFeeProgram.status !== "exited"
          ? automatedFeeProgram.beneficiaryAddress
          : launch.creatorFeeRecipient;
    const pendingCreatorBurn = automatedFeeProgram
      ? await ctx.db.query("creatorBurnRequests").withIndex("by_program_status", q =>
          q.eq("programId", automatedFeeProgram._id).eq("status", "pending")).order("desc").first()
      : null;
    const rawDisplayedCreatorBurnBps = pendingControllerChange ? 0
      : pendingCreatorBurn ? pendingCreatorBurn.executionBps ?? pendingCreatorBurn.bps
        : automatedFeeProgram?.creatorBurnBps;
    const displayedCreatorBurnBps = rawDisplayedCreatorBurnBps !== undefined
      && isArcBotHalfTotal(normalized, rawDisplayedCreatorBurnBps)
      ? 5000 : rawDisplayedCreatorBurnBps;
    const normalizedAssignedFeeRecipient = assignedFeeRecipient?.toLowerCase();
    const feeWallet = normalizedAssignedFeeRecipient
      ? await ctx.db
          .query("cryptoWallets")
          .withIndex("by_normalized_address", (q) =>
            q.eq("normalizedAddress", normalizedAssignedFeeRecipient),
          )
          .unique()
      : null;
    const feeUser =
      feeWallet && !feeWallet.xUsername
        ? await ctx.db
            .query("xReplyUsers")
            .withIndex("by_x_user_id", (q) =>
              q.eq("xUserId", feeWallet.ownerXUserId),
            )
            .unique()
        : null;
    return {
      ...publicLaunch(
      launch,
      wallet?.address,
      user?.username,
      launch.pairToken === "0x0000000000000000000000000000000000000000"
        ? "ETH"
        : pair?.symbol,
      market?.lastBuyAt,
      market?.marketCapUsd,
      market?.volume24hUsd,
      market?.graduated,
      feeWallet?.xUsername || feeUser?.username,
      market?.marketCapUpdatedAt,
      market?.volume24hUpdatedAt,
      market?.graduationUpdatedAt,
      ),
      creatorFeeRecipient: assignedFeeRecipient,
      ...(pendingHolderSharing ? {holderFeeSharing:true} : {}),
      ...((automatedFeeProgram?.creatorBurnLayerAddress && automatedFeeProgram.status==="enrolled" && automatedFeeProgram.creatorBurnVerifiedAt) || pendingCreatorBurn
        ? {creatorSelfBurn:{active:true,percentageBps:displayedCreatorBurnBps??0}} : {}),
      automatedFeeBuybackEnabled: hasPublicFeeBuyback(automatedFeeProgram, launch.holderFeeSharing || pendingHolderSharing),
    };
  },
});

export const tokenActivity = query({
  args: { tokenAddress: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { tokenAddress, limit }) =>
    ctx.db
      .query("tokenActivity")
      .withIndex("by_token_time", (q) =>
        q
          .eq("normalizedTokenAddress", tokenAddress.toLowerCase())
          .gte("timestamp", Date.now() - 24 * 60 * 60_000),
      )
      .order("desc")
      .take(Math.min(Math.max(limit || 100, 1), 100)),
});

export const marketIndexTargets = query({
  args: { tokenAddresses: v.optional(v.array(v.string())) },
  handler: async (ctx, { tokenAddresses }) => {
    const requested = await Promise.all(
      (tokenAddresses || []).slice(0, 50).map((address) =>
        ctx.db
          .query("tokenLaunches")
          .withIndex("by_normalized_token_address", (q) =>
            q.eq("normalizedTokenAddress", address.toLowerCase()),
          )
          .unique(),
      ),
    );
    const launches = requested.filter((item) => item !== null);
    return Promise.all(
      launches
        .filter((launch) => launch.tokenAddress && launch.poolAddress)
        .map(async (launch) => {
          const market = await ctx.db
            .query("tokenMarketState")
            .withIndex("by_normalized_token", (q) =>
              q.eq(
                "normalizedTokenAddress",
                launch.tokenAddress!.toLowerCase(),
              ),
            )
            .unique();
          return {
            tokenAddress: launch.tokenAddress!,
            curveAddress: launch.poolAddress!,
            pairToken:
              launch.pairToken || "0x0000000000000000000000000000000000000000",
            indexedThroughBlock: market?.indexedThroughBlock,
            lastBuyAt: market?.lastBuyAt,
            marketCapUsd: market?.marketCapUsd,
            marketCapUpdatedAt: market?.marketCapUpdatedAt,
            graduated: market?.graduated,
            poolFee: market?.poolFee,
            tickSpacing: market?.tickSpacing,
            graduationCheckedAt: market?.graduationCheckedAt,
            activityBackfilledAt: market?.activityBackfilledAt,
          };
        }),
    );
  },
});

export const marketCatalogTargets = query({
  args: {},
  handler: async (ctx) => {
    const [launches, markets] = await Promise.all([
      ctx.db
        .query("tokenLaunches")
        .withIndex("by_public_created_at", (q) => q.eq("publicPublished", true))
        .collect(),
      ctx.db.query("tokenMarketState").collect(),
    ]);
    const byToken = new Map(markets.map((market) => [market.normalizedTokenAddress, market]));
    return launches.flatMap((launch) => {
      if (!launch.tokenAddress || !launch.poolAddress) return [];
      const market = byToken.get(launch.tokenAddress.toLowerCase());
      return [{
        tokenAddress: launch.tokenAddress,
        curveAddress: launch.poolAddress,
        pairToken: launch.pairToken || "0x0000000000000000000000000000000000000000",
        graduated: launch.publicGraduated ?? market?.graduated ?? false,
        poolFee: market?.poolFee,
        tickSpacing: market?.tickSpacing,
      }];
    });
  },
});

export const marketRuntimeConfig = query({
  args: {},
  handler: async (ctx) => {
    const factory = await ctx.db
      .query("protocolContracts")
      .withIndex("by_key", (q) => q.eq("key", "legacy_launch_factory"))
      .unique();
    const stateView = await ctx.db
      .query("protocolContracts")
      .withIndex("by_key", (q) => q.eq("key", "v4_state_view"))
      .unique();
    return {
      factory: factory?.active ? factory.address : null,
      stateView: stateView?.active ? stateView.address : null,
    };
  },
});

export const acquireMarketIndexLease = mutation({
  args: {
    now: v.number(),
    secret: v.string(),
    viewerKey: v.string(),
    leaseId: v.string(),
  },
  handler: async (ctx, { now, secret, viewerKey, leaseId }) => {
    if (
      !process.env.MARKET_INDEX_SECRET ||
      secret !== process.env.MARKET_INDEX_SECRET
    )
      throw new Error("market index authorization failed");
    const current = await ctx.db
      .query("marketIndexState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    // Fresh or already-running shared work needs no per-viewer write. This is
    // the common path and keeps multiple open pages from churning rate-limit
    // and cursor documents while still returning the persisted snapshot.
    if (current && !marketRefreshAllowed(current.lastRecordedAt, now))
      return {
        acquired: false,
        indexedThroughBlock: current.indexedThroughBlock,
        catalogRefreshedAt: current.catalogRefreshedAt,
      };
    if (current && current.leaseUntil > now)
      return {
        acquired: false,
        indexedThroughBlock: current.indexedThroughBlock,
        catalogRefreshedAt: current.catalogRefreshedAt,
      };
    const viewer = await ctx.db
      .query("marketViewerRateLimits")
      .withIndex("by_key", (q) => q.eq("key", viewerKey))
      .unique();
    const sameWindow = Boolean(viewer && now - viewer.windowStartedAt < 60_000);
    const count = sameWindow ? viewer!.count : 0;
    if (count >= 12)
      return {
        acquired: false,
        rateLimited: true,
        indexedThroughBlock: undefined,
        catalogRefreshedAt: current?.catalogRefreshedAt,
      };
    if (viewer)
      await ctx.db.patch(viewer._id, {
        windowStartedAt: sameWindow ? viewer.windowStartedAt : now,
        count: count + 1,
        updatedAt: now,
      });
    else
      await ctx.db.insert("marketViewerRateLimits", {
        key: viewerKey,
        windowStartedAt: now,
        count: 1,
        updatedAt: now,
      });
    if (current) {
      await ctx.db.patch(current._id, {
        leaseUntil: now + 75_000,
        leaseId,
        lastViewerAt: now,
        updatedAt: now,
      });
      return {
        acquired: true,
        indexedThroughBlock: current.indexedThroughBlock,
        catalogRefreshedAt: current.catalogRefreshedAt,
      };
    }
    await ctx.db.insert("marketIndexState", {
      key: "global",
      leaseUntil: now + 75_000,
      leaseId,
      lastViewerAt: now,
      updatedAt: now,
    });
    return { acquired: true, catalogRefreshedAt: undefined };
  },
});

export const renewMarketIndexLease = mutation({
  args: { now: v.number(), secret: v.string(), leaseId: v.string() },
  handler: async (ctx, { now, secret, leaseId }) => {
    if (
      !process.env.MARKET_INDEX_SECRET ||
      secret !== process.env.MARKET_INDEX_SECRET
    )
      throw new Error("market index authorization failed");
    const current = await ctx.db
      .query("marketIndexState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (!current || current.leaseId !== leaseId || current.leaseUntil <= now)
      return false;
    await ctx.db.patch(current._id, {
      leaseUntil: now + 75_000,
      updatedAt: now,
    });
    return true;
  },
});

export const cleanupMarketViewerRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("marketViewerRateLimits")
      .filter((q) => q.lt(q.field("updatedAt"), Date.now() - 24 * 60 * 60_000))
      .take(500);
    await Promise.all(expired.map((record) => ctx.db.delete(record._id)));
    return expired.length;
  },
});

export const recordCatalogMarketSnapshots = mutation({
  args: {
    secret: v.string(),
    leaseId: v.string(),
    snapshots: v.array(v.object({
      tokenAddress: v.string(),
      marketCapUsd: v.optional(v.number()),
      volume24hUsd: v.optional(v.number()),
      observedAt: v.number(),
    })),
  },
  handler: async (ctx, { secret, leaseId, snapshots }) => {
    if (!process.env.MARKET_INDEX_SECRET || secret !== process.env.MARKET_INDEX_SECRET)
      throw new Error("market index authorization failed");
    if (snapshots.length > 500) throw new Error("too many catalog snapshots");
    const cursor = await ctx.db
      .query("marketIndexState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (!cursor || cursor.leaseId !== leaseId || cursor.leaseUntil <= Date.now()) return false;
    const [states, launches] = await Promise.all([
      ctx.db.query("tokenMarketState").collect(),
      ctx.db
        .query("tokenLaunches")
        .withIndex("by_public_created_at", (q) => q.eq("publicPublished", true))
        .collect(),
    ]);
    const stateByToken = new Map(states.map((state) => [state.normalizedTokenAddress, state]));
    const launchByToken = new Map(launches.flatMap((launch) => launch.normalizedTokenAddress ? [[launch.normalizedTokenAddress, launch] as const] : []));
    for (const snapshot of snapshots) {
      if (isTokenIndexExcluded(snapshot.tokenAddress)) continue;
      const normalizedTokenAddress = snapshot.tokenAddress.toLowerCase();
      const state = stateByToken.get(normalizedTokenAddress);
      const launch = launchByToken.get(normalizedTokenAddress);
      if (!launch || !Number.isFinite(snapshot.observedAt) || snapshot.observedAt > Date.now()) continue;
      const useCap = snapshot.marketCapUsd !== undefined && Number.isFinite(snapshot.marketCapUsd) && snapshot.marketCapUsd > 0
        && snapshot.observedAt >= Math.max(state?.marketCapUpdatedAt ?? 0, launch.publicMarketCapUpdatedAt ?? 0);
      const useVolume = snapshot.volume24hUsd !== undefined && Number.isFinite(snapshot.volume24hUsd) && snapshot.volume24hUsd >= 0
        && snapshot.observedAt >= Math.max(state?.volume24hUpdatedAt ?? 0, launch.publicVolume24hUpdatedAt ?? 0);
      if (!useCap && !useVolume) continue;
      const stateValues = {
        tokenAddress: snapshot.tokenAddress,
        normalizedTokenAddress,
        ...(!useCap ? {} : {
          marketCapUsd: snapshot.marketCapUsd,
          marketCapUpdatedAt: snapshot.observedAt,
          marketCapSource: "gecko" as const,
        }),
        ...(!useVolume ? {} : { volume24hUsd: snapshot.volume24hUsd, volume24hUpdatedAt: snapshot.observedAt }),
      };
      if (state) {
        if (marketFieldsChanged(state, stateValues)) await ctx.db.patch(state._id, { ...stateValues, updatedAt: snapshot.observedAt });
      } else {
        await ctx.db.insert("tokenMarketState", { ...stateValues, updatedAt: snapshot.observedAt });
      }
      const publicValues = {
        ...(!useCap ? {} : {
          publicMarketCapUsd: snapshot.marketCapUsd,
          publicMarketCapUpdatedAt: snapshot.observedAt,
        }),
        ...(!useVolume ? {} : { publicVolume24hUsd: snapshot.volume24hUsd, publicVolume24hUpdatedAt: snapshot.observedAt }),
      };
      if (marketFieldsChanged(launch, publicValues)) await ctx.db.patch(launch._id, { ...publicValues, updatedAt: snapshot.observedAt });
    }
    await ctx.db.patch(cursor._id, { catalogRefreshedAt: Date.now(), updatedAt: Date.now() });
    return true;
  },
});

export const recordMarketIndex = mutation({
  args: {
    secret: v.string(),
    leaseId: v.string(),
    indexedThroughBlock: v.string(),
    marketCaps: v.array(
      v.object({
        tokenAddress: v.string(),
        indexedThroughBlock: v.string(),
        marketCapUsd: v.optional(v.number()),
        marketCapUpdatedAt: v.optional(v.number()),
        marketCapSource: v.optional(
          v.union(v.literal("gecko"), v.literal("onchain")),
        ),
        volume24hUsd: v.optional(v.number()),
        graduated: v.optional(v.boolean()),
        poolFee: v.optional(v.number()),
        tickSpacing: v.optional(v.number()),
        graduationCheckedAt: v.optional(v.number()),
        activityBackfilledAt: v.optional(v.number()),
      }),
    ),
    events: v.array(
      v.object({
        tokenAddress: v.string(),
        transactionHash: v.string(),
        logIndex: v.number(),
        kind: v.union(v.literal("buy"), v.literal("sell"), v.literal("burn")),
        walletAddress: v.string(),
        tokenAmount: v.string(),
        marketCapUsd: v.optional(v.number()),
        usdAmount: v.optional(v.number()),
        blockNumber: v.string(),
        timestamp: v.number(),
      }),
    ),
  },
  handler: async (
    ctx,
    { secret, leaseId, indexedThroughBlock, marketCaps, events },
  ) => {
    if (
      !process.env.MARKET_INDEX_SECRET ||
      secret !== process.env.MARKET_INDEX_SECRET
    )
      throw new Error("market index authorization failed");
    const activeLease = await ctx.db
      .query("marketIndexState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (
      !activeLease ||
      activeLease.leaseId !== leaseId ||
      activeLease.leaseUntil <= Date.now()
    )
      return false;
    const now = Date.now();
    const normalizedItems = new Map(
      marketCaps.map((item) => [item.tokenAddress.toLowerCase(), item]),
    );
    const eventTokens = [
      ...new Set(events.map((event) => event.tokenAddress.toLowerCase())),
    ];
    const allTokens = [...new Set([...normalizedItems.keys(), ...eventTokens])];
    const states = new Map<string, Doc<"tokenMarketState"> | null>();
    await Promise.all(
      allTokens.map(async (normalizedTokenAddress) => {
        const state = await ctx.db
          .query("tokenMarketState")
          .withIndex("by_normalized_token", (q) =>
            q.eq("normalizedTokenAddress", normalizedTokenAddress),
          )
          .unique();
        states.set(normalizedTokenAddress, state);
      }),
    );
    const recentKeys = new Map<string, Set<string>>();
    await Promise.all(
      eventTokens.map(async (normalizedTokenAddress) => {
        const state = states.get(normalizedTokenAddress) as
          { recentEventKeys?: string[] } | null | undefined;
        if (state?.recentEventKeys) {
          recentKeys.set(
            normalizedTokenAddress,
            new Set(state.recentEventKeys),
          );
          return;
        }
        // One bounded migration read per token replaces one existence query per
        // submitted event. Subsequent refreshes use the compact key cache.
        const recent = await ctx.db
          .query("tokenActivity")
          .withIndex("by_token_time", (q) =>
            q.eq("normalizedTokenAddress", normalizedTokenAddress),
          )
          .order("desc")
          .take(300);
        recentKeys.set(
          normalizedTokenAddress,
          new Set(
            recent
              .reverse()
              .map((event) =>
                marketEventKey(event.transactionHash, event.logIndex),
              ),
          ),
        );
      }),
    );
    for (const event of events) {
      if (isTokenIndexExcluded(event.tokenAddress)) continue;
      const normalizedTokenAddress = event.tokenAddress.toLowerCase();
      const key = marketEventKey(event.transactionHash, event.logIndex);
      const known = recentKeys.get(normalizedTokenAddress) || new Set<string>();
      if (!known.has(key)) {
        await ctx.db.insert("tokenActivity", {
          ...event,
          normalizedTokenAddress,
          volumeBucketed: true,
          createdAt: now,
        });
        known.add(key);
        recentKeys.set(normalizedTokenAddress, known);
        if (event.kind !== "burn" && event.usdAmount !== undefined) {
          // Five-minute buckets avoid unbounded event scans while keeping the
          // rolling 24-hour figure close to the exact cutoff.
          const hourStartedAt = Math.floor(event.timestamp / 300_000) * 300_000;
          const bucket = await ctx.db
            .query("tokenVolumeBuckets")
            .withIndex("by_token_hour", (q) =>
              q
                .eq("normalizedTokenAddress", normalizedTokenAddress)
                .eq("hourStartedAt", hourStartedAt),
            )
            .unique();
          if (bucket)
            await ctx.db.patch(bucket._id, {
              volumeUsd: bucket.volumeUsd + event.usdAmount,
              updatedAt: now,
            });
          else
            await ctx.db.insert("tokenVolumeBuckets", {
              normalizedTokenAddress,
              hourStartedAt,
              volumeUsd: event.usdAmount,
              updatedAt: now,
            });
        }
      } else {
        // Bounded repair scans may revisit a previously indexed event after an
        // indexer classification fix. Correct the row in place without adding
        // its USD value to the volume bucket a second time.
        const existingEvent = await ctx.db
          .query("tokenActivity")
          .withIndex("by_transaction_log", (q) =>
            q.eq("transactionHash", event.transactionHash).eq("logIndex", event.logIndex),
          )
          .first();
        if (existingEvent?.normalizedTokenAddress === normalizedTokenAddress) {
          const corrected = {
            kind: event.kind,
            walletAddress: event.walletAddress,
            tokenAmount: event.tokenAmount,
            marketCapUsd: event.marketCapUsd,
            usdAmount: event.usdAmount,
            blockNumber: event.blockNumber,
            timestamp: event.timestamp,
          };
          if (marketFieldsChanged(existingEvent, corrected)) await ctx.db.patch(existingEvent._id, corrected);
        }
      }
    }
    for (const item of marketCaps) {
      if (isTokenIndexExcluded(item.tokenAddress)) continue;
      const normalizedTokenAddress = item.tokenAddress.toLowerCase();
      const state = states.get(normalizedTokenAddress);
      const lastBuyAt = events
        .filter(
          (event) =>
            event.kind === "buy" &&
            event.tokenAddress.toLowerCase() === normalizedTokenAddress,
        )
        .reduce<number | undefined>(
          (latest, event) =>
            latest === undefined || event.timestamp > latest
              ? event.timestamp
              : latest,
          state?.lastBuyAt,
        );
      let volumeBucketsInitializedAt = state?.volumeBucketsInitializedAt;
      if (!state?.volumeBucketsInitializedAt) {
        const legacyEvents = await ctx.db
          .query("tokenActivity")
          .withIndex("by_token_bucketed_time", (q) =>
            q
              .eq("normalizedTokenAddress", normalizedTokenAddress)
              .eq("volumeBucketed", undefined),
          )
          .take(200);
        const totals = new Map<number, number>();
        for (const event of legacyEvents) {
          if (
            event.kind !== "burn" &&
            event.usdAmount !== undefined &&
            event.timestamp >= now - 24 * 60 * 60_000
          ) {
            const bucketStart = Math.floor(event.timestamp / 300_000) * 300_000;
            totals.set(
              bucketStart,
              (totals.get(bucketStart) || 0) + event.usdAmount,
            );
          }
          await ctx.db.patch(event._id, { volumeBucketed: true });
        }
        for (const [hourStartedAt, additionalVolume] of totals) {
          const bucket = await ctx.db
            .query("tokenVolumeBuckets")
            .withIndex("by_token_hour", (q) =>
              q
                .eq("normalizedTokenAddress", normalizedTokenAddress)
                .eq("hourStartedAt", hourStartedAt),
            )
            .unique();
          if (bucket)
            await ctx.db.patch(bucket._id, {
              volumeUsd: bucket.volumeUsd + additionalVolume,
              updatedAt: now,
            });
          else
            await ctx.db.insert("tokenVolumeBuckets", {
              normalizedTokenAddress,
              hourStartedAt,
              volumeUsd: additionalVolume,
              updatedAt: now,
            });
        }
        if (legacyEvents.length < 200) volumeBucketsInitializedAt = now;
      }
      const buckets =
        item.volume24hUsd === undefined
          ? await ctx.db
              .query("tokenVolumeBuckets")
              .withIndex("by_token_hour", (q) =>
                q
                  .eq("normalizedTokenAddress", normalizedTokenAddress)
                  .gte("hourStartedAt", now - 24 * 60 * 60_000),
              )
              .collect()
          : [];
      // Prefer the rolling value reported for the exact official Argus pool.
      // Local buckets remain a fallback when the external market feed is
      // unavailable, and continue supporting backend accounting.
      const volume24hUsd =
        item.volume24hUsd ??
        buckets.reduce((sum, bucket) => sum + bucket.volumeUsd, 0);
      const useIncomingCap = item.marketCapUpdatedAt !== undefined && item.marketCapUpdatedAt >= (state?.marketCapUpdatedAt ?? 0);
      const marketCapUsd = useIncomingCap ? item.marketCapUsd ?? state?.marketCapUsd : state?.marketCapUsd;
      const marketCapUpdatedAt = useIncomingCap ? item.marketCapUpdatedAt : state?.marketCapUpdatedAt;
      const marketCapSource = useIncomingCap ? item.marketCapSource ?? state?.marketCapSource : state?.marketCapSource;
      const graduated = state?.graduated === true || item.graduated === true;
      const graduationUpdatedAt = item.graduationCheckedAt !== undefined
        ? now
        : state?.graduationUpdatedAt;
      const poolFee = item.poolFee ?? state?.poolFee;
      const tickSpacing = item.tickSpacing ?? state?.tickSpacing;
      const graduationCheckedAt =
        item.graduationCheckedAt ?? state?.graduationCheckedAt;
      const activityBackfilledAt =
        item.activityBackfilledAt ?? state?.activityBackfilledAt;
      const cachedKeys = recentKeys.get(normalizedTokenAddress);
      const recentEventKeys = cachedKeys
        ? [...cachedKeys].slice(-300)
        : state?.recentEventKeys;
      const values = {
        tokenAddress: item.tokenAddress,
        normalizedTokenAddress,
        lastBuyAt,
        marketCapUsd,
        marketCapUpdatedAt,
        marketCapSource,
        volume24hUsd,
        volume24hUpdatedAt: now,
        graduated,
        graduationUpdatedAt,
        poolFee,
        tickSpacing,
        graduationCheckedAt,
        activityBackfilledAt,
        ...(volumeBucketsInitializedAt ? { volumeBucketsInitializedAt } : {}),
        ...(recentEventKeys ? { recentEventKeys } : {}),
        indexedThroughBlock: item.indexedThroughBlock,
      };
      if (state) {
        if (marketFieldsChanged(state, values))
          await ctx.db.patch(state._id, { ...values, updatedAt: now });
      } else
        await ctx.db.insert("tokenMarketState", { ...values, updatedAt: now });
      const launch = await ctx.db
        .query("tokenLaunches")
        .withIndex("by_normalized_token_address", (q) =>
          q.eq("normalizedTokenAddress", normalizedTokenAddress),
        )
        .unique();
      const publicValues = {
        publicLastBuyAt: lastBuyAt,
        publicMarketCapUsd: marketCapUsd,
        publicMarketCapUpdatedAt: marketCapUpdatedAt,
        publicVolume24hUsd: volume24hUsd,
        publicVolume24hUpdatedAt: now,
        publicGraduated: graduated,
        publicGraduationUpdatedAt: graduationUpdatedAt,
        ...((graduated === true || events.some((event) =>
          event.tokenAddress.toLowerCase() === normalizedTokenAddress &&
          event.kind !== "burn"
        ))
          ? { graduationMonitorNextCheckAt: now }
          : {}),
      };
      if (launch && marketFieldsChanged(launch, publicValues))
        await ctx.db.patch(launch._id, { ...publicValues, updatedAt: now });
    }
    const cursor = await ctx.db
      .query("marketIndexState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (cursor)
      await ctx.db.patch(cursor._id, {
        indexedThroughBlock,
        leaseUntil: 0,
        leaseId: undefined,
        lastRecordedAt: now,
        updatedAt: now,
      });
    return true;
  },
});

export const releaseMarketIndexLease = mutation({
  args: { secret: v.string(), leaseId: v.string() },
  handler: async (ctx, { secret, leaseId }) => {
    if (
      !process.env.MARKET_INDEX_SECRET ||
      secret !== process.env.MARKET_INDEX_SECRET
    )
      throw new Error("market index authorization failed");
    const current = await ctx.db
      .query("marketIndexState")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (current?.leaseId === leaseId)
      await ctx.db.patch(current._id, {
        leaseUntil: 0,
        leaseId: undefined,
        updatedAt: Date.now(),
      });
  },
});

/** Shared catalog: intentionally excludes users, holdings and private launches. */
export const terminalTokenCatalog = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    if (!process.env.WEB_AUTH_SECRET || secret !== process.env.WEB_AUTH_SECRET) throw new Error("terminal catalog authorization failed");
    const [latest, registry] = await Promise.all([
      ctx.db.query("tokenLaunches").withIndex("by_public_created_at", q => q.eq("publicPublished", true)).order("desc").take(2_000),
      ctx.db.query("tokenRegistry").filter(q => q.eq(q.field("active"), true)).take(250),
    ]);
    // Fewer than 2,000 means we already have every public launch. Otherwise
    // retain older, recently active tokens as well as the newest launches.
    const active = latest.length < 2_000 ? [] : await ctx.db.query("tokenLaunches")
      .withIndex("by_public_last_buy", q => q.eq("publicPublished", true).gte("publicLastBuyAt", Date.now() - 30 * 24 * 60 * 60_000)).collect();
    const catalog = new Map<string, { tokenAddress: string; name: string; symbol: string; pairToken?: string }>();
    for (const launch of [...latest, ...active]) if (launch.tokenAddress && !isTokenIndexExcluded(launch.tokenAddress)) {
      catalog.set(launch.tokenAddress.toLowerCase(), { tokenAddress: launch.tokenAddress, name: launch.name, symbol: launch.symbol, pairToken: launch.pairToken });
    }
    for (const token of registry) if (!isTokenIndexExcluded(token.address) && !catalog.has(token.normalizedAddress)) {
      catalog.set(token.normalizedAddress, { tokenAddress: token.address, name: token.name, symbol: token.symbol });
    }
    return [...catalog.values()];
  },
});

export const getMarketStates = query({
  args: { tokenAddresses: v.array(v.string()) },
  handler: async (ctx, { tokenAddresses }) =>
    Promise.all(
      tokenAddresses.slice(0, 50).map(async (tokenAddress) => {
        const state = await ctx.db
          .query("tokenMarketState")
          .withIndex("by_normalized_token", (q) =>
            q.eq("normalizedTokenAddress", tokenAddress.toLowerCase()),
          )
          .unique();
        const launch = await ctx.db.query("tokenLaunches").withIndex("by_normalized_token_address", q => q.eq("normalizedTokenAddress", tokenAddress.toLowerCase())).unique();
        const publicCapNewer = (launch?.publicMarketCapUpdatedAt ?? 0) > (state?.marketCapUpdatedAt ?? 0);
        const publicVolumeNewer = (launch?.publicVolume24hUpdatedAt ?? 0) > (state?.volume24hUpdatedAt ?? 0);
        return {
          tokenAddress,
          marketCapUsd: publicCapNewer ? launch?.publicMarketCapUsd : state?.marketCapUsd,
          marketCapUpdatedAt: publicCapNewer ? launch?.publicMarketCapUpdatedAt : state?.marketCapUpdatedAt,
          volume24hUsd: publicVolumeNewer ? launch?.publicVolume24hUsd : state?.volume24hUsd,
          volume24hUpdatedAt: publicVolumeNewer ? launch?.publicVolume24hUpdatedAt : state?.volume24hUpdatedAt,
          lastBuyAt: state?.lastBuyAt,
          graduated: state?.graduated === true || launch?.publicGraduated === true,
          graduationUpdatedAt: Math.max(state?.graduationUpdatedAt ?? 0, launch?.publicGraduationUpdatedAt ?? 0) || undefined,
        };
      }),
    ),
});

export const getMarketPrice = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const item = await ctx.db
      .query("marketPriceCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return item && item.expiresAt > Date.now() ? item : null;
  },
});

export const setMarketPrice = mutation({
  args: {
    secret: v.string(),
    key: v.string(),
    value: v.number(),
    sourceTimestamp: v.number(),
    ttlMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      !process.env.MARKET_INDEX_SECRET ||
      args.secret !== process.env.MARKET_INDEX_SECRET
    )
      throw new Error("market price authorization failed");
    const existing = await ctx.db
      .query("marketPriceCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    const patch = {
      value: args.value,
      sourceTimestamp: args.sourceTimestamp,
      expiresAt: Date.now() + args.ttlMs,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("marketPriceCache", { key: args.key, ...patch });
  },
});

export const getWalletExecutionCache = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!key || key.length > 180) return null;
    const item = await ctx.db
      .query("walletExecutionCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return item && item.expiresAt > Date.now()
      ? { kind: item.kind, valueJson: item.valueJson }
      : null;
  },
});

export const setWalletExecutionCache = mutation({
  args: {
    secret: v.string(),
    key: v.string(),
    kind: v.union(
      v.literal("v3_route"),
      v.literal("token_metadata"),
      v.literal("argus_pair"),
    ),
    valueJson: v.string(),
    ttlMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      !process.env.MARKET_INDEX_SECRET ||
      args.secret !== process.env.MARKET_INDEX_SECRET
    )
      throw new Error("wallet cache authorization failed");
    if (!args.key || args.key.length > 180 || args.valueJson.length > 4_000)
      throw new Error("wallet cache entry is invalid");
    const ttlMs = Math.max(1_000, Math.min(args.ttlMs, 7 * 24 * 60 * 60_000));
    const existing = await ctx.db
      .query("walletExecutionCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    const patch = {
      kind: args.kind,
      valueJson: args.valueJson,
      expiresAt: Date.now() + ttlMs,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else
      await ctx.db.insert("walletExecutionCache", { key: args.key, ...patch });
  },
});

export const getWallet = query({
  args: { address: v.string() },
  handler: async (ctx, { address }) => {
    const normalized = address.toLowerCase();
    const wallet = await ctx.db
      .query("cryptoWallets")
      .withIndex("by_normalized_address", (q) =>
        q.eq("normalizedAddress", normalized),
      )
      .unique();
    if (!wallet) return null;
    const tokens = await ctx.db
      .query("walletTokenIndex")
      .withIndex("by_wallet", (q) => q.eq("walletId", wallet._id))
      .take(100);
    const user = await ctx.db
      .query("xReplyUsers")
      .withIndex("by_x_user_id", (q) => q.eq("xUserId", wallet.ownerXUserId))
      .unique();
    const publicTokens = await Promise.all(
      tokens.filter(token => !isTokenIndexExcluded(token.tokenAddress)).map(async (token) => {
        const launch = await ctx.db
          .query("tokenLaunches")
          .withIndex("by_normalized_token_address", (q) =>
            q.eq("normalizedTokenAddress", token.normalizedTokenAddress),
          )
          .unique();
        if (token.involvedByLaunch && launch?.publicPublished !== true)
          return null;
        return {
          address: token.tokenAddress,
          symbol: token.symbol,
          isArcBotLaunch: launch?.publicPublished === true,
          ...(launch?.publicPublished === true && launch.imageUri
            ? { iconUrl: launch.imageUri }
            : {}),
        };
      }),
    );
    return {
      address: wallet.address,
      createdAt: wallet.createdAt,
      username: user?.username,
      tokens: publicTokens.filter((token) => token !== null),
    };
  },
});
