import { createHash } from "node:crypto";
import {
  x402ResourceServer,
  HTTPFacilitatorClient,
  type FacilitatorClient,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  BatchFacilitatorClient,
  GatewayEvmScheme,
} from "@circle-fin/x402-batching/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  PaymentRequired,
  SettleResponse,
} from "@x402/core/types";
import { z } from "zod";
import { apiConfig, DESCRIPTION } from "./config";
import { directAvailability } from "./direct";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const authorizationSchema = z.object({
  from: z.string().regex(/^0x[\da-fA-F]{40}$/),
  to: z.string().regex(/^0x[\da-fA-F]{40}$/),
  nonce: z.string().regex(/^0x[\da-fA-F]{64}$/),
  value: z.string().regex(/^\d+$/),
  validAfter: z.string().regex(/^\d+$/),
  validBefore: z.string().regex(/^\d+$/),
});
export function parsePayment(header: string) {
  if (header.length > 24000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header))
    throw Error("Invalid payment encoding");
  const raw = JSON.parse(
    Buffer.from(header, "base64").toString("utf8"),
  ) as PaymentPayload;
  if (
    raw.x402Version !== 2 ||
    !raw.accepted ||
    !raw.payload ||
    typeof raw.payload.signature !== "string" ||
    !/^0x[\da-fA-F]+$/.test(raw.payload.signature)
  )
    throw Error("Invalid x402 payment");
  const auth = authorizationSchema.parse(raw.payload.authorization);
  if (raw.accepted.network !== "eip155:5042" || raw.accepted.scheme !== "exact")
    throw Error("Unsupported payment");
  // Key on the authorization nonce, not a JSON or signature encoding. Never persist the signature.
  const paymentKey = hash(
    `${raw.accepted.network}:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`,
  );
  const recoveryHash = hash(
    `${paymentKey}:${raw.payload.signature.toLowerCase()}:${canonical(auth)}:${canonical(raw.accepted)}`,
  );
  return {
    payload: raw,
    paymentKey,
    recoveryHash,
    requestId: `br_${paymentKey.slice(0, 40)}`,
  };
}
export interface PaymentGateway {
  challenge(url: string): Promise<PaymentRequired>;
  verify(payload: PaymentPayload): Promise<PaymentRequirements | null>;
  settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse>;
  cancel(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<void>;
}
// Read-only reconciliation. No settle retry or signed authorization leaves this function.
// Only a confirmed/completed transfer matching all filters is sufficient evidence.
export async function reconcileGateway(
  payload: PaymentPayload,
  fetcher: typeof fetch = fetch,
): Promise<SettleResponse | null> {
  if (payload.accepted.extra?.name !== "GatewayWalletBatched") return null;
  const auth = authorizationSchema.parse(payload.payload.authorization);
  const url = new URL("https://gateway-api.circle.com/v1/x402/transfers");
  for (const [k, v] of Object.entries({
    from: auth.from,
    to: auth.to,
    nonce: auth.nonce,
    network: "eip155:5042",
    token: "USDC",
    pageSize: "2",
  }))
    url.searchParams.set(k, v);
  const response = await fetcher(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    transfers?: {
      id: string;
      status: string;
      token: string;
      sendingNetwork: string;
      recipientNetwork: string;
      fromAddress: string;
      toAddress: string;
      amount: string;
    }[];
  };
  if (!Array.isArray(body.transfers) || body.transfers.length !== 1)
    return null;
  const t = body.transfers[0];
  if (
    !["confirmed", "completed"].includes(t.status) ||
    t.token !== "USDC" ||
    t.sendingNetwork !== "eip155:5042" ||
    t.recipientNetwork !== "eip155:5042" ||
    t.fromAddress?.toLowerCase() !== auth.from.toLowerCase() ||
    t.toAddress?.toLowerCase() !== auth.to.toLowerCase() ||
    t.amount !== auth.value ||
    !/^[0-9a-f-]{36}$/i.test(t.id)
  )
    return null;
  return {
    success: true,
    network: "eip155:5042",
    payer: auth.from,
    transaction: t.id,
    amount: auth.value,
    extensions: {
      "argos-reconciliation": {
        source: "circle-transfer-search",
        status: t.status,
        transferId: t.id,
      },
    },
  };
}
export async function paymentGateway(
  config = apiConfig(),
  description = DESCRIPTION,
): Promise<PaymentGateway> {
  if (
    config.rail === "direct" &&
    !(await directAvailability(config.payTo)).available
  )
    throw Error(
      "Direct settlement unavailable; use Gateway only if no payment is unresolved",
    );
  const server =
    config.rail === "gateway"
      ? // Circle declares a narrower optional resource-metadata shape than core.
        // The wire protocol is the same; all our challenges populate that metadata.
        new x402ResourceServer(
          new BatchFacilitatorClient({
            url: "https://gateway-api.circle.com",
          }) as unknown as FacilitatorClient,
        ).register("eip155:5042", new GatewayEvmScheme())
      : new x402ResourceServer(
          new HTTPFacilitatorClient({
            url: "https://api.cra-agent.tech/facilitator",
          }),
        ).register("eip155:5042", new ExactEvmScheme());
  await server.initialize();
  const requirements = await server.buildPaymentRequirements({
    scheme: "exact",
    network: "eip155:5042",
    payTo: config.payTo,
    price:
      config.rail === "gateway"
        ? `$${config.price}`
        : {
            asset: "0x3600000000000000000000000000000000000000",
            amount: config.atomicPrice,
            extra: { name: "USDC", version: "2" },
          },
    maxTimeoutSeconds: 120,
  });
  return {
    challenge: (url) =>
      server.createPaymentRequiredResponse(requirements, {
        url,
        description,
        mimeType: "application/json",
      }),
    verify: async (payload) => {
      // Never send a Gateway authorization to the direct facilitator, or vice versa.
      if (
        config.rail === "gateway"
          ? payload.accepted.extra?.name !== "GatewayWalletBatched"
          : payload.accepted.extra?.name !== "USDC" ||
            payload.accepted.extra?.version !== "2"
      )
        return null;
      const matched = server.findMatchingRequirements(requirements, payload);
      if (!matched) return null;
      const result = await server.verifyPayment(payload, matched);
      return result.isValid && !result.skipHandler ? matched : null;
    },
    settle: (payload, requirements) =>
      server.settlePayment(payload, requirements),
    cancel: (payload, requirements) =>
      server
        .createPaymentCancellationDispatcher(payload, requirements)
        .cancel({ reason: "handler_failed", responseStatus: 503 }),
  };
}
