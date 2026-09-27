import { afterEach, expect, it, vi } from "vitest";
import { apiConfig, DIRECT_LOOKUP_PATH } from "../lib/bridge-api/config";
import {
  directAvailability,
  registrationMessage,
} from "../lib/bridge-api/direct";
import { discovery, openapi } from "../lib/bridge-api/discovery";
import { handleLookup } from "../lib/bridge-api/handler";
import {
  encode,
  paymentGateway,
  type PaymentGateway,
} from "../lib/bridge-api/payments";
import type { ApiStore, RequestRecord } from "../lib/bridge-api/store";
import type { PaymentPayload } from "@x402/core/types";
import {
  GET as directGET,
  OPTIONS as directOPTIONS,
} from "../app/api/v1/bridge/lookup/direct/route";
const a = "0x1111111111111111111111111111111111111111";
const info = {
  ok: true,
  network: "eip155:5042",
  scheme: "exact",
  asset: "0x3600000000000000000000000000000000000000",
  dailyCap: 200,
  sharedDailyCap: 400,
  sharedSettledToday: 0,
};
const seller = { registered: true, dailyCap: 200, settledToday: 0 };
const readiness = (s: object = seller, i: object = info) =>
  vi.fn(async (input: RequestInfo | URL) =>
    Response.json(String(input).includes("/sellers/") ? s : i),
  );
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("supports browser x402 preflight and exposes payment headers even when disabled", async () => {
  const preflight = await directOPTIONS();
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
    "Payment-Signature",
  );
  const response = await directGET(
    new Request(`https://www.argosbot.io${DIRECT_LOOKUP_PATH}?token=${a}`),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
    "Payment-Required",
  );
  expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false);
});
it("keeps Gateway enabled and direct discovery explicitly unavailable until registration is approved", () => {
  vi.stubEnv("BRIDGE_API_SERVICE_SECRET", "test");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  expect(apiConfig().enabled).toBe(true);
  expect(apiConfig().price).toBe("0.005");
  expect(apiConfig("direct").enabled).toBe(false);
  expect(apiConfig("direct").price).toBe("0.007");
  expect(discovery().routes.some((r) => r.rail === "direct")).toBe(false);
  expect(
    openapi().paths[DIRECT_LOOKUP_PATH].get["x-payment-option"].enabled,
  ).toBe(false);
});
it("fails closed on unregistered sellers, shared/seller quota exhaustion, asset changes and failed reads", async () => {
  for (const [s, i] of [
    [{ ...seller, registered: false }, info],
    [{ ...seller, settledToday: 200 }, info],
    [seller, { ...info, sharedSettledToday: 400 }],
    [seller, { ...info, asset: a }],
  ])
    expect((await directAvailability(a, readiness(s, i))).available).toBe(
      false,
    );
  expect(
    (
      await directAvailability(
        a,
        async () => new Response(null, { status: 503 }),
      )
    ).available,
  ).toBe(false);
  expect(
    (await directAvailability(a, async () => Response.json({}))).available,
  ).toBe(false);
  const f = readiness();
  expect(await directAvailability(a, f)).toMatchObject({
    available: true,
    sellerRemaining: 200,
    sharedRemaining: 400,
  });
  expect(
    f.mock.calls.every((c) =>
      String(c[0]).startsWith("https://api.cra-agent.tech/"),
    ),
  ).toBe(true);
});
it("uses CRA's live USDC signing domain and rejects a Gateway proof before facilitator verification", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/supported"))
      return Response.json({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:5042" }],
        extensions: [],
        signers: {},
      });
    if (url.endsWith("/verify"))
      return Response.json({ isValid: true, payer: a });
    return Response.json(url.includes("/sellers/") ? seller : info);
  });
  vi.stubGlobal("fetch", fetcher);
  const gateway = await paymentGateway({
    ...apiConfig("direct"),
    enabled: true,
    configured: true,
  });
  const challenge = await gateway.challenge(
    "https://www.argosbot.io" + DIRECT_LOOKUP_PATH,
  );
  expect(challenge.accepts[0]).toMatchObject({
    amount: "7000",
    extra: { name: "USDC", version: "2" },
  });
  const proof = {
    x402Version: 2,
    accepted: {
      ...challenge.accepts[0],
      extra: { name: "GatewayWalletBatched", version: "1" },
    },
    payload: { signature: "0x11" },
  } as PaymentPayload;
  expect(await gateway.verify(proof)).toBeNull();
  expect(fetcher.mock.calls.some((c) => String(c[0]).endsWith("/verify"))).toBe(
    false,
  );
});
it("uses the exact CRA registration text without any signing side effect", () => {
  expect(registrationMessage(a, "2026-09-26T00:00:00.000Z")).toBe(
    `CRA AGENT facilitator\n\nRegister this wallet as a seller. Payments to it may be settled by the CRA facilitator on Arc, within its daily allowance. No funds move by signing this.\n\nWallet: ${a}\nIssued: 2026-09-26T00:00:00.000Z`,
  );
});
it.each([false, true])(
  "preserves direct recovery after disablement without cross-rail replay (uncertain=%s)",
  async (uncertain) => {
    const rows = new Map<string, RequestRecord>();
    const store = {
      limit: async () => true,
      recover: async (id: string) => rows.get(id) || null,
      claim: async (r: any) => {
        rows.set(r.requestId, { ...r, state: "processing" });
        return { kind: "claimed" };
      },
      update: async (
        id: string,
        state: string,
        resultJson?: string,
        receiptJson?: string,
      ) =>
        Object.assign(
          rows.get(id)!,
          { state },
          resultJson ? { resultJson } : {},
          receiptJson ? { receiptJson } : {},
        ),
    } as unknown as ApiStore;
    const config = { ...apiConfig("direct"), enabled: true, configured: true };
    const accepted = {
      scheme: "exact",
      network: "eip155:5042" as const,
      asset: info.asset,
      amount: "7000",
      payTo: a,
      maxTimeoutSeconds: 120,
      extra: { name: "USDC", version: "2" },
    };
    const proof = {
      x402Version: 2,
      accepted,
      payload: {
        signature: `0x${"ab".repeat(65)}`,
        authorization: {
          from: a,
          to: a,
          nonce: `0x${"11".repeat(32)}`,
          value: "7000",
          validAfter: "0",
          validBefore: "9999999999",
        },
      },
    };
    const gateway = {
      verify: vi.fn(async () => accepted),
      settle: vi.fn(async () => ({
        success: true,
        network: "eip155:5042",
        transaction: `0x${"22".repeat(32)}`,
      })),
      cancel: vi.fn(),
      challenge: vi.fn(),
    } as unknown as PaymentGateway;
    if (uncertain)
      vi.mocked(gateway.settle).mockRejectedValue(
        new Error("settlement timeout"),
      );
    const lookup = vi.fn(async () => ({ status: "complete" }) as any);
    const req = (path = DIRECT_LOOKUP_PATH) =>
      new Request(`https://www.argosbot.io${path}?token=${a}&chain=arc`, {
        headers: { "Payment-Signature": encode(proof) },
      });
    expect(
      (await handleLookup(req(), { config, store, gateway, lookup })).status,
    ).toBe(uncertain ? 503 : 200);
    const retry = await handleLookup(req(), {
      config: { ...config, enabled: false },
      store,
      gateway,
      lookup,
    });
    const recovered = await retry.json();
    if (uncertain) {
      expect(retry.status).toBe(409);
      expect(recovered.state).toBe("uncertain");
    } else expect(recovered.recovered).toBe(true);
    expect(
      (
        await handleLookup(req("/api/v1/bridge/lookup"), {
          config,
          store,
          gateway,
          lookup,
        })
      ).status,
    ).toBe(409);
    expect(gateway.settle).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(1);
  },
);
