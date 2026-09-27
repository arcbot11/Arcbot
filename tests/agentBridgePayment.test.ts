import { expect, it, vi } from "vitest";
import { paid } from "../lib/agent-bridge/paid";
import { ApiError } from "../lib/agent-bridge/model";
import { encode, type PaymentGateway } from "../lib/bridge-api/payments";
import type { ApiStore, RequestRecord } from "../lib/bridge-api/store";
const address = `0x${"12".repeat(20)}`;
const config = {
  origin: "https://bridge-api.example",
  price: "0.01",
  atomicPrice: "10000",
  payTo: address,
  rail: "gateway" as const,
  enabled: true,
  configured: true,
};
const proof = {
  x402Version: 2,
  accepted: {
    scheme: "exact",
    network: "eip155:5042" as const,
    asset: address,
    amount: "10000",
    payTo: address,
    maxTimeoutSeconds: 120,
    extra: {},
  },
  payload: {
    signature: `0x${"ab".repeat(65)}`,
    authorization: {
      from: address,
      to: address,
      value: "10000",
      validAfter: "0",
      validBefore: "9999999999",
      nonce: `0x${"34".repeat(32)}`,
    },
  },
};
function fixture() {
  const rows = new Map<string, RequestRecord>();
  const store = {
    limit: vi.fn(async () => true),
    recover: vi.fn(async (id: string) => rows.get(id) || null),
    claim: vi.fn(async (r: any) => {
      rows.set(r.requestId, { ...r, state: "processing" });
      return { kind: "claimed" };
    }),
    update: vi.fn(
      async (
        id: string,
        state: string,
        resultJson?: string,
        receiptJson?: string,
      ) => {
        Object.assign(
          rows.get(id)!,
          { state },
          resultJson ? { resultJson } : {},
          receiptJson ? { receiptJson } : {},
        );
      },
    ),
  } as unknown as ApiStore;
  const gateway: PaymentGateway = {
    challenge: vi.fn(async () => ({
      x402Version: 2,
      resource: { url: "https://bridge-api.example/v1/jobs" },
      accepts: [proof.accepted],
    })),
    verify: vi.fn(async () => proof.accepted),
    settle: vi.fn(async () => ({
      success: true,
      network: "eip155:5042" as const,
      transaction: "receipt",
    })),
    cancel: vi.fn(async () => {}),
  };
  const request = () =>
    new Request("https://bridge-api.example/v1/jobs", {
      method: "POST",
      headers: { "Payment-Signature": encode(proof) },
    });
  return {
    rows,
    store,
    gateway,
    request,
    deps: { store, gateway, config, reconcile: vi.fn(async () => null) },
  };
}
it("charges once, recovers identical job result, and rejects proof reuse for another endpoint or intent", async () => {
  const f = fixture(),
    execute = vi.fn(async () => ({
      job: { id: "job" },
      accessToken: "capability",
    }));
  const first = await paid(
    f.request(),
    { amount: "1" },
    "/v1/jobs",
    execute,
    f.deps,
  );
  expect(first.status).toBe(200);
  const retry = await paid(
    f.request(),
    { amount: "1" },
    "/v1/jobs",
    execute,
    f.deps,
  );
  expect((await retry.json()).recovered).toBe(true);
  for (const [path, input] of [
    ["/v1/lookup", { amount: "1" }],
    ["/v1/jobs", { amount: "2" }],
  ] as const)
    expect((await paid(f.request(), input, path, execute, f.deps)).status).toBe(
      409,
    );
  expect(execute).toHaveBeenCalledTimes(1);
  expect(f.gateway.settle).toHaveBeenCalledTimes(1);
});
it("does not settle failed setup validation and returns actionable errors", async () => {
  const f = fixture();
  const response = await paid(
    f.request(),
    {},
    "/v1/jobs",
    async () => {
      throw new ApiError("setup_required", "Enable setup");
    },
    f.deps,
  );
  expect(response.status).toBe(409);
  expect((await response.json()).charged).toBe(false);
  expect(f.gateway.settle).not.toHaveBeenCalled();
  expect(f.gateway.cancel).toHaveBeenCalledOnce();
});
it("persists the job result before settlement and never automatically repeats uncertain settlement", async () => {
  const f = fixture(),
    execute = vi.fn(async () => ({ job: { id: "saved" } }));
  vi.mocked(f.gateway.settle).mockImplementation(async () => {
    const row = [...f.rows.values()][0];
    expect(row.state).toBe("settling");
    expect(row.resultJson).toContain("saved");
    throw Error("timeout");
  });
  expect(
    (await paid(f.request(), {}, "/v1/jobs", execute, f.deps)).status,
  ).toBe(503);
  expect(
    (await paid(f.request(), {}, "/v1/jobs", execute, f.deps)).status,
  ).toBe(409);
  expect(f.gateway.settle).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(1);
});
