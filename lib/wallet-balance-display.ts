type Snapshot = { walletAddress: string; balances: Array<{ chainId: number; balanceWei: string | null }>;baseUsdc?:{balance:string|null;available:string|null;locked:string} };

/** Preserve display balances only. Never restore stale spendable amounts. */
export function retainWalletBalances<T extends Snapshot>(previous: T | null, next: T): T {
  if (previous?.walletAddress.toLowerCase() !== next.walletAddress.toLowerCase()) return next;
  return { ...next,...(next.baseUsdc?{baseUsdc:{...next.baseUsdc,balance:next.baseUsdc.balance??previous.baseUsdc?.balance??null}}:{}), balances: next.balances.map(balance => ({
    ...balance,
    balanceWei: balance.balanceWei ?? previous.balances.find(old => old.chainId === balance.chainId)?.balanceWei ?? null,
  })) };
}
