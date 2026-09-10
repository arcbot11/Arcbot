import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ error: "This endpoint is retired. Use the Arc Bot wallet.", url: "https://www.arcchainbot.io/wallet" }, { status: 410, headers: { "cache-control": "no-store" } });
}
export const POST = GET;
