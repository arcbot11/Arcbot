import type { FeeAdmission } from "./admission";
import type { Transaction } from "../otc/model";
import { FEE_EXECUTOR_OWNER } from "./policy";

export type FeePhase = "crank" | "creator" | "holders";
export type SponsoredFeeTerms = {
  jobId: string; phase: FeePhase; family: "legacy-splitter" | "portal8-escrow";
  recipients: string[]; beneficiaries: string[]; beneficiaryShares: number[]; tracker: string | null;
  quote: string; payout: string;
};
export type FeeJob = FeeAdmission & {
  kind: "fee_job"; owner: typeof FEE_EXECUTOR_OWNER; updatedAt: number;
  status: "awaiting_payment" | "running" | "completed" | "failed";
  paymentId?: string; phase: number; steps: Array<{phase: FeePhase; txId?: string; skipped?: string}>;
  sourceRequestId?: string;
};
export type FeeControl = {
  kind: "fee_control"; id: "fee:control"; owner: typeof FEE_EXECUTOR_OWNER; updatedAt: number;
  enabled: boolean; wallets: string[]; excludedTokens: string[];
};
export const phases: FeePhase[] = ["crank", "creator", "holders"];
export const feeTxId = (jobId: string, phase: number) => `${jobId}:step:${phase}`;
export function finalizedFeeGas(txs: Transaction[]): bigint {
  return txs.reduce((sum, tx) => {
    if (!["completed", "reverted", "cancelled"].includes(tx.status)) throw Error("Fee transaction unresolved.");
    if (tx.status === "cancelled" && !tx.raw && !tx.hash && !tx.signingStartedAt) return sum;
    if (!tx.settlement || !/^(0|[1-9][0-9]*)$/.test(tx.settlement.gasWei)) throw Error("Fee gas receipt missing.");
    return sum + BigInt(tx.settlement.gasWei);
  }, 0n);
}
