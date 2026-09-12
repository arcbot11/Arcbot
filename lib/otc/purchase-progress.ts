import type { Order, Transaction } from "./model";
import { settlementSteps } from "./escrow-model";

/** Public, read-only progress from the current attempts; never advances settlement. */
export function purchaseProgress(order: Order, transactions: Transaction[]) {
  const steps = order.escrow ? settlementSteps(order) : [];
  const step = steps.find(step => !transactions.some(tx => tx.escrowRef?.step === step && tx.status === "completed" && tx.hash && tx.blockNumber));
  const tx = transactions.find(tx => tx.escrowRef?.step === step);
  const updatedAt = Math.max(order.updatedAt, ...transactions.map(tx => tx.updatedAt));
  const note = tx?.note ?? order.note;
  if (note) return {message: note, active: false, updatedAt};
  if (tx?.status === "reverted") return {message: "Transaction reverted. Waiting for recovery.", active: false, updatedAt};
  const submitted = tx?.status === "submitted" || tx?.status === "signed";
  const labels: Record<string, string> = {
    gas: "Preparing settlement gas",
    deposit: submitted ? "Base verification" : "Preparing Base ETH payment",
    seller: "Base verification",
    arc: submitted ? "Verifying Arc USDC delivery" : "Sending Arc USDC to your wallet",
    fee: "Completing settlement",
    return_gas: "Completing settlement",
  };
  return {message: labels[step ?? ""] ?? "Confirming purchase status", active: true, updatedAt};
}
