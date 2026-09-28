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
    `Lifetime fees earned: ${amounts(report.lifetimeFeesEarned?.amounts ?? null)}`,
    report.family === "portal8-escrow"
      ? "Fee allocation: Automatic; no crank needed"
      : `Unprocessed: ${amounts(report.unallocated)}`,
    `Creator owed: ${amounts(report.creatorOwed)}`,
    `Liquidity reserved: ${amounts(report.liquidityReserved)}`,
    `Holder funds available: ${report.holderRewards ? amounts([report.holderRewards.available]) : "Not reported / no supported tracker"}`,
    ...(report.status === "partial"
      ? ["Partial coverage: some fee or lifetime data is not available."]
      : []),
    "Amounts are token units, not USD. Overlapping buckets must not be added together.",
    "Report only; no crank or claim was submitted.",
  ];
}

/** Compact shared content for X/TG; adapters handle delivery, not financial calculations. */
export function feeReportSummary(report: FeeReport): string[] {
  if (report.status === "unsupported" || report.status === "unavailable")
    return feeReportLines(report);
  return [
    `${
      report.assets?.token.symbol
        ?.replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim()
        .slice(0, 16) || "Token"
    } fee report | Arc`,
    `Token: ${report.token}`,
    `Lifetime fees earned: ${amounts(report.lifetimeFeesEarned?.amounts ?? null)}`,
    report.family === "portal8-escrow"
      ? "Awaiting crank: Automatic allocation; no crank needed"
      : `Awaiting crank: ${amounts(report.unallocated)}`,
    `Creator fees ready to claim: ${amounts(report.creatorOwed)}`,
    `Holder funds awaiting distribution: ${report.holderRewards ? amounts([report.holderRewards.available]) : "Not available"}`,
    ...(report.status === "partial" ? ["Partial coverage"] : []),
    "Token units, not USD. Buckets overlap; do not add them. Report only.",
  ];
}

/** Plain ASCII parts keep X's weighted length bounded, even with extreme token amounts.
 * Return all parts for a reply thread; never silently discard financial fields.
 * TG may join the same summary lines in a plain-text message (no parse_mode).
 */
export function feeReportXParts(report: FeeReport): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of feeReportSummary(report)) {
    let remaining = line;
    while (remaining.length > 280) {
      if (current) {
        parts.push(current);
        current = "";
      }
      parts.push(remaining.slice(0, 280));
      remaining = remaining.slice(280);
    }
    if (current && current.length + 1 + remaining.length > 280) {
      parts.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + remaining;
  }
  if (current) parts.push(current);
  return parts;
}
