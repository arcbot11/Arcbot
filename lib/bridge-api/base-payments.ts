import { SERVICE_ICON_URL } from "../service-brand";
import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { apiConfig, DESCRIPTION, SERVICE_NAME } from "./config";
import { lookupExtensions, LOOKUP_TAGS } from "./metadata";
import type { PaymentGateway } from "./payments";

export const BASE_NETWORK = "eip155:8453";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export function basePaymentsConfigured() {
  return !!process.env.CDP_API_KEY_ID && !!process.env.CDP_API_KEY_SECRET;
}
export async function basePaymentGateway(
  config = apiConfig(),
  description = DESCRIPTION,
): Promise<PaymentGateway> {
  if (!basePaymentsConfigured())
    throw Error("Base payment credentials unavailable");
  const server = new x402ResourceServer(createCdpFacilitatorClient()).register(
    BASE_NETWORK,
    new ExactEvmScheme(),
  );
  await server.initialize();
  const requirements = await server.buildPaymentRequirements({
    scheme: "exact",
    network: BASE_NETWORK,
    payTo: config.payTo,
    price: {
      asset: BASE_USDC,
      amount: config.atomicPrice,
      extra: { name: "USD Coin", version: "2" },
    },
    maxTimeoutSeconds: 120,
  });
  return {
    challenge: (url) =>
      server.createPaymentRequiredResponse(
        requirements,
        {
          url,
          description,
          mimeType: "application/json",
          serviceName: SERVICE_NAME,
          iconUrl: SERVICE_ICON_URL,
          tags: LOOKUP_TAGS,
        },
        undefined,
        lookupExtensions(),
      ),
    verify: async (payload) => {
      if (
        payload.accepted.network !== BASE_NETWORK ||
        payload.accepted.extra?.name !== "USD Coin" ||
        payload.accepted.extra?.version !== "2" ||
        payload.accepted.extra?.assetTransferMethod
      )
        return null;
      const matched = server.findMatchingRequirements(requirements, payload);
      if (!matched) return null;
      const result = await server.verifyPayment(payload, matched);
      return result.isValid && !result.skipHandler ? matched : null;
    },
    settle: (payload, requirement) =>
      server.settlePayment(payload, requirement),
    cancel: (payload, requirement) =>
      server
        .createPaymentCancellationDispatcher(payload, requirement)
        .cancel({ reason: "handler_failed", responseStatus: 503 }),
  };
}
