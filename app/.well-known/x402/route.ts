import { discovery } from "@/lib/bridge-api/discovery";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(discovery(), { headers: { "Cache-Control": "no-store" } }); }
