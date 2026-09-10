export type TradeFlowQuote = { quote: string; stage: string; amountOut: string; minimumOut: string; protocol: string; gasWei: string; tradeGasBudgetWei?: string; expiresAt: number };
type Result = { id: string; status: string; leg: string };
export const tradeGasBudget = (quote: TradeFlowQuote) => quote.tradeGasBudgetWei ? BigInt(quote.tradeGasBudgetWei) : BigInt(quote.gasWei) * (quote.stage === "swap" ? 1n : 4n);
export const ARC_TRADE_GAS_BUDGET_WEI = "10000000000000000"; // 0.01 native USDC, including approvals.
const decimal = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  if (!/^\d+$/.test(whole) || !/^\d{0,36}$/.test(fraction)) throw new Error("Invalid trade amount.");
  return BigInt(whole) * 10n ** 36n + BigInt(fraction.padEnd(36, "0"));
};

/** Each approval must settle before the next quote. Uncertain submissions are never retried here. */
export async function executeTradeFlow(initial: TradeFlowQuote, io: {
  confirm: (quote: string) => Promise<Result>;
  preview: () => Promise<TradeFlowQuote>;
  wait: () => Promise<void>;
  active: () => boolean;
  progress: (message: string) => void;
}) {
  const budget = tradeGasBudget(initial), minimum = decimal(initial.minimumOut);
  let current = initial, spent = 0n;
  for (let step = 0; step < 4; step++) {
    if (!io.active()) throw new Error("Trade paused. Check transaction history before continuing.");
    if (Date.now() >= current.expiresAt) throw new Error("Quote expired. Submit the trade again.");
    if (spent + BigInt(current.gasWei) > budget)
      return { quote: current, message: "Gas exceeded the trade allowance. No swap was submitted. Submit again for a fresh gas estimate." };
    if (decimal(current.minimumOut) < minimum)
      return { quote: current, message: "Price moved below the original minimum. No swap was submitted. Submit again for a fresh quote." };
    io.progress(current.stage === "swap" ? "Preparing trade…" : current.stage === "reset token approval" ? "Preparing approval reset…" : current.stage === "approve router" ? "Preparing router approval…" : "Preparing token approval…");
    let result = await io.confirm(current.quote);
    if (result.leg !== (current.stage === "swap" ? "swap" : "allowance")) throw new Error("Unexpected transaction. Check transaction history.");
    if (result.status === "reverted") throw new Error("Transaction reverted. Check transaction history.");
    if (current.stage === "swap") return { result };
    const id = result.id;
    for (let attempt = 0; result.status !== "completed" && attempt < 30; attempt++) {
      await io.wait();
      if (!io.active()) throw new Error("Trade paused. Check transaction history before continuing.");
      // The confirm endpoint returns existing durable records without preparing or signing again.
      result = await io.confirm(current.quote);
      if (result.id !== id || result.leg !== "allowance") throw new Error("Unexpected transaction. Check transaction history.");
      if (result.status === "reverted") throw new Error("Token setup failed. Check transaction history.");
    }
    if (result.status !== "completed") throw new Error("Token setup is pending. Check transaction history before continuing.");
    spent += BigInt(current.gasWei);
    if (!io.active()) throw new Error("Trade paused. Check transaction history before continuing.");
    current = await io.preview();
  }
  return { quote: current, message: "Trade setup changed. Check transaction history before submitting again." };
}
