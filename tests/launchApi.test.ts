import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), mutation: vi.fn() }));
vi.mock("../lib/otc/http", async original => ({ ...await original<typeof import("../lib/otc/http")>(), websiteSession: m.session }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = m.query; mutation = m.mutation; } }));
import { GET, POST } from "../app/api/wallet/launches/route";
const requestId = "00000000-0000-4000-8000-000000000001", address = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://unused.convex.cloud"); vi.stubEnv("WEB_AUTH_SECRET", "secret");
  m.session.mockResolvedValue({ owner: "tg:1", walletAddress: address }); m.mutation.mockResolvedValue({ status: "draft" });
});
afterEach(() => vi.unstubAllEnvs());
const post = (body: unknown) => new NextRequest("https://www.argosbot.io/api/wallet/launches", { method: "POST", body: JSON.stringify(body) });
it("hides both endpoints without authentication or storage calls while disabled", async () => {
  vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED", "false");
  expect((await GET(new NextRequest("https://www.argosbot.io/api/wallet/launches"))).status).toBe(404);
  expect((await POST(post({ action: "create" }))).status).toBe(404);
  expect(m.session).not.toHaveBeenCalled(); expect(m.mutation).not.toHaveBeenCalled();
});
it("derives wallet identity from the session and requires write authentication", async () => {
  await POST(post({ action: "cancel", requestId }));
  expect(m.session).toHaveBeenCalledWith(expect.anything(), true);
  expect(m.mutation).toHaveBeenCalledWith(expect.anything(), { owner: "tg:1", address, secret: "secret", requestId });
});
it.each(["execute", "sign", "broadcast", "confirm"])("rejects an incomplete or unsupported %s operation", async action => {
  const r = await POST(post({ action, requestId })); expect(r.status).toBe(400); expect(m.mutation).not.toHaveBeenCalled();
});
it.each(["execute", "resume"])("keeps valid %s requests disabled before accepting or signing", async action => {
  const r = await POST(post({ action, requestId, ...(action === "execute" ? { revision: 1 } : {}) }));
  expect(r.status).toBe(400); expect(await r.text()).toContain("Launch execution is disabled");
  expect(m.mutation).not.toHaveBeenCalled();
});
it("rejects caller-supplied identity instead of trusting it", async () => {
  const r = await POST(post({ action: "cancel", requestId, owner: "2", address }));
  expect(r.status).toBe(400); expect(m.mutation).not.toHaveBeenCalled();
});
it("does not expose provider credentials in errors", async () => {
  m.query.mockRejectedValue(Error("https://rpc.invalid/secret-key raw-credential"));
  const r = await GET(new NextRequest(`https://www.argosbot.io/api/wallet/launches?requestId=${requestId}`));
  expect(await r.text()).not.toMatch(/secret-key|raw-credential/); expect(r.headers.get("cache-control")).toBe("no-store");
});
it("normalizes an edit and binds it to the authenticated wallet and revision", async () => {
  const input = { name: "Example", symbol: "ex", imageURI: "ipfs://Qm" + "a".repeat(44), allocationText: "half creator rest holders" };
  expect((await POST(post({ action: "update", requestId, revision: 3, input }))).status).toBe(200);
  expect(m.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ owner: "tg:1", address, revision: 3 }));
  const normalized = JSON.parse(m.mutation.mock.calls[0][1].inputJson);
  expect(normalized).toMatchObject({ symbol: "EX", buyTaxBps: 100, sellTaxBps: 100, creatorBps: 5000, dividendBps: 5000, dividendMinimumTokens: "100000" });
  expect(normalized.allocationText).toBeUndefined();
});
it.each([0, 1.5, "1", Number.MAX_SAFE_INTEGER + 1])("rejects invalid edit revision %s before storage", async revision => {
  expect((await POST(post({ action: "update", requestId, revision, input: {} }))).status).toBe(400);
  expect(m.mutation).not.toHaveBeenCalled();
});
