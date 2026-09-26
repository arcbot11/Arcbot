import { apiConfig } from "@/lib/bridge-api/config";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const c = apiConfig(); return Response.json({ service: "argos-bridge-lookup", enabled: c.enabled, configured: c.configured, note: "Configuration status only; not a live RPC or payment settlement check." }, { status: c.enabled ? 200 : 503, headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ service: "argos-bridge-lookup", enabled: false, configured: false }, { status: 503 }); }
}
