import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ error: "This endpoint is retired. Use the Argos Bot wallet.", url: "https://www.argosbot.io/wallet" }, { status: 410, headers: { "cache-control": "no-store" } });
}
export const POST = GET;
