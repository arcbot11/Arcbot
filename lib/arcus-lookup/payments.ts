import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { SERVICE_ICON_URL } from "../service-brand";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { PaymentGateway } from "../bridge-api/payments";
import { DESCRIPTION, SERVICE_NAME } from "../bridge-api/config";
import { lookupExtensions, LOOKUP_TAGS } from "../bridge-api/metadata";
import { arcusConfig, FACILITATOR } from "./config";

export async function arcusGateway(): Promise<PaymentGateway> {
  const config = arcusConfig();
  const server = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: FACILITATOR }),
  ).register("eip155:5042", new ExactEvmScheme());
  await server.initialize();
  const requirements = await server.buildPaymentRequirements({
    scheme: "exact",
    network: "eip155:5042",
    payTo: config.payTo,
    price: {
      asset: "0x3600000000000000000000000000000000000000",
      amount: config.atomicPrice,
      extra: { name: "USDC", version: "2" },
    },
    maxTimeoutSeconds: 120,
  });
  return {
    challenge: (url) =>
      server.createPaymentRequiredResponse(
        requirements,
        {
          url,
          description: DESCRIPTION,
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
        payload.accepted.network !== "eip155:5042" ||
        payload.accepted.extra?.name !== "USDC" ||
        payload.accepted.extra?.version !== "2"
      )
        return null;
      const matched = server.findMatchingRequirements(requirements, payload);
      if (!matched) return null;
      const result = await server.verifyPayment(payload, matched);
      return result.isValid && !result.skipHandler ? matched : null;
    },
    settle: (payload, requirement) =>
      server.settlePayment(payload, requirement),
    // Exact EIP-3009 verification does not reserve or transfer funds.
    cancel: async () => {},
  };
}
