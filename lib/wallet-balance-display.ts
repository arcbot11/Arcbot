type Snapshot = { walletAddress: string; balances: Array<{ chainId: number; balanceWei: string | null }> };

/** Preserve display balances only. Never restore stale spendable amounts. */
export function retainWalletBalances<T extends Snapshot>(previous: T | null, next: T): T {
  if (previous?.walletAddress.toLowerCase() !== next.walletAddress.toLowerCase()) return next;
  return { ...next, balances: next.balances.map(balance => ({
    ...balance,
    balanceWei: balance.balanceWei ?? previous.balances.find(old => old.chainId === balance.chainId)?.balanceWei ?? null,
  })) };
}
