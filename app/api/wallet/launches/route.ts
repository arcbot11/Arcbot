import { advanceLaunch, launchBackend } from "../../../../lib/launches/service";
import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import { websiteSession, WebError, json } from "../../../../lib/otc/http";
import { LaunchError, launchUserMessage } from "../../../../lib/launches/policy";
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
function failure(e: unknown, executionRequested=false) {
  if (e instanceof WebError) return json({ error: e.message }, e.status);
  if (e instanceof RequestBodyError) return json({ error: "Invalid launch request body." }, e.status);
  if (e instanceof LaunchError) return json({ error: launchUserMessage(e), code: e.code }, 400);
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
  try {
    const session = await websiteSession(request), requestId = z.string().uuid().parse(request.nextUrl.searchParams.get("requestId"));
    const { client, secret } = backend();
    const draft = await client.query(makeFunctionReference<"query">("launchDrafts:read"), { secret, owner: session.owner, address: session.walletAddress, requestId });
    if(!draft)return unavailable();
    const run=["executing","completed","cancelled"].includes(draft.status)?await launchBackend(session.owner,session.walletAddress,requestId).read():undefined;
    return json({...draft,...(run?{run}:{})});
  } catch (e) { return failure(e); }
}
export async function POST(request: NextRequest) {
  let executionRequested=false;
  let acceptanceAttempted=false;
  try {
    const session = await websiteSession(request, true);
    const body = payload.parse(await boundedJson(request, 8192));
    if(body.action!=="resume") return json({error:"Launches start on X. Tag @TheArgosBot with your token details and logo.",acceptance:"rejected"},403);
    executionRequested=body.action==="resume";
    acceptanceAttempted=true;
    const run=await advanceLaunch(session.owner,session.walletAddress,body.requestId);
    const {client,secret}=backend();
    const draft=await client.query(makeFunctionReference<"query">("launchDrafts:read"),{secret,owner:session.owner,address:session.walletAddress,requestId:body.requestId});
    return json({...draft,run});
  } catch (e) {
    const response=failure(e,executionRequested);
    if(!acceptanceAttempted && (e instanceof WebError || e instanceof LaunchError || e instanceof z.ZodError || e instanceof RequestBodyError))
      return json({...await response.json(),acceptance:"rejected"},response.status);
    return response;
  }
}
