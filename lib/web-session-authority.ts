import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { WebWalletSession } from "./web-wallet-session";

export async function checkWebSession(client: ConvexHttpClient, secret: string, session: WebWalletSession, revoke = false) {
  if (session.provider === "telegram") return client.mutation(api.telegramWebAuth.session, {
    secret, sessionIdHash: createHash("sha256").update(session.sessionId).digest("hex"), telegramUserId: session.telegramUserId, revoke,
  });
  return client.action(revoke ? api.wallets.revokeWebSession : api.wallets.verifyWebSession, { secret, sessionId: session.sessionId, ownerXUserId: session.xUserId });
}
