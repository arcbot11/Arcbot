// Preserve the existing index admission thresholds. Unknown USD metrics fail closed.
export function screenArgusPool(pool) {
  if (!pool?.usdAnchored) return null;
  const marketCapUsd = pool.fdvUsd ?? pool.marketCapUsd;
  const { volume24hUsd, liquidityUsd, swaps24h } = pool;
  if (![marketCapUsd, volume24hUsd, liquidityUsd, swaps24h].every(Number.isFinite)
      || marketCapUsd <= 0 || volume24hUsd < 1000 || liquidityUsd < 500
      || swaps24h < 10 || volume24hUsd / marketCapUsd < 0.01) return null;
  return { marketCapUsd, volume24hUsd, liquidityUsd, trades: swaps24h, pool: pool.address };
}

export function preferDeeperPool(previous, next) {
  if (!next?.usdAnchored || !Number.isFinite(next.liquidityUsd)) return previous;
  return !previous || next.liquidityUsd > previous.liquidityUsd ? next : previous;
}
