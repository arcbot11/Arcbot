import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { tokenUsdEstimate } from "@/lib/arc/token-value";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Public unit price only. No wallet, session or signing data. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || !isAddress(token)) return NextResponse.json({ error: "Invalid token address." }, { status: 400 });
  const value = await tokenUsdEstimate(token, "1");
  return NextResponse.json({ token: token.toLowerCase(), priceUsd: value.usdValue, pricedAt: value.pricedAt }, { headers: { "Cache-Control": "no-store" } });
}
