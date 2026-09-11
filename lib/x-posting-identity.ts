import { ARC_BOT_X_USER_ID } from "./project-config";

let verified: { credentials: string; expires: number } | undefined;
export function clearXPostingIdentityCache() { verified = undefined; }
/** A rotated access token must be checked before it can publish as this bot. */
export async function verifyXPostingIdentity(credentials: string, read: () => Promise<{ data?: { id?: string } }>, now = Date.now()) {
  if (verified?.credentials === credentials && verified.expires > now) return;
  const result = await read();
  if (result.data?.id !== ARC_BOT_X_USER_ID) throw new Error("X access tokens are not authorized as @TheArgosBot. Reauthorize the bot account.");
  verified = { credentials, expires: now + 60_000 };
}
