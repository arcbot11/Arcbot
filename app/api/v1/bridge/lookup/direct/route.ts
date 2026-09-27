import { handleLookup } from "@/lib/bridge-api/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Payment-Signature, Accept, Content-Type",
  "Access-Control-Expose-Headers":
    "Payment-Required, Payment-Response, Retry-After",
};
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...cors, "Cache-Control": "no-store" },
  });
}
export async function GET(req: Request) {
  const response = await handleLookup(req);
  for (const [key, value] of Object.entries(cors))
    response.headers.set(key, value);
  return response;
}
