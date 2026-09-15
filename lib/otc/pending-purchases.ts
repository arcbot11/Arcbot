import type { Order, RecordValue } from "./model";
export const PENDING_PURCHASE_STATUSES = ["payment_pending", "payment_submitted", "payment_finalized", "payout_submitted", "payout_failed"] as const;
/** Recovery is scoped to both the authenticated owner and their current wallet. */
export function pendingPurchases(records: RecordValue[], owner: string, wallet: string): Order[] {
  return records.filter((r): r is Order => r.kind === "order" && r.owner === owner &&
    r.buyer.toLowerCase() === wallet.toLowerCase() &&
    PENDING_PURCHASE_STATUSES.some(status=>status===r.status))
    .sort((a, b) => b.createdAt - a.createdAt);
}
