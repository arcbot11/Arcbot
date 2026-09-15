export const ARGOS_TOKEN = "0xe86688530c456e099732f953ed7aa7c583026680";
/** Admit only receipt-verified Argos Bot launches. Never infer provenance from a ticker or creator wallet. */
export const BOT_LAUNCH_DIRECTORY = [{
  address: ARGOS_TOKEN, name: "Argos Bot", symbol: "ARGOS", image: "/brand/argos-dog-favicon.png",
  description: "Your gateway to Arc Chain.", pair: "USDC", featured: true,
  launchHash: "0x9136c3fa18e918b24a0b24871679fec2bf050ea77038c3c1727ec60104a4f01a",
}];
export type DirectoryToken = typeof BOT_LAUNCH_DIRECTORY[number] & {
  marketCap: number | null; volume24h: number | null; change24h: number | null;
  holders: number | null; graduated: boolean | null; progress: number | null; sparkline: number[];
};
const number = (v: unknown, signed = false): number | null => typeof v === "number" && Number.isFinite(v) && (signed || v >= 0) ? v : null;
export function directoryTokens(payload: unknown, verified: typeof BOT_LAUNCH_DIRECTORY = []): DirectoryToken[] {
  const rows = Array.isArray(payload) ? payload : [];
  const identities=[...new Map([...BOT_LAUNCH_DIRECTORY,...verified].map(t=>[t.address.toLowerCase(),t])).values()];
  return identities.map(token => {
    const row = rows.find((v: unknown) => !!v && typeof v === "object" && "address" in v
      && typeof v.address === "string" && v.address.toLowerCase() === token.address.toLowerCase()) as Record<string, unknown> | undefined;
    return { ...token, marketCap: number(row?.marketCap), volume24h: number(row?.volume24h),
      change24h: number(row?.change24h, true), holders: number(row?.holders),
      graduated: row?.status === "graduated" ? true : row?.status === "active" ? false : null,
      progress: number(row?.milestoneProgress) === null ? null : Math.min(100, row!.milestoneProgress as number),
      sparkline: Array.isArray(row?.sparkline) ? row.sparkline.filter((v): v is number => number(v) !== null).slice(-60) : [] };
  });
}
