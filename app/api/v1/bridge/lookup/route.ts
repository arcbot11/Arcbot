import { handleLookup } from "@/lib/bridge-api/handler";
import { publicApiCors, publicApiPreflight } from "@/lib/bridge-api/cors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function OPTIONS() { return publicApiPreflight("GET, OPTIONS"); }
export async function GET(req: Request) { return publicApiCors(await handleLookup(req), "GET, OPTIONS"); }
