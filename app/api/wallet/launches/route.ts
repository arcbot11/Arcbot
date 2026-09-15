import { advanceLaunch, launchBackend } from "../../../../lib/launches/service";
import { assertLaunchEnabled } from "../../../../lib/launches/execution-checks";
import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import type { Hex } from "viem";
import { websiteSession, WebError, json } from "../../../../lib/otc/http";
import { repository } from "../../../../lib/otc/repository";
import { locked, walletId, type Wallet } from "../../../../lib/otc/model";
import { arcConfigFromEnv } from "../../../../lib/arc/config";
import { createArcRpc } from "../../../../lib/arc/rpc";
import { launchIdentity, parseLaunchInput, type LaunchInput } from "../../../../lib/launches/input";
import { LaunchError, launchPreparationEnabled } from "../../../../lib/launches/policy";
import { verifyLaunchImage } from "../../../../lib/launches/image-preflight";
import { prepareLaunch } from "../../../../lib/launches/prepare";
import { boundedJson, RequestBodyError } from "../../../../lib/bounded-json";

export const runtime = "nodejs";
export const maxDuration = 180;
const payload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), requestId: z.string().uuid(), input: z.unknown() }).strict(),
  z.object({ action: z.literal("update"), requestId: z.string().uuid(), revision: z.number().int().positive().safe(), input: z.unknown() }).strict(),
  z.object({ action: z.literal("prepare"), requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("execute"), requestId: z.string().uuid(), revision: z.number().int().positive().safe() }).strict(),
  z.object({ action: z.literal("resume"), requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("cancel"), requestId: z.string().uuid() }).strict(),
]);
const unavailable = () => json({ error: "Not found." }, 404);
const serialize = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);
function failure(e: unknown, executionRequested=false) {
  if (e instanceof WebError) return json({ error: e.message }, e.status);
  if (e instanceof RequestBodyError) return json({ error: "Invalid launch request body." }, e.status);
  if (e instanceof LaunchError) return json({ error: e.message, code: e.code }, 400);
  if (e instanceof z.ZodError) return json({ error: "Invalid launch request." }, 400);
  // Provider errors may contain credentials or calldata. Never echo or log them.
  return json({ error: executionRequested ? "Launch status could not be confirmed. Reload the saved launch." : "Launch preparation could not be completed. No transaction was submitted." }, 503);
}
function backend() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL, secret = process.env.WEB_AUTH_SECRET;
  if (!url || !secret) throw new Error("Launch storage is unavailable.");
  return { client: new ConvexHttpClient(url), secret };
}
export async function GET(request: NextRequest) {
  if (!launchPreparationEnabled()) return unavailable();
  try {
    const session = await websiteSession(request), requestId = z.string().uuid().parse(request.nextUrl.searchParams.get("requestId"));
    const { client, secret } = backend();
    const draft = await client.query(makeFunctionReference<"query">("launchDrafts:read"), { secret, owner: session.owner, address: session.walletAddress, requestId });
    if(!draft)return unavailable();
    const run=["executing","completed"].includes(draft.status)?await launchBackend(session.owner,session.walletAddress,requestId).read():undefined;
    return json({...draft,...(run?{run}:{})});
  } catch (e) { return failure(e); }
}
export async function POST(request: NextRequest) {
  let executionRequested=false;
  if (!launchPreparationEnabled()) return unavailable();
  try {
    const session = await websiteSession(request, true);
    const body = payload.parse(await boundedJson(request, 8192));
    executionRequested=body.action==="execute"||body.action==="resume";
    const { client, secret } = backend(), args = { secret, owner: session.owner, address: session.walletAddress, requestId: body.requestId };
    if (body.action === "execute" || body.action === "resume") {
      assertLaunchEnabled();
      if(body.action === "execute") await launchBackend(session.owner,session.walletAddress,body.requestId).mutate("accept",{revision:body.revision});
      const run=await advanceLaunch(session.owner,session.walletAddress,body.requestId);
      const draft=await client.query(makeFunctionReference<"query">("launchDrafts:read"),args);
      return json({...draft,run});
    }
    if (body.action === "create") {
      const input = parseLaunchInput(body.input);
      return json(await client.mutation(makeFunctionReference<"mutation">("launchDrafts:create"), { ...args, inputJson: JSON.stringify(input) }));
    }
    if (body.action === "update") {
      const input = parseLaunchInput(body.input);
      return json(await client.mutation(makeFunctionReference<"mutation">("launchDrafts:update"), {
        ...args, revision: body.revision, inputJson: JSON.stringify(input),
      }));
    }
    if (body.action === "cancel") return json(await client.mutation(makeFunctionReference<"mutation">("launchDrafts:cancel"), args));
    const draft = await client.mutation(makeFunctionReference<"mutation">("launchDrafts:beginPreparation"), args) as {
      input: LaunchInput; tokenSalt: Hex; revision: number; status: string; expiresAt: number; prepareToken: string;
    };
    try {
    const image = await verifyLaunchImage(draft.input.imageURI);
    const identity = launchIdentity(session.owner, session.walletAddress), config = arcConfigFromEnv();
    const wallet = await repository().read<Wallet | null>({ id: walletId(5042, identity.address) });
    if (wallet && wallet.owner !== identity.owner) throw new WebError("Wallet ownership could not be verified.", 403);
    const preview = await prepareLaunch({ identity, input: draft.input, tokenSalt: draft.tokenSalt, config, rpc: createArcRpc(config), image,
      reservedWei: wallet ? locked(wallet) : 0n, activeTransaction: Boolean(wallet?.activeTx) });
    // Repeat session/origin/ownership checks after slow RPC work before saving anything.
    const latest = await websiteSession(request, true);
    if (latest.owner !== session.owner || latest.walletAddress !== session.walletAddress) throw new WebError("Reconnect your account.", 401);
    return json(await client.mutation(makeFunctionReference<"mutation">("launchDrafts:savePreview"), { ...args, revision: draft.revision, prepareToken: draft.prepareToken, previewJson: serialize(preview) }));
    } finally {
      // This releases only the computation lease. It never touches funds or signing locks.
      await client.mutation(makeFunctionReference<"mutation">("launchDrafts:endPreparation"), { ...args, prepareToken: draft.prepareToken }).catch(() => {});
    }
  } catch (e) { return failure(e,executionRequested); }
}
