import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lookup } from "@/lib/bridge/read";
import { prepare, revalidate } from "@/lib/bridge/prepare";
import { status } from "@/lib/bridge/status";
import type { Intent, Prepared, BridgeChain } from "@/lib/bridge/contracts";
import type { Address, Hex } from "viem";
import { intentSchema, preparedSchema } from "@/lib/bridge/validation";
import { boundedJson, RequestBodyError } from "@/lib/bounded-json";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chain = z.union([z.literal(5042), z.literal(8453)]);
const intent = intentSchema;
const buckets = new Map<string, { time: number; count: number }>();
const statusBuckets = new Map<string, { time: number; count: number }>();
function limit(req: NextRequest, statusOnly = false) {
  const pool = statusOnly ? statusBuckets : buckets;
  const key = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
    now = Date.now();
  for (const [k, v] of pool) if (now - v.time > 60000) pool.delete(k);
  const b = pool.get(key) || { time: now, count: 0 };
  if (++b.count > (statusOnly ? 120 : 40) || pool.size > 10000)
    throw new RequestBodyError(
      "Too many bridge requests. Try again in a minute.",
      429,
    );
  pool.set(key, b);
}
const json = (body: unknown, code = 200) =>
  NextResponse.json(body, {
    status: code,
    headers: { "Cache-Control": "no-store" },
  });
function failure(e: unknown) {
  if (e instanceof RequestBodyError)
    return json({ error: e.message }, e.status);
  const message =
    e instanceof Error && e.constructor === Error
      ? e.message
      : "Bridge verification failed. Check the network and try again.";
  return json({ error: message.slice(0, 220) }, 400);
}
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    limit(req, q.has("hash"));
    if (q.has("hash"))
      return json(
        await status(
          chain.parse(Number(q.get("chain"))) as BridgeChain,
          z
            .string()
            .regex(/^0x[0-9a-fA-F]{64}$/)
            .parse(q.get("hash")) as Hex,
        ),
      );
    return json(await lookup(address.parse(q.get("token")) as Address));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    limit(req);
    const origin = req.headers.get("origin");
    if (!origin || origin !== req.nextUrl.origin)
      throw Error("Use the bridge from this website.");
    const body = await boundedJson<{
      operation: string;
      intent: unknown;
      prepared: Prepared;
    }>(req, 50000);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw Error("Invalid bridge request.");
    if (body.operation === "prepare")
      return json(await prepare(intent.parse(body.intent) as Intent));
    if (
      body.operation === "revalidate" &&
      body.prepared &&
      typeof body.prepared.seal === "string"
    ) {
      preparedSchema.parse(body.prepared);
      return json(await revalidate(body.prepared as Prepared));
    }
    throw Error("Invalid bridge request.");
  } catch (e) {
    return failure(e);
  }
}
