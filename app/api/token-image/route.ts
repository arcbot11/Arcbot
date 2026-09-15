import { NextRequest, NextResponse } from "next/server";
import { fetchPublicImage } from "../../../lib/fetch-public-image";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return NextResponse.json({ error: "Image URL is required" }, { status: 400 });
  try {
    const image = await fetchPublicImage(source);
    return new NextResponse(new Uint8Array(image.bytes), { headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
    } });
  } catch {
    return new NextResponse(null, { status: 307, headers: { location: "/brand/argos-dog-favicon.png", "cache-control": "public, max-age=300" } });
  }
}
