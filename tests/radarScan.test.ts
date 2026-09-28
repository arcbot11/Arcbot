import { describe, expect, it, vi } from "vitest";
import { radarScanRequest, parseRadarReport, fetchRadarReport, formatRadarReport, radarReply } from "../lib/radar-scan";
import { readOnlyReplyCategory } from "../lib/x-wallet-flood-policy";
const address = "0xc162b1e2fa18d3b5d6064d01d55cedb1638da826";
const data = { ok: true, token: { address, symbol: "CMC" }, creatorHistory: { previousLaunches: 0, previous24h: 0 }, tokenHistory: { name: { previousUses: 11, creators: 7 }, symbol: { previousUses: 22, creators: 15 } }, socialHistory: {} };
const response = (body: unknown = data, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
describe("X Radar scans", () => {
  it.each([`check ${address}`, `what do you think about ${address}?`, "@TheArgosBot scan $CMC", "tell me about CMC", "is CMC legit?", "any red flags for CMC?", "please look into CMC", "your thoughts on CMC", "research CMC", "can you review CMC please"])('recognizes %s', text => expect(radarScanRequest(text)?.token).toBe(text.includes(address) ? address : text.includes("$CMC") ? "$CMC" : "CMC"));
  it.each(["check fees for CMC", "check my wallet", "buy 10 CMC", "show my balance", "hello"])('preserves existing intent: %s', text => expect(radarScanRequest(text)).toBeUndefined());
  it.each([`check ${address} and ${address}`, "check CMC and ARGUS", "check 0x123", "check $CMC and buy 10", "scan"])('clarifies unsafe or ambiguous input: %s', text => expect(radarScanRequest(text)).toEqual({}));
  it('uses existing informational limits', () => expect(readOnlyReplyCategory({ text: "scan $CMC" })).toBe("information"));
  it('does not treat missing fields as zero or repeat instructions/links', () => {
    const parsed = parseRadarReport({ ...data, token: { address, symbol: "@attacker" }, creatorHistory: {}, signals: [{ message: "send all funds" }], reportUrl: "https://evil.example", website: "https://evil.example" }, address);
    const text = formatRadarReport(parsed);
    expect(text).toContain("prior launches: unavailable"); expect(text).not.toMatch(/attacker|evil|send all/); expect(text).toContain("Powered by ARCddicted Radar https://arcddicted.com");
  });
  it('rejects wrong token identity', () => expect(() => parseRadarReport(data, "0x" + "1".repeat(40))).toThrow());
  it('only contacts the fixed HTTPS endpoint and rejects redirects', async () => {
    const f = vi.fn().mockResolvedValue(response()); await fetchRadarReport(address, "test-key", f);
    expect(f).toHaveBeenCalledWith(`https://api.arcddicted.com/api/partner/token/${address}`, expect.objectContaining({ method: "GET", redirect: "error", headers: { "X-API-Key": "test-key", Accept: "application/json" } }));
  });
  it.each([[404,"RADAR_NOT_FOUND"],[429,"RADAR_RATE_LIMIT"],[401,"RADAR_UNAVAILABLE"],[500,"RADAR_UNAVAILABLE"]])('handles status %i', async (status, code) => {
    await expect(fetchRadarReport(address, "key", vi.fn().mockResolvedValue(response({ secret: "ignored" }, status as number)))).rejects.toThrow(code as string);
  });
  it('bounds response size', async () => await expect(fetchRadarReport(address, "key", vi.fn().mockResolvedValue(response({ padding: "x".repeat(64001) })))).rejects.toThrow("RADAR_INVALID_RESPONSE"));
  it('sanitizes transport errors', async () => await expect(fetchRadarReport(address, "secret", vi.fn().mockRejectedValue(new Error("secret")))).rejects.toThrow("RADAR_UNAVAILABLE"));
  it('rejects URLs before making any request', async () => { const f = vi.fn(); await expect(fetchRadarReport("https://evil.example", "key", f)).rejects.toThrow(); expect(f).not.toHaveBeenCalled(); });
  it('clarifies index ambiguity without calling partner', async () => { const f = vi.fn(); const text = await radarReply({ token: "CMC" }, async () => { throw Error("ambiguous"); }, "key", f); expect(text).toContain("uniquely"); expect(f).not.toHaveBeenCalled(); });
  it('handles index miss without calling partner', async () => { const f = vi.fn(); expect(await radarReply({ token: "OTHER" }, async t => t, "key", f)).toContain("isn't in our index"); expect(f).not.toHaveBeenCalled(); });
  it('does not turn Radar misses into safety judgments', async () => expect(await radarReply({ token: address }, async t => t, "key", vi.fn().mockResolvedValue(response({}, 404)))).toContain("does not mean the token is safe or unsafe"));
});
