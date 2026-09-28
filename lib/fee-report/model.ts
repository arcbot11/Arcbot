import { z } from "zod";
import { formatUnits, zeroAddress, type Address } from "viem";

export const feeReportInput = z
  .object({
    token: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .transform((v) => v.toLowerCase() as Address)
      .refine((v) => v !== zeroAddress),
    chain: z.literal("arc").default("arc"),
  })
  .strict();
export type FeeReportInput = z.infer<typeof feeReportInput>;
export type Asset = {
  address: Address;
  decimals: number;
  symbol: string | null;
};
export type Amount = Asset & { raw: string; formatted: string };
export type CreatorDebt = Amount & { bucket: "quote" | "launchToken" | "usdc" };
export function amount(asset: Asset, raw: bigint): Amount {
  if (
    raw < 0n ||
    !Number.isInteger(asset.decimals) ||
    asset.decimals < 0 ||
    asset.decimals > 255
  )
    throw Error("Invalid asset amount");
  return {
    ...asset,
    raw: String(raw),
    formatted: formatUnits(raw, asset.decimals),
  };
}
export function unallocated(balance: bigint, accounted: bigint) {
  if (accounted < 0n || balance < accounted)
    throw Error("Fee accounting exceeds available balance");
  return balance - accounted;
}
export type FeeReport = {
  schemaVersion: "1";
  service: "Argos Token Fee Intelligence";
  chainId: 5042;
  token: Address;
  status: "complete" | "partial" | "unsupported" | "unavailable";
  family: "legacy-splitter" | "portal8-escrow" | null;
  evidence: {
    blockNumber: string;
    blockHash: string;
    blockTimestamp: string;
    observedAt: string;
  } | null;
  contracts: {
    portal: Address;
    splitter: Address;
    tracker: Address | null;
  } | null;
  assets: { token: Asset; quote: Asset; payout: Asset } | null;
  beneficiaries: { address: Address; shareBps: number }[] | null;
  allocationBps: {
    creator: number;
    burn: number;
    holders: number;
    liquidity: number;
    treasury: number;
  } | null;
  // Accounted already includes claims/reserves: never add these buckets to balances.
  balances: Amount[] | null;
  unallocated: Amount[] | null;
  creatorOwed: CreatorDebt[] | null;
  liquidityReserved: Amount[] | null;
  holderRewards: {
    funded: Amount;
    held: Amount;
    available: Amount;
    totalPaid: Amount;
  } | null;
  signals: { unprocessedFees: boolean | null; creatorFeesOwed: boolean | null };
  execution: { enabled: false; reason: "report_only" };
  usdValuation: null;
  // Gross fees earned since launch, counted once at accrual; never claims + balances.
  lifetimeFeesEarned: {
    amounts: Amount[];
    fromBlock: string;
    throughBlock: string;
    source: "verified_counter" | "indexed_fee_events";
  } | null;
  warnings: string[];
};
export function emptyReport(input: FeeReportInput): FeeReport {
  return {
    schemaVersion: "1",
    service: "Argos Token Fee Intelligence",
    chainId: 5042,
    token: input.token,
    status: "unavailable",
    family: null,
    evidence: null,
    contracts: null,
    assets: null,
    beneficiaries: null,
    allocationBps: null,
    balances: null,
    unallocated: null,
    creatorOwed: null,
    liquidityReserved: null,
    holderRewards: null,
    signals: { unprocessedFees: null, creatorFeesOwed: null },
    execution: { enabled: false, reason: "report_only" },
    usdValuation: null,
    lifetimeFeesEarned: null,
    warnings: [
      "Amounts use each asset's own units; no USD valuation is supplied. Lifetime fees are unavailable until verified lifetime accounting is implemented.",
      "Balances, accounted claims and reserved liquidity overlap; do not sum them as total fees.",
      "Positive balances are observations, not proof that a crank or claim will succeed.",
    ],
  };
}
