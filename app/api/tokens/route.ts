import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ARC_TOKEN_CATALOG, canIndexArcToken, compareArcTokenPriority } from "@/lib/arc/token-catalog";
import type { SearchToken } from "@/lib/arc/token-search";

export const revalidate = 60;
export async function GET() {
  let indexed: SearchToken[] = [];
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    try { indexed = await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL).query(makeFunctionReference<"query">("arcTokenCatalog:searchCatalog"), {}); }
    catch { /* The bundled curated index remains searchable during an outage. */ }
  }
  const tokens = [...new Map([...indexed, ...ARC_TOKEN_CATALOG]
    .filter(t => t.chainId === 5042 && canIndexArcToken(t.address, t.symbol))
    .map(t => [t.address.toLowerCase(), { address: t.address, symbol: t.symbol, name: t.name, chainId: 5042 }])).values()].sort(compareArcTokenPriority);
  return NextResponse.json({ tokens }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
