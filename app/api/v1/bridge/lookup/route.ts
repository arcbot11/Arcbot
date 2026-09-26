import { handleLookup } from "@/lib/bridge-api/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(req: Request) { return handleLookup(req); }
