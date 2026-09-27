import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  paymentGateway,
  parsePayment,
  encode,
  reconcileGateway,
} from "../lib/bridge-api/payments";
import { apiConfig } from "../lib/bridge-api/config";
import { BASE_NETWORK, BASE_USDC } from "../lib/bridge-api/base-payments";
import type { PaymentPayload } from "@x402/core/types";
const mock = vi.hoisted(() => ({
  supported: vi.fn(),
  verify: vi.fn(),
  settle: vi.fn(),
}));
vi.mock("@coinbase/cdp-sdk/x402", () => ({
  createCdpFacilitatorClient: () => ({
    getSupported: mock.supported,
    verify: mock.verify,
    settle: mock.settle,
  }),
}));
beforeEach(() => {
  vi.stubEnv("CDP_API_KEY_ID", "test");
  vi.stubEnv("CDP_API_KEY_SECRET", "test");
  mock.supported.mockResolvedValue({
    kinds: [{ x402Version: 2, scheme: "exact", network: BASE_NETWORK }],
    extensions: [],
    signers: {},
  });
  mock.verify.mockResolvedValue({ isValid: true });
  mock.settle.mockResolvedValue({
    success: true,
    network: BASE_NETWORK,
    transaction: "0xreceipt",
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function proof(accepted: any): PaymentPayload {
  return {
    x402Version: 2,
    accepted,
    payload: {
      signature: "0x1234",
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: accepted.payTo,
        value: accepted.amount,
        nonce: `0x${"ab".repeat(32)}`,
        validAfter: "0",
        validBefore: "9999999999",
      },
    },
  };
}
it.each(["gateway", "direct"] as const)(
  "accepts exact Base USDC on %s at its endpoint price",
  async (rail) => {
    const g = await paymentGateway(apiConfig(rail), undefined, BASE_NETWORK);
    const q = await g.challenge("https://www.argosbot.io/api/v1/bridge/lookup");
    expect(q.accepts).toHaveLength(1);
    const a = q.accepts[0];
    expect(a).toMatchObject({
      network: BASE_NETWORK,
      asset: BASE_USDC,
      amount: rail === "direct" ? "7000" : "5000",
      extra: { name: "USD Coin", version: "2" },
    });
    const p = proof(a),
      r = await g.verify(p);
    expect(r).not.toBeNull();
    await g.settle(p, r!);
    expect(mock.settle).toHaveBeenCalledTimes(1);
    for (const changes of [
      { network: "eip155:5042" },
      { asset: "0x3600000000000000000000000000000000000000" },
      { amount: "1" },
      { payTo: "0x1111111111111111111111111111111111111111" },
      { extra: { name: "GatewayWalletBatched", version: "1" } },
    ]) {
      expect(await g.verify(proof({ ...a, ...changes }))).toBeNull();
    }
    expect(mock.verify).toHaveBeenCalledTimes(1);
    const arc = proof({ ...a, network: "eip155:5042" });
    expect(parsePayment(encode(p)).paymentKey).not.toBe(
      parsePayment(encode(arc)).paymentKey,
    );
    const fetcher = vi.fn();
    expect(await reconcileGateway(p, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("keeps Base available when CRA is unavailable and does not send Base signatures to CRA", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const g = await paymentGateway(apiConfig("direct"));
  const q = await g.challenge("https://example.com");
  expect(q.accepts.map((x) => x.network)).toEqual([BASE_NETWORK]);
  const count = fetcher.mock.calls.length;
  await g.verify(proof(q.accepts[0]));
  expect(fetcher).toHaveBeenCalledTimes(count);
});
it("does not initialize CRA at all for a selected Base payment", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await paymentGateway(apiConfig("direct"), undefined, BASE_NETWORK);
  expect(fetcher).not.toHaveBeenCalled();
});
it("fails closed when selected Base support is missing", async () => {
  mock.supported.mockResolvedValue({ kinds: [], extensions: [], signers: {} });
  await expect(
    paymentGateway(apiConfig(), undefined, BASE_NETWORK),
  ).rejects.toThrow();
});
