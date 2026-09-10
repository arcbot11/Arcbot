import { xBotUsername } from "./x-bot-identity";
export function restrictedXIntakeEnabled() {
  return walletBalanceReadsExcluded() || showMyWalletReadsExcluded() || verifiedXReadsOnly() || excludedXReadCountries().length > 0;
}

export function excludedXReadCountries() {
  // Country-level intake restrictions are currently disabled. Keep this
  // code-owned so stale deployment environment values cannot restore them.
  return [];
}

export function walletBalanceReadsExcluded() {
  return false;
}

export function verifiedXReadsOnly() {
  // Verified-only intake has been retired. Keep the legacy environment name
  // inert so an old deployment value cannot silently restore this filter.
  return false;
}

export function showMyWalletReadsExcluded() {
  return false;
}

// Only the expiring emergency Premium overlay may restrict retrieval.
export function effectiveXIntakeFilters(automatic: { excludeWalletBalance: boolean; verifiedOnly: boolean } = { excludeWalletBalance: false, verifiedOnly: false }) {
  return { excludeWalletBalance: false, verifiedOnly: automatic.verifiedOnly,
    countries: [] as string[], excludeShowMyWallet: false, restricted: automatic.verifiedOnly };
}

export function restrictedXSearchQuery(_excludeWalletBalance = false, verifiedOnly = false, _countries: string[] = [], _excludeShowMyWallet = false) {
  const username = xBotUsername();
  return "(@" + username + " OR to:" + username + ")" + (verifiedOnly ? " is:verified" : "");
}

// Changing sources must not reuse endpoint-specific page tokens, nor backfill
// posts intentionally excluded during the temporary restriction.
export function intakeSourceTransition(previous: string | undefined, _restricted: boolean, now: number, verifiedOnly = false, _countries: string[] = [], _excludeShowMyWallet = false) {
  const source = verifiedOnly ? "emergency_premium" : "mentions";
  if ((previous ?? "mentions") === source) return undefined;
  return {
    intakeSource: source,
    newestSeenPostId: (((BigInt(now) - 1288834974657n) << 22n) + 4194303n).toString(),
    backlogPaginationToken: undefined,
    backlogNewestPostId: undefined,
    backlogVisitedPaginationTokens: undefined,
    backlogPaginationFailures: 0,
    updatedAt: now,
  };
}
