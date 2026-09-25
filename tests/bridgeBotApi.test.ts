import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { approval } from "./bridge-bot-fixture";
import { botBridgeUnsigned } from "../lib/bridge/bot-call";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  prepare: vi.fn(),
  revalidate: vi.fn(),
  seal: vi.fn(),
  read: vi.fn(),
  command: vi.fn(),
  advance: vi.fn(),
  call: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("../lib/otc/http", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  websiteSession: m.session,
}));
vi.mock("../lib/otc/repository", () => ({
  repository: () => ({ read: m.read, command: m.command }),
}));
vi.mock("../lib/otc/runtime", () => ({
  advanceTransaction: m.advance,
  prepareCall: m.call,
  balanceSnapshot: m.snapshot,
  walletTransferConfiguration: vi.fn(),
}));
vi.mock("../lib/bridge/prepare", () => ({
  prepare: m.prepare,
  revalidate: m.revalidate,
  verifySeal: m.seal,
}));
vi.mock("../lib/arc/config", () => ({
  arcConfigFromEnv: () => ({ maxGas: 10000000n, maxFeePerGas: 10n ** 15n }),
}));
vi.mock("../lib/base/config", () => ({
  baseConfigFromEnv: () => ({ maxGas: 10000000n, maxFeePerGas: 10n ** 15n }),
}));
import { POST } from "../app/api/wallet/bridge/route";
import { WebError } from "../lib/otc/http";
const request = (body: unknown) =>
  new NextRequest("https://example.com/api/wallet/bridge", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  const p = approval();
  m.session.mockResolvedValue({
    owner: "user",
    walletAddress: p.intent.account,
  });
  m.prepare.mockResolvedValue(p);
  m.read.mockResolvedValue(null);
  m.snapshot.mockResolvedValue({
    balanceWei: "1000000000000000000",
    block: "10",
    nonce: 1,
    pendingNonce: 1,
  });
  m.call.mockResolvedValue({
    reserveWei: p.gasBudget,
    snapshot: { balanceWei: "1000000000000000000", block: "10", nonce: 1 },
  });
  m.command.mockImplementation(async (name, input) => ({
    ...input,
    status: name === "bridge_reject" ? "cancelled" : "prepared",
  }));
  m.advance.mockImplementation(async (id) => ({
    id,
    status: "submitted",
    hash: "0x" + "12".repeat(32),
  }));
});
it("requires a recent authenticated write session before any RPC work", async () => {
  m.session.mockRejectedValue(new WebError("Reconnect", 401));
  expect((await POST(request({ operation: "prepare" }))).status).toBe(401);
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.command).not.toHaveBeenCalled();
  expect(m.session.mock.calls[0][1]).toBe(true);
});
it("derives the bot address from the session and rejects caller-supplied accounts", async () => {
  const { account, ...intent } = approval().intent;
  expect((await POST(request({ operation: "prepare", intent }))).status).toBe(
    200,
  );
  expect(m.prepare).toHaveBeenCalledWith({ ...intent, account });
  expect(
    (
      await POST(
        request({ operation: "prepare", intent: { ...intent, account } }),
      )
    ).status,
  ).toBe(400);
});
it("rejects a review for another wallet without touching its journal", async () => {
  const p = approval();
  p.intent.account = ("0x" + "11".repeat(20)) as `0x${string}`;
  expect(
    (await POST(request({ operation: "confirm", prepared: p }))).status,
  ).toBe(403);
  expect(m.command).not.toHaveBeenCalled();
  expect(m.advance).not.toHaveBeenCalled();
});
it("persists the exact authorized envelope before requesting a signature", async () => {
  const p = approval();
  const response = await POST(request({ operation: "confirm", prepared: p }));
  expect(response.status).toBe(200);
  expect(m.command).toHaveBeenCalledWith(
    "prepare",
    expect.objectContaining({
      leg: "bridge",
      bridgeStep: p,
      unsigned: botBridgeUnsigned(p),
      wallet: p.intent.account,
    }),
  );
  expect(m.command.mock.invocationCallOrder[0]).toBeLessThan(
    m.advance.mock.invocationCallOrder[0],
  );
  expect(m.revalidate).toHaveBeenCalledTimes(2);
});
it("reuses the existing request instead of preparing another transaction", async () => {
  const p = approval();
  m.read.mockResolvedValue({
    id: "existing",
    leg: "bridge",
    owner: "user",
    wallet: p.intent.account,
    bridgeStep: p,
    unsigned: botBridgeUnsigned(p),
    status: "submitted",
  });
  expect(
    (await POST(request({ operation: "confirm", prepared: p }))).status,
  ).toBe(200);
  expect(m.command).not.toHaveBeenCalled();
  expect(m.call).not.toHaveBeenCalled();
});
it("fences failed simulations and returns a recoverable cancellation", async () => {
  m.revalidate.mockRejectedValue(Error("simulation rejected"));
  const result = await (
    await POST(request({ operation: "confirm", prepared: approval() }))
  ).json();
  expect(m.command).toHaveBeenCalledWith(
    "bridge_reject",
    expect.objectContaining({ owner: "user" }),
  );
  // Runtime returns terminal records unchanged; it must not be asked to sign them.
  expect(result.id).toMatch(/^bridge:/);
  expect(result.status).toBe("cancelled");
  expect(m.advance).not.toHaveBeenCalled();
});

it("cancels a confirmation that arrives after expiry", async () => {
  const p=approval(); p.expiresAt=Date.now()-1;
  m.revalidate.mockRejectedValue(Error("Review expired"));
  const response=await POST(request({operation:"confirm",prepared:p}));
  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("cancelled");
  expect(m.command).toHaveBeenCalledWith("bridge_reject",expect.objectContaining({bridgeStep:p}));
  expect(m.advance).not.toHaveBeenCalled();
});
it("returns an existing terminal request after the review expires", async () => {
  const p=approval(),unsigned=botBridgeUnsigned(p);
  p.expiresAt=Date.now()-1;
  m.read.mockResolvedValue({id:"existing",leg:"bridge",owner:"user",wallet:p.intent.account,bridgeStep:p,unsigned,status:"cancelled"});
  const response=await POST(request({operation:"confirm",prepared:p}));
  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("cancelled");
  expect(m.command).not.toHaveBeenCalled();
  expect(m.advance).not.toHaveBeenCalled();
});

it("reconciles a stored legacy request without granting a new signing authorization", async () => {
  const p=approval(), unsigned=botBridgeUnsigned(p);
  delete p.intent.riskAcknowledged; p.expiresAt=Date.now()-1;
  m.read.mockResolvedValue({id:"existing",leg:"bridge",owner:"user",wallet:p.intent.account,bridgeStep:p,unsigned,status:"cancelled"});
  const response=await POST(request({operation:"confirm",prepared:p}));
  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("cancelled");
  expect(m.command).not.toHaveBeenCalled();
  expect(m.advance).not.toHaveBeenCalled();
});
it("fences an unadmitted legacy request when fresh validation rejects its missing acknowledgement", async () => {
  const p=approval(); delete p.intent.riskAcknowledged;
  m.revalidate.mockRejectedValue(Error("Acknowledge token transfer and redemption risks before bridging."));
  const response=await POST(request({operation:"confirm",prepared:p}));
  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("cancelled");
  expect(m.command).toHaveBeenCalledWith("bridge_reject",expect.objectContaining({bridgeStep:p}));
  expect(m.advance).not.toHaveBeenCalled();
});
