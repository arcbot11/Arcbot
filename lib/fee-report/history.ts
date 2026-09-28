import {decodeEventLog, keccak256, parseAbi, toHex, type Hex} from "viem";
import {z} from "zod";
import {amount, type FeeReport} from "./model";

const address = z.string().regex(/^0x[0-9a-f]{40}$/);
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
export const historyBinding = z.object({token: address, hook: address, locker: address, quote: address, family: z.enum(["legacy-splitter", "portal8-escrow"])}).strict();
export type HistoryBinding = z.infer<typeof historyBinding>;
export type FeeHistory = {
  kind: "fee_history"; id: string; owner: "service:fee-history"; updatedAt: number;
  binding: HistoryBinding; revision: number; nextBlock: string; targetBlock: string;
  throughHash: string | null; tokenTotal: string; quoteTotal: string; scheduledAt: number;
};
export const historyUpdate = z.object({id: z.string(), revision: z.number().int().nonnegative(), nextBlock: uint, throughHash: z.string().regex(/^0x[0-9a-f]{64}$/).nullable(), tokenTotal: uint, quoteTotal: uint, reset: z.boolean().optional()}).strict();
export const historyId = (token: string) => `fee-history:${token.toLowerCase()}`;
export function bindingFor(report: FeeReport): HistoryBinding | null {
  if (!report.family || !report.contracts?.hook || !report.contracts.locker || !report.assets || !report.evidence || !["partial", "complete"].includes(report.status)) return null;
  return historyBinding.parse({token: report.token.toLowerCase(), hook: report.contracts.hook.toLowerCase(), locker: report.contracts.locker.toLowerCase(), quote: report.assets.quote.address.toLowerCase(), family: report.family});
}
export function sameBinding(a: HistoryBinding, b: HistoryBinding) {return Object.keys(a).every(k => a[k as keyof HistoryBinding] === b[k as keyof HistoryBinding]);}
export const historyAbi = parseAbi([
  "event TaxTaken(address indexed currency,uint256 amount,bool exactInput,bool zeroForOne)",
  "event FeesCollected(address indexed caller,uint256 amount0,uint256 amount1)",
  "event QuoteFeeTaken(uint256 bucketFee,uint256 surcharge,bool exactInput,bool isBuy)",
]);
export const feeTopics = {
  tax: keccak256(toHex("TaxTaken(address,uint256,bool,bool)")),
  lp: keccak256(toHex("FeesCollected(address,uint256,uint256)")),
  quote: keccak256(toHex("QuoteFeeTaken(uint256,uint256,bool,bool)")),
};
export type FeeLog = {address: string; data: Hex; topics: readonly Hex[]; blockNumber: bigint; blockHash: Hex; transactionHash: Hex; logIndex: number; removed?: boolean};
/** Only fee accrual events. Claims, distributions, balances and transfers never enter totals. */
export function sumFeeLogs(binding: HistoryBinding, logs: FeeLog[], from: bigint, through: bigint) {
  let token = 0n, quote = 0n;
  const seen = new Set<string>();
  for (const log of logs) {
    const key = `${log.blockHash}:${log.transactionHash}:${log.logIndex}`;
    if (log.removed || log.blockNumber < from || log.blockNumber > through || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0 || seen.has(key)) throw Error("Invalid or duplicate fee event");
    seen.add(key);
    const source = log.address.toLowerCase(), topic = log.topics[0]?.toLowerCase();
    const expected = source === binding.hook ? (binding.family === "portal8-escrow" ? feeTopics.quote : feeTopics.tax) : source === binding.locker && binding.family === "legacy-splitter" ? feeTopics.lp : null;
    if (!expected || topic !== expected) throw Error("Unexpected fee event source");
    const event = decodeEventLog({abi: historyAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data, strict: true});
    if (event.eventName === "QuoteFeeTaken") quote += event.args.bucketFee;
    else if (event.eventName === "TaxTaken") {
      if (event.args.currency.toLowerCase() === binding.token) token += event.args.amount;
      else if (event.args.currency.toLowerCase() === binding.quote) quote += event.args.amount;
      else throw Error("Fee event currency mismatch");
    } else {
      const tokenFirst = BigInt(binding.token) < BigInt(binding.quote);
      token += tokenFirst ? event.args.amount0 : event.args.amount1;
      quote += tokenFirst ? event.args.amount1 : event.args.amount0;
    }
  }
  return {token, quote};
}
export function applyFeeHistory(report: FeeReport, history: FeeHistory, hash: string) {
  const binding = bindingFor(report);
  if (!binding || !sameBinding(binding, history.binding) || history.throughHash !== hash || BigInt(history.nextBlock) <= BigInt(history.targetBlock) || BigInt(history.nextBlock) > BigInt(report.evidence!.blockNumber) + 1n) return report;
  const scope = binding.family === "portal8-escrow" ? "Launch bucket fees; excludes the separate protocol surcharge and direct transfers." : "Recorded hook fees and collected LP fees; excludes unharvested LP fees and direct transfers.";
  report.lifetimeFeesEarned = {amounts: [amount(report.assets!.quote, BigInt(history.quoteTotal)), amount(report.assets!.token, BigInt(history.tokenTotal))], fromBlock: "0", throughBlock: String(BigInt(history.nextBlock) - 1n), source: "indexed_fee_events", scope};
  report.warnings = report.warnings.filter(w => !w.includes("Lifetime fees require"));
  report.warnings.push(scope, "Lifetime fees are indexed through the reported history block; current balances use the newer observation block.");
  // Legacy LP fees still inside the pool are outside this event-based total.
  report.status = binding.family === "legacy-splitter" ? "partial" : "complete";
  return report;
}
