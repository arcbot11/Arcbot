import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  revalidate: vi.fn(),
  lookup: vi.fn(),
  status: vi.fn(),
}));
vi.mock("../lib/bridge/prepare", () => ({
  prepare: mocks.prepare,
  revalidate: mocks.revalidate,
}));
vi.mock("../lib/bridge/read", () => ({ lookup: mocks.lookup }));
vi.mock("../lib/bridge/status", () => ({ status: mocks.status }));
import { GET, POST } from "../app/api/bridge/route";
const address = "0x" + "11".repeat(20);
function request(
  body: string,
  origin = "http://localhost:3000",
  extra: Record<string, string> = {},
) {
  return new NextRequest("http://localhost:3000/api/bridge", {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...extra },
    body,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({ ok: true });
  mocks.lookup.mockResolvedValue({ candidates: [], uncertain: [] });
});
it("rejects cross-origin preparation before RPC work", async () => {
  expect(
    (
      await POST(
        request(
          JSON.stringify({ operation: "prepare" }),
          "https://other.invalid",
        ),
      )
    ).status,
  ).toBe(400);
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it("limits streamed request bytes before parsing", async () => {
  expect((await POST(request(" ".repeat(50001)))).status).toBe(413);
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it("rejects declared oversized requests", async () => {
  expect(
    (await POST(request("{}", undefined, { "content-length": "1000000" })))
      .status,
  ).toBe(413);
});
it("rejects an invalid prepared review before revalidation", async () => {
  expect(
    (
      await POST(
        request(
          JSON.stringify({
            operation: "revalidate",
            prepared: { seal: "0".repeat(64) },
          }),
        ),
      )
    ).status,
  ).toBe(400);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("accepts a scoped, valid preparation request", async () => {
  const intent = {
    chain: 5042,
    token: address,
    account: address,
    action: "transfer",
      riskAcknowledged: true,
    amount: "1",
  };
  const r = await POST(
    request(JSON.stringify({ operation: "prepare", intent })),
  );
  expect(r.status).toBe(200);
  expect(mocks.prepare).toHaveBeenCalledWith(intent);
  expect(r.headers.get("cache-control")).toBe("no-store");
});
it("does not query an unsupported chain", async () => {
  expect(
    (
      await GET(
        new NextRequest(
          "http://localhost:3000/api/bridge?chain=1&hash=0x" + "11".repeat(32),
        ),
      )
    ).status,
  ).toBe(400);
  expect(mocks.status).not.toHaveBeenCalled();
});
it("returns HTTP 429 for excessive requests", async () => {
  let r;
  for (let i = 0; i < 41; i++)
    r = await GET(
      new NextRequest("http://localhost:3000/api/bridge?token=" + address, {
        headers: { "x-forwarded-for": "rate-test" },
      }),
    );
  expect(r!.status).toBe(429);
  expect(mocks.lookup).toHaveBeenCalledTimes(40);
});
