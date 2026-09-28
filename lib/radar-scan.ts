// Read-only X feature. Never use partner strings as instructions or wallet inputs.
const ADDRESS = /^0x[0-9a-f]{40}$/i;
export const RADAR_ATTRIBUTION = "Powered by ARCddicted Radar https://arcddicted.com";

export function radarScanRequest(text: string): { token?: string } | undefined {
  const clean = text.replace(/^\s*(?:@[\w]+[\s,:]*)+/, "").trim();
  if (/\b(?:fees?|balance|balances|wallet|holdings|portfolio)\b/i.test(clean)) return;
  const asks = /\b(?:check|scan|analyse|analyze|review|research|investigate|inspect|evaluate|assess|audit|thoughts|opinion|legit|safe|scam|rug|red flags|due diligence|tell me about|look (?:at|into)|what do you (?:think|know)|what(?:'s| is) (?:the deal|up) with)\b/i.test(clean);
  if (!asks) return;
  // Mixed scan/trade requests get clarification, never fall through to a trade.
  if (/\b(?:buy|sell|send|transfer|swap|bridge|claim|burn|launch|deploy)\b/i.test(clean)) return {};
  const addresses = clean.match(/0x[0-9a-z]+/ig) ?? [];
  if (addresses.length) return addresses.length === 1 && ADDRESS.test(addresses[0]) ? { token: addresses[0] } : {};
  const cash = clean.match(/\$[a-z0-9_]{1,32}\b/ig) ?? [];
  if (cash.length) return cash.length === 1 ? { token: cash[0] } : {};
  const words = clean.replace(/[?!.,:;]/g, " ").split(/\s+/).filter(Boolean);
  const filler = new Set("hey hi hello please pls can could would you your me my a an the this that token coin project contract address ca ticker about on of for out into at and is it its any what do does think know tell give us some thoughts opinion check scan analyse analyze review research investigate inspect evaluate assess audit look legit safe scam rug red flags due diligence how looks looking thanks thank more information info report seems seem".split(" "));
  const candidates = words.filter(w => !filler.has(w.toLowerCase()));
  return candidates.length === 1 && /^\w{1,32}$/.test(candidates[0]) ? { token: candidates[0] } : {};
}

type Counts = { count?: number; creators?: number; sameCreator?: number; previousUses?: number };
export type RadarReport = {
  token: { address: string; symbol?: string };
  creatorHistory: { previousLaunches?: number; previous24h?: number };
  tokenHistory: { name: Counts; symbol: Counts };
  socialHistory: { website: Counts; twitter: Counts; telegram: Counts };
};
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
function counts(v: unknown): Counts { const o = object(v); return { count: number(o.count), creators: number(o.creators), sameCreator: number(o.sameCreator), previousUses: number(o.previousUses) }; }
export function parseRadarReport(value: unknown, address: string): RadarReport {
  const root = object(value), token = object(root.token), creator = object(root.creatorHistory), history = object(root.tokenHistory), social = object(root.socialHistory);
  if (root.ok !== true || typeof token.address !== "string" || token.address.toLowerCase() !== address.toLowerCase() || !ADDRESS.test(address)) throw new Error("RADAR_INVALID_RESPONSE");
  return {
    token: { address: address.toLowerCase(), symbol: typeof token.symbol === "string" && /^[a-z0-9_]{1,20}$/i.test(token.symbol) ? token.symbol : undefined },
    creatorHistory: { previousLaunches: number(creator.previousLaunches), previous24h: number(creator.previous24h) },
    tokenHistory: { name: counts(history.name), symbol: counts(history.symbol) },
    socialHistory: { website: counts(social.website), twitter: counts(social.twitter), telegram: counts(social.telegram) },
  };
}

export async function fetchRadarReport(address: string, key: string | undefined, fetcher: typeof fetch = fetch): Promise<RadarReport> {
  if (!ADDRESS.test(address)) throw new Error("RADAR_INVALID_ADDRESS");
  if (!key) throw new Error("RADAR_UNAVAILABLE");
  try {
    const response = await fetcher(`https://api.arcddicted.com/api/partner/token/${address.toLowerCase()}`, {
      method: "GET", headers: { "X-API-Key": key, Accept: "application/json" },
      redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) throw new Error("RADAR_NOT_FOUND");
    if (response.status === 429) throw new Error("RADAR_RATE_LIMIT");
    if (response.status !== 200) throw new Error("RADAR_UNAVAILABLE");
    if (!response.headers.get("content-type")?.includes("application/json") || !response.body) throw new Error("RADAR_INVALID_RESPONSE");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 64_000) throw new Error("RADAR_INVALID_RESPONSE"); chunks.push(value); } }
    finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return parseRadarReport(JSON.parse(new TextDecoder().decode(bytes)), address);
  } catch (error) {
    // Never propagate fetch errors, headers, raw partner content or credentials.
    const code = error instanceof Error ? error.message : "";
    throw new Error(["RADAR_NOT_FOUND", "RADAR_RATE_LIMIT", "RADAR_INVALID_RESPONSE"].includes(code) ? code : "RADAR_UNAVAILABLE");
  }
}

export function formatRadarReport(r: RadarReport): string {
  const n = (v: number | undefined) => v === undefined ? "unavailable" : String(v);
  return [
    `Radar scan${r.token.symbol ? `: $${r.token.symbol}` : ""} (Arc)`, r.token.address,
    `Creator's prior launches: ${n(r.creatorHistory.previousLaunches)}; past 24h: ${n(r.creatorHistory.previous24h)}.`,
    `Prior name uses: ${n(r.tokenHistory.name.previousUses)} across ${n(r.tokenHistory.name.creators)} creators.`,
    `Prior ticker uses: ${n(r.tokenHistory.symbol.previousUses)} across ${n(r.tokenHistory.symbol.creators)} creators.`,
    `Prior social-link uses — website: ${n(r.socialHistory.website.count)}; X: ${n(r.socialHistory.twitter.count)}; Telegram: ${n(r.socialHistory.telegram.count)}.`,
    "Radar database history, not a contract audit. Reuse alone doesn't establish fraud.",
    `Full report: https://arcddicted.com/?token=${r.token.address}`, RADAR_ATTRIBUTION,
  ].join("\n");
}

export async function radarReply(request: { token?: string }, resolve: (identifier: string) => Promise<string>, key: string | undefined, fetcher: typeof fetch = fetch): Promise<string> {
  if (!request.token) return `Please name one token ticker or full contract address for a scan, without a trade command.\n${RADAR_ATTRIBUTION}`;
  let address: string;
  try { address = await resolve(request.token); } catch { return `I couldn't resolve that ticker uniquely. Please use the full contract address.\n${RADAR_ATTRIBUTION}`; }
  if (!ADDRESS.test(address)) return `That ticker isn't in our index. Please use the full contract address.\n${RADAR_ATTRIBUTION}`;
  try { return formatRadarReport(await fetchRadarReport(address, key, fetcher)); }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "RADAR_NOT_FOUND" ? `Radar has no report for ${address}. This does not mean the token is safe or unsafe.`
      : code === "RADAR_RATE_LIMIT" ? "Radar is rate limited. Please try again later." : "Radar is temporarily unavailable. Please try again later.";
    return `${message}\n${RADAR_ATTRIBUTION}`;
  }
}
