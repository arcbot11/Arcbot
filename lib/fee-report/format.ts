import type { Amount, FeeReport } from "./model";
// Token symbols are untrusted. Plain text only: no injected mentions, URLs or markup.
const label = (a: Amount) =>
  a.symbol
    ?.replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .slice(0, 16) || a.address;
const amounts = (items: Amount[] | null) =>
  items === null
    ? "Not available"
    : items.map((a) => `${a.formatted} ${label(a)}`).join("; ");
export function feeReportLines(report: FeeReport): string[] {
  if (["unavailable", "unsupported"].includes(report.status))
    return [
      `Fee report ${report.status} for ${report.token}.`,
      report.status === "unavailable"
        ? "Required data could not be verified. This does not mean zero fees."
        : "This token or fee contract is not supported yet.",
    ];
  return [
    "Argos token fee report",
    `Token: ${report.token}`,
    `Arc block: ${report.evidence?.blockNumber}`,
    `Unprocessed: ${amounts(report.unallocated)}`,
    `Creator owed: ${amounts(report.creatorOwed)}`,
    `Liquidity reserved: ${amounts(report.liquidityReserved)}`,
    `Holder funds available: ${report.holderRewards ? amounts([report.holderRewards.available]) : "Not reported / no supported tracker"}`,
    ...(report.status === "partial"
      ? ["Partial coverage: some fee buckets are not available."]
      : []),
    "Amounts are token units, not USD. Overlapping buckets must not be added together.",
    "Report only; no crank or claim was submitted.",
  ];
}
