type Snapshot = { walletAddress: string; balances: Array<{ chainId: number; balanceWei: string | null;observedAt?:number|null }>;baseUsdc?:{balance:string|null;available:string|null;locked:string;observedAt?:number|null} };

/** Preserve display balances only. Never restore stale spendable amounts. */
export function retainWalletBalances<T extends Snapshot>(previous: T | null, next: T): T {
  if (previous?.walletAddress.toLowerCase() !== next.walletAddress.toLowerCase()) return next;
  return { ...next,...(next.baseUsdc?{baseUsdc:{...next.baseUsdc,balance:next.baseUsdc.balance??previous.baseUsdc?.balance??null,observedAt:next.baseUsdc.balance===null?previous.baseUsdc?.observedAt:next.baseUsdc.observedAt}}:{}), balances: next.balances.map(balance => ({
    ...balance,
    balanceWei: balance.balanceWei ?? previous.balances.find(old => old.chainId === balance.chainId)?.balanceWei ?? null,
    observedAt:balance.balanceWei===null?previous.balances.find(old=>old.chainId===balance.chainId)?.observedAt:balance.observedAt,
  })) };
}
