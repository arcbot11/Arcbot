import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { OAuthAttempt } from "./x-oauth-attempt";

export type XCheckpoint = { attempt: OAuthAttempt; codeHash?: string; completionProof?: string; accessToken?: string; identity?: { id: string; username: string; verified: boolean; verifiedType?: string }; walletAddress?: string; sessionCookie?: string };
const key = (secret: string) => createHash("sha256").update(`argos-x-oauth-storage:${secret}`).digest();
export function encryptXCheckpoint(value: XCheckpoint, state: string, secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(state));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function decryptXCheckpoint(value: string, state: string, secret: string): XCheckpoint {
  const bytes = Buffer.from(value, "base64url"), decipher = createDecipheriv("aes-256-gcm", key(secret), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(state)); decipher.setAuthTag(bytes.subarray(12, 28));
  const result = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()) as XCheckpoint;
  if (!result.attempt?.verifier || result.attempt.expiresAt <= Date.now()) throw Error("Attempt expired.");
  return result;
}
