import { z } from "zod";
import type { Address, Hex } from "viem";
export const chainSchema = z.union([z.literal(5042), z.literal(8453)]);
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v as Address);
export const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((v) => v as Hex);
const data = z
  .string()
  .max(30000)
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .transform((v) => v as Hex);
const units = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((v) => BigInt(v) < 2n ** 256n);
export const intentSchema = z
  .object({
    chain: chainSchema,
    token: addressSchema,
    account: addressSchema,
    action: z.enum(["register", "deploy", "transfer"]),
    amount: z.string().max(90),
  })
  .strict();
export const routeSchema = z
  .object({
    source: chainSchema,
    destination: chainSchema,
    origin: chainSchema,
    original: addressSchema,
    token: addressSchema,
    counterpart: addressSchema.optional(),
    tokenId: hashSchema,
    manager: addressSchema.optional(),
    destinationManager: addressSchema.optional(),
    name: z.string().max(80),
    symbol: z.string().max(80),
    decimals: z.number().int().min(0).max(18),
    state: z.enum(["register", "deploy", "ready"]),
    compatible: z.boolean(),
    reason: z.string().max(500).optional(),
  })
  .strict();
export const preparedSchema = z
  .object({
    intent: intentSchema,
    route: routeSchema,
    step: z.enum([
      "register",
      "deploy",
      "approve",
      "reset-approval",
      "transfer",
    ]),
    to: addressSchema,
    data,
    value: units,
    gas: units,
    maxFeePerGas: units,
    maxPriorityFeePerGas: units,
    gasBudget: units,
    circleFee: units,
    nonce: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    seal: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export const entrySchema = z
  .object({
    id: z.string().min(1).max(100),
    chain: chainSchema,
    botId: z.string().regex(/^bridge:[0-9a-f]{64}$/).optional(),
    hash: hashSchema.optional(),
    previousHashes: z.array(hashSchema).optional(),
    supersededBy: hashSchema.optional(),
    prepared: preparedSchema.optional(),
    state: z.enum([
      "unknown",
      "pending",
      "forwarding",
      "complete",
      "failed",
      "rejected",
    ]),
    message: z.string().max(5000),
    destinationHash: hashSchema.optional(),
    destination: chainSchema.optional(),
  })
  .refine(
    (e) =>
      !["pending", "forwarding", "complete", "failed"].includes(e.state) ||
      !!e.hash,
    "Confirmed or pending history must retain its source hash",
  )
  .refine(
    (e) => e.state !== "unknown" || !!e.prepared,
    "Unknown requests must retain their review",
  );
export type BridgeEntry = z.infer<typeof entrySchema>;
export const HISTORY_KEY = "argos.external.bridge.v1";
export function compactHistory(next: BridgeEntry[]): BridgeEntry[] {
  const valid = z.array(entrySchema).parse(next);
  if (new Set(valid.map((e) => e.id)).size !== valid.length)
    throw Error("Duplicate bridge operation IDs.");
  const unresolved = valid.filter(
    (e) => !["complete", "failed", "rejected"].includes(e.state),
  );
  if (unresolved.length > 200)
    throw Error("Resolve existing bridge operations before importing more.");
  const terminal = valid.filter((e) =>
    ["complete", "failed", "rejected"].includes(e.state),
  );
  const slots = 200 - unresolved.length;
  const keep = new Set(
    [...unresolved, ...(slots ? terminal.slice(-slots) : [])].map((e) => e.id),
  );
  return parseHistory(JSON.stringify(valid.filter((e) => keep.has(e.id))));
}
export function parseHistory(raw: string | null): BridgeEntry[] {
  if (!raw) return [];
  try {
    if (raw.length > 8_000_000) throw Error();
    const entries = z.array(entrySchema).max(200).parse(JSON.parse(raw));
    if (new Set(entries.map((e) => e.id)).size !== entries.length)
      throw Error();
    return entries;
  } catch {
    throw Error(
      "Saved bridge history is invalid. Preserve it and contact support before submitting.",
    );
  }
}
