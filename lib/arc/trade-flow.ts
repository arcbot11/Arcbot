export type TradeFlowQuote = { quote: string; amountIn?:string; stage: string; amountOut: string; minimumOut: string; protocol: string; gasWei: string; tradeGasBudgetWei?: string; expiresAt: number };
type Result = { id: string; status: string; leg: string };
export const tradeGasBudget = (quote: TradeFlowQuote) => quote.tradeGasBudgetWei ? BigInt(quote.tradeGasBudgetWei) : BigInt(quote.gasWei) * (quote.stage === "swap" ? 1n : 4n);
export const ARC_TRADE_GAS_BUDGET_WEI = "10000000000000000"; // Default allowance; higher verified estimates are supported.
export const estimatedTradeGasBudget = (gasWei: string) => {
  const estimate=BigInt(gasWei),baseline=BigInt(ARC_TRADE_GAS_BUDGET_WEI);
  return (estimate>baseline?estimate:baseline).toString();
};
const decimal = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  if (!/^\d+$/.test(whole) || !/^\d{0,36}$/.test(fraction)) throw new Error("Invalid trade amount.");
  return BigInt(whole) * 10n ** 36n + BigInt(fraction.padEnd(36, "0"));
};

/** Each approval must settle before the next quote. Uncertain submissions are never retried here. */
export async function executeTradeFlow(initial: TradeFlowQuote, io: {
  confirm: (quote: string) => Promise<Result>;
  status?: (id:string) => Promise<TransactionStatus>;
  preview: (amountIn?:string) => Promise<TradeFlowQuote>;
  wait: () => Promise<void>;
  active: () => boolean;
  progress: (message: string) => void;
}) {
  const budget = tradeGasBudget(initial), minimum = decimal(initial.minimumOut);
  let current = initial, spent = 0n;
  for (let step = 0; step < 4; step++) {
    if (!io.active()) throw new Error("Trade paused. Check transaction history before continuing.");
    if (Date.now() >= current.expiresAt) throw new Error("Quote expired. Submit the trade again.");
    // A refreshed server quote can authorize its higher estimated gas. The
    // transaction still passes backend gas policy and available-balance checks.
    const refreshedAllowance=current.tradeGasBudgetWei?BigInt(current.tradeGasBudgetWei):0n;
    if (spent + BigInt(current.gasWei) > budget && BigInt(current.gasWei)>refreshedAllowance)
      return { quote: current, message: "Gas exceeded the trade allowance. No swap was submitted. Submit again for a fresh gas estimate." };
    if (decimal(current.minimumOut) < minimum)
      return { quote: current, message: "Price moved below the original minimum. No swap was submitted. Submit again for a fresh quote." };
    io.progress(current.stage === "swap" ? "Preparing trade…" : current.stage === "reset token approval" ? "Preparing approval reset…" : current.stage === "approve router" ? "Preparing router approval…" : "Preparing token approval…");
    const result = await io.confirm(current.quote);
    if (result.leg !== (current.stage === "swap" ? "swap" : "allowance")) throw new Error("Unexpected transaction. Check transaction history.");
    if (result.status === "reverted") throw new Error("Transaction reverted. Check transaction history.");
    const action=current.stage==="swap"?"trade":current.stage==="reset token approval"?"approval reset":current.stage==="approve router"?"router approval":"token approval";
    const settled=await waitForTransaction(result,action,{...io,read:io.status??(()=>io.confirm(current.quote))});
    if (current.stage === "swap") return { result:settled };
    spent += BigInt(current.gasWei);
    if (!io.active()) throw new Error("Trade paused. Check transaction history before continuing.");
    io.progress("Refreshing trade quote…");
    current = await io.preview(initial.amountIn);
  }
  return { quote: current, message: "Trade setup changed. Check transaction history before submitting again." };
}
import {waitForTransaction,type TransactionStatus} from "./transaction-progress";
