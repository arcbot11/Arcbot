import { openapi } from "@/lib/bridge-api/discovery";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(openapi(), { headers: { "Cache-Control": "no-store" } });
}
