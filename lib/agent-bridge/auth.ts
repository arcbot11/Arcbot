import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { keccak256, toHex, verifyTypedData, type Hex } from "viem";
import { ORIGIN, serviceSecret } from "./config";
import { ApiError, type JobInput } from "./model";
export const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
          .join(",")}}`
      : JSON.stringify(value);
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const jobId = (input: JobInput) =>
  `ab_${digest([input.account, input.clientRequestId]).slice(0, 48)}`;
export function authorization(intent: JobInput, expiresAt: number) {
  return {
    domain: {
      name: "Argos Bot CTS Bridge API",
      version: "1",
      chainId: intent.chain,
    },
    primaryType: "BridgeJob" as const,
    types: {
      BridgeJob: [
        { name: "origin", type: "string" },
        { name: "intentHash", type: "bytes32" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
    message: {
      origin: ORIGIN,
      intentHash: keccak256(toHex(canonical(intent))),
      expiresAt: String(expiresAt),
    },
  };
}
export async function verifyAuthorization(input: {
  intent: JobInput;
  expiresAt: number;
  signature: Hex;
}) {
  if (
    input.expiresAt <= Date.now() ||
    input.expiresAt > Date.now() + 10 * 60_000
  )
    throw new ApiError(
      "authorization_expired",
      "Wallet authorization expired or too far in the future",
      400,
    );
  if (
    !(await verifyTypedData({
      address: input.intent.account,
      ...authorization(input.intent, input.expiresAt),
      signature: input.signature,
    }))
  )
    throw new ApiError(
      "invalid_authorization",
      "Wallet authorization does not match this job",
      400,
    );
}
export function jobToken(id: string) {
  return createHmac("sha256", serviceSecret())
    .update(`agent-bridge-job:v1:${id}`)
    .digest("hex");
}
export function authorizeJob(id: string, bearer: string | null) {
  const token = bearer?.replace(/^Bearer /, "") || "";
  if (
    !/^ab_[0-9a-f]{48}$/.test(id) ||
    !/^[0-9a-f]{64}$/.test(token) ||
    !timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(jobToken(id), "hex"),
    )
  )
    throw Error("Invalid job access token");
}
