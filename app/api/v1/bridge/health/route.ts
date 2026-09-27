import { basePaymentsConfigured } from "@/lib/bridge-api/base-payments";
import { apiConfig } from "@/lib/bridge-api/config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const c = apiConfig();
    return Response.json(
      {
        service: "argos-bridge-lookup",
        enabled: c.enabled,
        configured: c.configured,
        payments: {
          base: {
            enabled: c.enabled && basePaymentsConfigured(),
            pricesUSDC: { lookup: c.price, direct: apiConfig("direct").price },
          },
          gateway: { enabled: c.enabled, priceUSDC: c.price },
          direct: {
            enabled: apiConfig("direct").enabled,
            priceUSDC: apiConfig("direct").price,
          },
        },
        note: "Configuration status only; not a live RPC, registration, quota or payment settlement check.",
      },
      {
        status: c.enabled ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { service: "argos-bridge-lookup", enabled: false, configured: false },
      { status: 503 },
    );
  }
}
