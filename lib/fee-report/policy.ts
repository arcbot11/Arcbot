import { X402_REVENUE_WALLET } from "../x402-revenue";

/** Shared across paid and sponsored requests. Never substitute a user's wallet. */
export const FEE_EXECUTOR = X402_REVENUE_WALLET;
export const FEE_EXECUTOR_OWNER = "service:token-fees:v1";
export const FEE_POLICY_VERSION = 1;
// Keep the unfinished paid service unavailable when unrelated website changes deploy.
// Enable only after report coverage and payment/worker release checks are complete.
export const FEE_PUBLIC_API_ENABLED = false;

// Initial commercial policy, not a claim about measured production gas costs.
// Arc native gas is USDC represented at 18 decimals (ERC-20 USDC uses 6).
export const FEE_REPORT_PRICE_USDC = "0.007";
export const FEE_CLAIM_PRICE_USDC = "0.05";
export const FEE_JOB_GAS_CAP = 30_000_000_000_000_000n; // $0.03 total
export const FEE_CALL_GAS_CAP = 10_000_000_000_000_000n; // $0.01 per call
export const FEE_RESERVE = 5n * FEE_CALL_GAS_CAP;
export const FREE_DAILY_GAS_CAP = 1_000_000_000_000_000_000n; // $1
export const ALL_DAILY_GAS_CAP = 5_000_000_000_000_000_000n; // $5
export const FREE_CLAIMS_PER_HOUR = 3;
export const FREE_CHECKS_PER_MINUTE = 10;
export const TOKEN_COOLDOWN_MS = 10 * 60_000;
export const MAX_FEE_CALLS = 3;
export const MAX_HOLDER_BATCH = 50;
export type FeeChannel = "x402" | "x" | "telegram";

export function assertFeeExecutor(address: string) {
  if (address.toLowerCase() !== FEE_EXECUTOR.toLowerCase())
    throw Error("Fee workflows require the configured x402 revenue wallet.");
}

/** Call immediately before fresh signing, with balances net of other reservations. */
export function assertFeeGasBudget(input: {
  balanceWei: bigint;
  otherReservedWei: bigint;
  spentWei: bigint;
  maximumCallWei: bigint;
  calls: number;
}) {
  const { balanceWei, otherReservedWei, spentWei, maximumCallWei, calls } =
    input;
  if (
    [balanceWei, otherReservedWei, spentWei, maximumCallWei].some(
      (v) => v < 0n,
    ) ||
    maximumCallWei === 0n ||
    !Number.isSafeInteger(calls) ||
    calls < 0
  )
    throw Error("Invalid fee gas accounting.");
  if (
    calls >= MAX_FEE_CALLS ||
    maximumCallWei > FEE_CALL_GAS_CAP ||
    spentWei + maximumCallWei > FEE_JOB_GAS_CAP
  )
    throw Error("Fee workflow gas budget exceeded.");
  if (balanceWei - otherReservedWei - maximumCallWei < FEE_RESERVE)
    throw Error(
      "Fee service needs funding to preserve its five-call gas reserve.",
    );
}

/** A platform user ID comes from authenticated X/TG context, never body parameters. */
export function feePrincipal(channel: FeeChannel, authenticatedId: string) {
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(authenticatedId))
    throw Error("Invalid fee principal.");
  // Callers should use the same canonical owner for linked X/TG accounts.
  return channel === "x402"
    ? `paid:${authenticatedId}`
    : `social:${authenticatedId}`;
}
