import { NextResponse } from "next/server";
import { ethPrice } from "@/lib/otc/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let cached: { ethUsdMicros: string; priceAt: number } | undefined;
let pending: ReturnType<typeof ethPrice> | undefined;
export async function GET() {
  try {
    if (!cached || Date.now() - cached.priceAt >= 30000) {
      pending ??= ethPrice().finally(() => { pending = undefined; });
      cached = await pending;
    }
    return NextResponse.json(cached, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch {
    return NextResponse.json({ error: "ETH/USD estimate unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
